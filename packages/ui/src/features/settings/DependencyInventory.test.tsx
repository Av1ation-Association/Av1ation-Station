// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ZodType } from "zod";

import { MockTransport } from "@av1ation/api";
import type { PreflightCheck, PreflightReport } from "@av1ation/contracts";

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
