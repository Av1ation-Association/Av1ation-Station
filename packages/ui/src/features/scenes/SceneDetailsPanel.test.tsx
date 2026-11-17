// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SceneView } from "@av1ation/contracts";

import { SceneDetailsPanel } from "./SceneDetailsPanel";

afterEach(cleanup);

function scene(index: number, overrides: Partial<SceneView> = {}): SceneView {
    return {
        index,
        start_frame: index * 24,
        end_frame: (index + 1) * 24,
        frame_count: 24,
        encoded: false,
        quantizer: null,
        score: null,
        encoder_label: "SVT-AV1",
        encoder_custom: false,
        ...overrides,
    };
}

function renderPanel(
    scenes: SceneView[],
    warnings = 0,
    locked = false,
    customData: Record<string, unknown> = {},
    busy = false,
) {
    const onEditEncoder = vi.fn();
    const onSetRange = vi.fn();
    const onCustomData = vi.fn();
    render(
        <SceneDetailsPanel
            scenes={scenes}
            total={12}
            frameRate={24}
            playhead={12}
            warnings={warnings}
            locked={locked}
            busy={busy}
            onEditEncoder={onEditEncoder}
            onSplit={vi.fn()}
            onMerge={vi.fn()}
            onDelete={vi.fn()}
            onReset={vi.fn()}
            onSetRange={onSetRange}
            customData={customData}
            onCustomData={onCustomData}
            canUndo
            onUndo={vi.fn()}
        />,
    );
    return { onEditEncoder, onSetRange, onCustomData };
}

