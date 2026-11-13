// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

import { MockTransport } from "@av1ation/api";

import { renderWithApi } from "../../test/render";
import { DependencyRow } from "./DependencyRow";

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

/** Records the provider request so the test can see which row the screen named. */
class RecordingTransport extends MockTransport {
    readonly saved: Array<{
        id: string;
        source: "bundled" | "system" | null;
    }> = [];

    override async putJson<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        if (path === "/api/settings/tool-source") {
            this.saved.push(body as { id: string; source: "bundled" | "system" | null });
        }
        return super.putJson(path, body, schema);
    }
}

it("saves the VapourSynth provider choice and asks for the restart it needs", async () => {
    const restart = vi.fn(async () => {});
    const transport = new RecordingTransport({}, { restartApp: restart });
    renderWithApi(
        <DependencyRow
            check={{
                id: "vapoursynth",
                label: "VapourSynth",
                capability: "decode",
                available: true,
                detail: "Core R80 · API 4.3",
                selected_source: "system",
                configured_source: "bundled",
                providers: [
                    {
                        source: "bundled",
                        available: true,
                        detail: "Bundled runtime · C:/Program Files/AV1ation/tools/python",
                        active: false,
                        checked: true,
                    },
                    {
                        source: "system",
                        available: true,
                        detail: "VapourSynth R82",
                        active: true,
                        checked: true,
                    },
                ],
            }}
        />,
        { transport },
    );

    // A healthy row still opens: it has no remediation, but it does have a provider choice.
    screen.getByText("VapourSynth").closest("summary")?.click();

    const bundled = screen.getByRole<HTMLButtonElement>("radio", {
        name: /^Bundled/u,
    });
    bundled.click();
    await waitFor(() => {
        expect(transport.saved).toEqual([{ id: "vapoursynth", source: "bundled" }]);
    });

    // VSScript initialises once per process, so the saved choice must not claim to be live,
    // and the desktop host can apply it without asking the user to quit manually.
    screen.getByText(/Restart the application to use the bundled runtime/u);
    screen.getByRole("button", { name: /Restart now/u }).click();
    expect(restart).toHaveBeenCalledOnce();
});

it("names the metric row so the service can validate its own bundled library", async () => {
    const transport = new RecordingTransport();
    renderWithApi(
        <DependencyRow
            check={{
                id: "metric:vmaf",
                label: "VMAF",
                capability: "metric",
                available: true,
                detail: "libvmaf 3.0",
                selected_source: "system",
                configured_source: "bundled",
                providers: [
                    {
                        source: "bundled",
                        available: true,
                        detail: "Bundled library · C:/AV1ation/tools/lib/libvmaf.dll",
                        active: false,
                        checked: true,
                    },
                    {
                        source: "system",
                        available: true,
                        detail: "libvmaf 3.0",
                        active: true,
                        checked: true,
                    },
                ],
            }}
        />,
        { transport },
    );

    screen.getByText("VMAF").closest("summary")?.click();
    const bundled = screen.getByRole<HTMLButtonElement>("radio", {
        name: /^Bundled/u,
    });
    bundled.click();

    // The shared settings key is `metrics`; the request must still name the row, because
    // only that id says which bundled library the choice has to resolve.
    screen.getByText(/Restart the application to use the bundled metric libraries/u);
    await waitFor(() => {
        expect(transport.saved).toEqual([{ id: "metric:vmaf", source: "bundled" }]);
    });
});

it("does not offer a Bundled runtime this target does not carry", async () => {
    renderWithApi(
        <DependencyRow
            check={{
                id: "vapoursynth",
                label: "VapourSynth",
                capability: "decode",
                available: true,
                detail: "Core R82 · API 4.3",
                selected_source: "system",
                providers: [
                    {
                        source: "system",
                        available: true,
                        detail: "VapourSynth R82",
                        active: true,
                        checked: true,
                    },
                ],
            }}
        />,
        { transport: new MockTransport() },
    );

    screen.getByText("VapourSynth").closest("summary")?.click();

    const bundled = screen.getByRole<HTMLButtonElement>("radio", { name: /^Bundled/u });
    const system = screen.getByRole<HTMLButtonElement>("radio", { name: /^System/u });
    // Only System resolves on this target; the missing Bundled runtime stays visible but
    // disabled, with the row saying why it cannot be chosen.
    expect(system.disabled).toBe(false);
    expect(bundled.disabled).toBe(true);
    expect(screen.getByText(/does not carry a bundled VapourSynth runtime/u)).toBeTruthy();
});

it("probes and accepts the located executable without a second button", async () => {
    const picked = "C:/Tools/MKVToolNix/mkvmerge.exe";
    renderWithApi(
        <DependencyRow
            check={{
                id: "mkvmerge",
                label: "MKVToolNix",
                capability: "muxing",
                available: false,
                detail: "mkvmerge not found on PATH",
                remediation: "Install MKVToolNix and put `mkvmerge` on PATH.",
            }}
        />,
        { transport: new MockTransport({}, { pickExecutable: async () => picked }) },
    );

    screen.getByRole("button", { name: /Locate/ }).click();

    await screen.findByText(/is the provider now/u);
    expect(screen.queryByRole("button", { name: /Probe and use/u })).toBeNull();
});
