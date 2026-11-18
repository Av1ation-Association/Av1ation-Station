// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ZodType } from "zod";

import { MockTransport } from "@av1ation/api";
import type { PreflightCheck, PreflightReport } from "@av1ation/contracts";

import { TopBarTargetContext } from "../../shared/TopBarActions";
import { renderWithApi } from "../../test/render";
import { DependencyInventory, Diagnostics, LoadingSettings } from "./DependencyInventory";

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

function check(
    overrides: Partial<PreflightCheck> & Pick<PreflightCheck, "id" | "label">,
): PreflightCheck {
    return {
        capability: "application",
        available: false,
        detail: "not found",
        ...overrides,
    };
}

function report(checks: PreflightCheck[]): PreflightReport {
    return {
        checks,
        available_count: checks.filter((entry) => entry.available).length,
        total_count: checks.length,
    };
}

function renderInventory(value: PreflightReport) {
    return renderWithApi(<DependencyInventory report={value} />, {
        transport: new MockTransport(),
    });
}

it("says when preflight reported no executable probes", () => {
    renderInventory(report([]));

    screen.getByText("No executable probes were reported.");
    screen.getByText("Run preflight again to probe this machine.");
});

it("groups checks by capability and keeps unknown capabilities under Other", () => {
    renderInventory(
        report([
            check({
                id: "scene-model",
                label: "Scene model probe",
                capability: "application",
                available: true,
            }),
            check({
                id: "vapoursynth",
                label: "VapourSynth",
                capability: "decode",
                available: true,
                detail: "Core R82",
            }),
            check({
                id: "encoder:svt-av1",
                label: "SVT-AV1",
                capability: "encode",
                available: true,
                detail: "SVT-AV1 2.0",
            }),
            check({
                id: "metric:vmaf",
                label: "VMAF",
                capability: "metric",
                available: true,
                detail: "libvmaf 3.0",
            }),
            check({
                id: "custom:thing",
                label: "Custom thing",
                capability: "unknown",
                detail: "not found",
            }),
        ]),
    );

    screen.getByRole("heading", { name: "Decode" });
    screen.getByRole("heading", { name: "AV1 encoding" });
    screen.getByRole("heading", { name: "Metrics" });
    screen.getByRole("heading", { name: "Other" });
    screen.getByText("Custom thing");
    expect(screen.queryByText("Scene model probe")).toBeNull();
});

it("shows the dependency loading skeleton", () => {
    const view = render(<LoadingSettings />);

    expect(view.container.querySelector('[aria-busy="true"]')).not.toBeNull();
});

class RecordingDependencyTransport extends MockTransport {
    readonly writes: string[] = [];
    readonly custom: Array<{ kind: string; path: string }> = [];

    override async putJson<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        if (path === "/api/settings/tool-source") {
            this.writes.push((body as { id: string }).id);
        }
        return super.putJson(path, body, schema);
    }

    override async post<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        if (path === "/api/preflight/custom") {
            this.custom.push(body as { kind: string; path: string });
        }
        return super.post(path, body, schema);
    }
}

function providerCheck(id: string, label: string): PreflightCheck {
    return check({
        id,
        label,
        capability: id === "vapoursynth" ? "decode" : "metric",
        available: true,
        detail: "system build",
        selected_source: "system",
        providers: [
            {
                source: "bundled",
                available: true,
                detail: "bundled build",
                active: false,
                checked: true,
            },
            {
                source: "system",
                available: true,
                detail: "system build",
                active: true,
                checked: true,
            },
        ],
    });
}

it("keeps provider changes in a page draft and discards both together", async () => {
    const target = document.createElement("div");
    document.body.append(target);
    renderWithApi(
        <TopBarTargetContext.Provider value={target}>
            <DependencyInventory
                report={report([
                    providerCheck("vapoursynth", "VapourSynth"),
                    providerCheck("metric:vmaf", "VMAF"),
                ])}
            />
        </TopBarTargetContext.Provider>,
        { transport: new MockTransport() },
    );

    screen.getByText("VapourSynth").closest("summary")?.click();
    screen.getByText("VMAF").closest("summary")?.click();
    const bundled = screen.getAllByRole<HTMLButtonElement>("radio", { name: /^Bundled/u });
    bundled.forEach((button) => fireEvent.click(button));

    await screen.findByText(/Save to use the bundled runtime/u);
    fireEvent.click(within(target).getByRole("button", { name: "Discard" }));

    await waitFor(() => {
        expect(
            screen
                .getAllByRole<HTMLButtonElement>("radio", { name: /^System/u })
                .every((button) => button.getAttribute("aria-checked") === "true"),
        ).toBe(true);
    });
});

it("saves every drafted provider when the page Save is pressed", async () => {
    const target = document.createElement("div");
    document.body.append(target);
    const transport = new RecordingDependencyTransport();
    renderWithApi(
        <TopBarTargetContext.Provider value={target}>
            <DependencyInventory
                report={report([
                    providerCheck("vapoursynth", "VapourSynth"),
                    providerCheck("metric:vmaf", "VMAF"),
                ])}
            />
        </TopBarTargetContext.Provider>,
        { transport },
    );

    screen.getByText("VapourSynth").closest("summary")?.click();
    screen.getByText("VMAF").closest("summary")?.click();
    screen
        .getAllByRole<HTMLButtonElement>("radio", { name: /^Bundled/u })
        .forEach((button) => fireEvent.click(button));

    fireEvent.click(within(target).getByRole("button", { name: "Save" }));

    await waitFor(() => {
        expect(transport.writes).toEqual(["vapoursynth", "metric:vmaf"]);
    });
});

it("probes a located executable without accepting it until Save", async () => {
    const target = document.createElement("div");
    document.body.append(target);
    const picked = "C:/Tools/MKVToolNix/mkvmerge.exe";
    const transport = new RecordingDependencyTransport({}, { pickExecutable: async () => picked });
    renderWithApi(
        <TopBarTargetContext.Provider value={target}>
            <DependencyInventory
                report={report([
                    check({
                        id: "mkvmerge",
                        label: "MKVToolNix",
                        capability: "muxing",
                        detail: "mkvmerge not found on PATH",
                        remediation: "Install MKVToolNix and put `mkvmerge` on PATH.",
                    }),
                ])}
            />
        </TopBarTargetContext.Provider>,
        { transport },
    );

    const row = screen.getByText("MKVToolNix").closest("details");
    if (row === null) {
        throw new Error("the MKVToolNix row did not render");
    }
    fireEvent.click(within(row).getByRole("button", { name: /Locate/ }));
    await screen.findByText(/passed the probe\. Save to use it/u);
    expect(transport.custom).toEqual([]);
    expect(within(target).getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(
        false,
    );

    fireEvent.click(within(target).getByRole("button", { name: "Save" }));
    await waitFor(() => {
        expect(transport.custom).toEqual([{ kind: "mkvmerge", path: picked }]);
    });
});

class FailingRefreshTransport extends MockTransport {
    override async post<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        if (path === "/api/preflight/refresh") {
            throw new Error("service offline");
        }
        return super.post(path, body, schema);
    }
}

it("surfaces a failed preflight refresh beside the diagnosis", async () => {
    renderWithApi(<Diagnostics report={report([])} />, {
        transport: new FailingRefreshTransport(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Run preflight" }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert.textContent).toContain("service offline"));
});