describe("SceneDetailsPanel", () => {
    it("shows exact values for one scene and opens the encoder sheet", () => {
        const { onEditEncoder } = renderPanel([
            scene(0, {
                encoded: true,
                chunk_bytes: 2_048,
                quantizer: 24,
                score: 92,
            }),
        ]);

        expect(screen.getByText("Scene 01")).toBeDefined();
        expect(screen.getByText("SVT-AV1")).toBeDefined();
        expect(screen.getByText(/Inherited from the video/)).toBeDefined();
        expect(screen.getByText("Target quality")).toBeDefined();
        expect(screen.getByText("Q24")).toBeDefined();
        expect(screen.getByText("Mean score 92.0")).toBeDefined();
        expect(screen.getByText("Quality check has not run.")).toBeDefined();
        expect(screen.getByText("Noise Detector has not run.")).toBeDefined();
        expect(screen.getByText("2 KB")).toBeDefined();
        expect(screen.getByText("24 frames · 0:01.0")).toBeDefined();
        expect(screen.getByText("00:00:00.0")).toBeDefined();

        fireEvent.click(screen.getByRole("button", { name: "Change" }));
        expect(onEditEncoder).toHaveBeenCalledTimes(1);
    });

    it("commits an edited boundary once, and only once the service can confirm it", () => {
        const { onSetRange } = renderPanel([scene(0)]);
        const end = screen.getByRole("textbox", { name: "End frame" });

        fireEvent.change(end, { target: { value: "200" } });
        end.focus();
        // Enter blurs, and the blur handler is the one that commits. Calling commit twice
        // here used to send two PATCHes for one edit.
        fireEvent.keyDown(end, { key: "Enter" });

        expect(onSetRange).toHaveBeenCalledTimes(1);
        expect(onSetRange).toHaveBeenCalledWith(0, 201);
        expect((end as HTMLInputElement).value).toBe("23");
    });

    it("aggregates a range and badges a mixed encoder", () => {
        renderPanel([
            scene(0, { quantizer: 20, score: 88 }),
            scene(1, {
                quantizer: 30,
                score: 96,
                encoder_label: "x265",
                encoder_custom: true,
            }),
        ]);

        expect(screen.getByText("2 scenes")).toBeDefined();
        expect(screen.getByText("Mixed")).toBeDefined();
        expect(screen.getByText("mixed")).toBeDefined();
        expect(screen.getByText(/1 of 2 custom/)).toBeDefined();
        expect(screen.getByText("Q20–Q30")).toBeDefined();
        expect(screen.getByText("Mean score 88.0–96.0")).toBeDefined();
        expect(screen.getByText("No retained chunks yet.")).toBeDefined();
        expect(screen.getByText("48 frames · 0:02.0")).toBeDefined();
    });

    it("shows quality-check and noise values beside their absent reasons", () => {
        renderPanel([
            scene(0, {
                quality_score: 88,
                noise: 12.4,
                noise_scaler: 1.2,
                chunk_bytes: 2_048,
                encoded: true,
                encode_ms: 1_500,
            }),
        ]);

        expect(screen.getByText("Quality check")).toBeDefined();
        expect(screen.getByText("88.0")).toBeDefined();
        expect(screen.getByText("Noise")).toBeDefined();
        expect(screen.getByText("12.40")).toBeDefined();
        expect(screen.getByText("Scale ×1.20")).toBeDefined();
        expect(screen.getByText("2 KB")).toBeDefined();
    });

    it("keeps the action visible but unavailable while a run holds the lock", () => {
        renderPanel([scene(0)], 1, true);

        expect(screen.getByText("1 invalid boundary")).toBeDefined();
        const action = screen.getByRole("button", { name: "Change" });
        expect(action.hasAttribute("disabled")).toBe(true);
        expect(action.getAttribute("data-tip")).toContain("configuration cannot change");
    });

    it("disables its editors while another scene edit is being written", () => {
        renderPanel([scene(0)], 0, false, {}, true);

        expect(screen.getByRole("textbox", { name: "Start frame" }).hasAttribute("disabled")).toBe(
            true,
        );
        expect(screen.getByRole("button", { name: "Change" }).hasAttribute("disabled")).toBe(true);
        expect(
            screen
                .getByRole("button", {
                    name: "Delete this scene; its frames become uncovered",
                })
                .hasAttribute("disabled"),
        ).toBe(true);
        expect(screen.getByText("Saving the last scene edit…")).toBeDefined();
    });

    it("saves an edited number as a number, not a parsed guess", () => {
        const { onCustomData } = renderPanel([scene(0)], 0, false, { gain: 1.5 });
        const value = screen.getByRole("textbox", { name: "Custom value 1" });

        fireEvent.change(value, { target: { value: "2.5" } });
        fireEvent.blur(value);

        expect(onCustomData).toHaveBeenCalledTimes(1);
        expect(onCustomData).toHaveBeenCalledWith({ gain: 2.5 });
    });

    it("adds a string that keeps its text, so `true` stays a word", () => {
        const { onCustomData } = renderPanel([scene(0)]);
        fireEvent.click(screen.getByRole("button", { name: "Add String" }));

        const key = screen.getByRole("textbox", { name: "Custom key 1" });
        const value = screen.getByRole("textbox", { name: "Custom value 1" });
        fireEvent.change(key, { target: { value: "label" } });
        fireEvent.change(value, { target: { value: "true" } });
        fireEvent.blur(value);

        expect(onCustomData).toHaveBeenCalledWith({ label: "true" });
    });

    it("adds a number from its own row", () => {
        const { onCustomData } = renderPanel([scene(0)]);
        fireEvent.click(screen.getByRole("button", { name: "Add Number" }));

        fireEvent.change(screen.getByRole("textbox", { name: "Custom key 1" }), {
            target: { value: "gain" },
        });
        const value = screen.getByRole("textbox", { name: "Custom value 1" });
        fireEvent.change(value, { target: { value: "-2.5" } });
        fireEvent.blur(value);

        expect(onCustomData).toHaveBeenLastCalledWith({ gain: -2.5 });
    });

    it("adds a boolean as a switch and commits its state", () => {
        const { onCustomData } = renderPanel([scene(0)]);
        fireEvent.click(screen.getByRole("button", { name: "Add Boolean" }));

        const key = screen.getByRole("textbox", { name: "Custom key 1" });
        fireEvent.change(key, { target: { value: "invert" } });
        fireEvent.blur(key);

        const toggle = screen.getByRole("switch", { name: "Custom value 1" });
        expect(toggle.getAttribute("aria-checked")).toBe("false");
        fireEvent.click(toggle);

        expect(onCustomData).toHaveBeenLastCalledWith({ invert: true });
    });

    it("refuses a key the engine writes and leaves the draft in place", () => {
        const { onCustomData } = renderPanel([scene(0)]);
        fireEvent.click(screen.getByRole("button", { name: "Add String" }));

        const key = screen.getByRole("textbox", { name: "Custom key 1" });
        const value = screen.getByRole("textbox", { name: "Custom value 1" });
        fireEvent.change(key, { target: { value: "scene_detection" } });
        fireEvent.change(value, { target: { value: "anything" } });
        fireEvent.blur(value);

        expect(onCustomData).not.toHaveBeenCalled();
        expect(screen.getByRole("alert").textContent).toContain("written by the engine");
        expect((key as HTMLInputElement).value).toBe("scene_detection");
    });
});
