// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ZodType } from "zod";

import { MockTransport } from "@av1ation/api";

import { renderWithApi } from "../../test/render";
import { AppearancePanel } from "./AppearancePanel";

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

class RecordingSettingsTransport extends MockTransport {
    readonly saved: Array<Record<string, unknown>> = [];

    override async patchJson<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        if (path === "/api/settings") {
            this.saved.push(body as Record<string, unknown>);
        }
        return super.patchJson(path, body, schema);
    }
}

it("saves only the theme choice", async () => {
    const transport = new RecordingSettingsTransport();
    renderWithApi(<AppearancePanel />, { transport });

    await screen.findByRole("heading", { name: "Theme" });
    fireEvent.click(screen.getByRole("radio", { name: /Light/ }));

    await waitFor(() => {
        expect(transport.saved).toEqual([{ theme: "light" }]);
    });
    await waitFor(() =>
        expect(screen.getByRole("radio", { name: /Light/ }).getAttribute("aria-checked")).toBe(
            "true",
        ),
    );
});

class FailingSettingsTransport extends MockTransport {
    override async patchJson<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        if (path === "/api/settings") {
            throw new Error("disk full");
        }
        return super.patchJson(path, body, schema);
    }
}

it("keeps a failed appearance save visible", async () => {
    renderWithApi(<AppearancePanel />, { transport: new FailingSettingsTransport() });

    await screen.findByRole("heading", { name: "Theme" });
    fireEvent.click(screen.getByRole("checkbox", { name: /Reduce motion/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("disk full");
});
