// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";

import { MockTransport } from "@av1ation/api";

import { renderWithApi } from "../../test/render";
import { TargetQualityEditor } from "./TargetQualityEditor";
import {
    MetricField,
    metricOptionCount,
    switchMetric,
    strategyEntry,
    withStatistic,
    withStrategy,
} from "./QualityFields";

afterEach(cleanup);

const NO_SCHEMA = { root: {}, node: {} };

function Harness({
    initial,
    locked = false,
}: {
    initial: Record<string, unknown>;
    locked?: boolean;
}) {
    const [draft, setDraft] = useState<Record<string, unknown> | null>(initial);
    if (draft === null) {
        return null;
    }
    return (
        <TargetQualityEditor
            parts={{ target: NO_SCHEMA, bitrate: NO_SCHEMA }}
            draft={draft}
            setDraft={setDraft}
            locked={locked}
            scope="project"
            encoderDocument={null}
        />
    );
}

function targetOff(): Record<string, unknown> {
    return {
        target_quality: null,
        bitrate_optimizer: { bitrate_sigma_threshold: null },
    };
}

it("switches the metric on its own scale instead of keeping the previous range", () => {
    const ssim = switchMetric(undefined, "SSIMULACRA2");
    // The engine's defaults are per metric; carrying 74–76 into VMAF would probe a score
    // scale that cannot be reached.
    expect(switchMetric(ssim, "VMAF")).toEqual({
        VMAF: {
            target_range: [94, 96],
            resolution: null,
            scaler: "bicubic",
            threads: 0,
            model: null,
            features: [],
        },
    });
    expect(switchMetric(ssim, "XPSNR")).toEqual({
        XPSNR: { target_range: [44, 46], resolution: null },
    });
});

it("keeps the shared resolution override when the metric changes", () => {
    const vmaf = switchMetric(undefined, "VMAF");
    const withResolution = {
        VMAF: { ...(vmaf.VMAF as object), resolution: [1280, 720] },
    };
    expect(switchMetric(withResolution, "SSIMULACRA2")).toEqual({
        SSIMULACRA2: {
            target_range: [74, 76],
            resolution: [1280, 720],
            threads: null,
            gpu_id: null,
        },
    });
    // A field the target metric does not declare is dropped, not carried as null: the engine's
    // metric variants reject unknown properties.
    expect(switchMetric(switchMetric(undefined, "SSIMULACRA2"), "VMAF")).not.toHaveProperty(
        "VMAF.gpu_id",
    );
    expect(metricOptionCount(withResolution)).toBe(1);
});

it("writes probe variants in the engine's tagged shape", () => {
    expect(withStrategy(undefined, { key: "Whole" })).toBe("Whole");
    expect(withStrategy("Whole", { key: "Skip", skip: 12 })).toEqual({ Skip: { skip: 12 } });
    // The engine rejects a zero stride; a legacy document is shown and written as one.
    expect(strategyEntry({ Skip: { skip: 0 } }).skip).toBe(1);
    expect(withStrategy("Whole", { key: "Skip", skip: 0 })).toEqual({ Skip: { skip: 1 } });
    expect(
        withStrategy("Whole", { key: "Subset", position: "End", lengthKind: "Frames", length: 9 }),
    ).toEqual({
        Subset: { position: "End", length: { Frames: 9 } },
    });
    // Switching to a variant seeds that variant's own starting value; editing it keeps the
    // number the user typed.
    expect(withStatistic("Mean", "Percentile", 1)).toEqual({ Percentile: 1 });
    expect(withStatistic({ Percentile: 1 }, "Percentile", 5)).toEqual({ Percentile: 5 });
    expect(withStatistic("Mean", "Median", 1)).toBe("Median");
});

it("opens the metric options from the nullable sequence part", () => {
    // The metric lives inside `anyOf [TargetQualityConfig, null]`. Resolving the wrapper and
    // stopping there left `oneOf` undefined, so the disclosure opened onto nothing.
    const root = {
        $defs: {
            TargetQualityConfig: {
                type: "object",
                properties: { metric: { $ref: "#/$defs/QualityMetric" } },
            },
            QualityMetric: {
                oneOf: [
                    {
                        type: "object",
                        additionalProperties: false,
                        properties: { SSIMULACRA2: { $ref: "#/$defs/Ssimulacra2" } },
                        required: ["SSIMULACRA2"],
                    },
                ],
            },
            Ssimulacra2: {
                type: "object",
                additionalProperties: false,
                properties: {
                    target_range: {
                        type: "array",
                        prefixItems: [{ type: "number" }, { type: "number" }],
                    },
                    resolution: { type: ["array", "null"] },
                    threads: { type: ["integer", "null"] },
                    gpu_id: { type: ["integer", "null"] },
                },
                required: ["target_range"],
            },
        },
    };
    const node = {
        anyOf: [{ $ref: "#/$defs/TargetQualityConfig" }, { type: "null" }],
    };

    render(
        <MetricField
            value={{
                SSIMULACRA2: {
                    target_range: [74, 76],
                    resolution: null,
                    threads: null,
                    gpu_id: null,
                },
            }}
            onChange={() => undefined}
            root={root}
            node={node}
            disabled={false}
        />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Metric options/u }));
    expect(screen.getByText("Threads")).toBeTruthy();
    expect(screen.getByText("Resolution")).toBeTruthy();
});

it("disables both target-quality switches while the sequence is locked", () => {
    renderWithApi(<Harness initial={targetOff()} locked />, {
        transport: new MockTransport(),
    });

    const target = screen.getByRole("switch", { name: "Target quality" });
    const bitrate = screen.getByRole("switch", { name: "Bitrate optimization" });
    expect(target.hasAttribute("disabled")).toBe(true);
    expect(bitrate.hasAttribute("disabled")).toBe(true);

    fireEvent.click(target);
    expect(target.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByLabelText("Maximum probes")).toBeNull();
});

it("seeds a complete target document and keeps bitrate optimization independent", () => {
    renderWithApi(<Harness initial={targetOff()} />, { transport: new MockTransport() });

    // Bitrate optimization reads the encoded scene's rate, so it can be configured (and run)
    // without a Target quality probe; it only follows it in pipeline order.
    const bitrate = screen.getByRole("switch", { name: "Bitrate optimization" });
    expect(bitrate.hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("switch", { name: "Target quality" }));

    expect(screen.getByLabelText("Maximum probes")).toHaveProperty("value", "4");
    // Without a catalogue entry the screen uses the AV1 quantizer scale, not x264's 0–51.
    expect(screen.getByLabelText("Quantizer range minimum")).toHaveProperty("value", "0");
    expect(screen.getByLabelText("Quantizer range maximum")).toHaveProperty("value", "63");
    expect(screen.getByLabelText("Quality metric")).toHaveProperty("value", "SSIMULACRA2");
    expect(screen.getByLabelText("Target range minimum")).toHaveProperty("value", "74");

    fireEvent.click(screen.getByRole("switch", { name: "Bitrate optimization" }));
    const threshold = screen.getByLabelText("Bitrate sigma threshold");
    expect(threshold).toHaveProperty("value", "2");

    fireEvent.click(screen.getByRole("switch", { name: "Target quality" }));
    expect(screen.queryByLabelText("Maximum probes")).toBeNull();
    // The optimizer keeps its own threshold and stays editable without the probe.
    expect(screen.getByLabelText("Bitrate sigma threshold")).toHaveProperty("value", "2");
});
