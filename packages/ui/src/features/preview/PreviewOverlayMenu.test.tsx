// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MockTransport } from "@av1ation/api";
import type { AppSettings, PreviewOverlaySettings } from "@av1ation/contracts";

import { renderWithApi } from "../../test/render";
import { PreviewOverlayMenu } from "./PreviewOverlayMenu";

const OVERLAY: PreviewOverlaySettings = {
    enabled: false,
    target_quality: true,
    quality_check: true,
    noise: true,
    chunk: false,
    encoder: false,
    live_stage: true,
    progress: true,
    fps_eta: false,
};

function previewTransport(): MockTransport {
    const transport = new MockTransport({ mediaUrl: () => "blob:preview" });
    const settings = structuredClone(transport.routes.get("/api/settings") as AppSettings);
    settings.preview_overlay = OVERLAY;
    transport.routes.set("/api/settings", settings);
    return transport;
}

function savedSettings(transport: MockTransport): AppSettings {
    return structuredClone(transport.routes.get("/api/settings") as AppSettings);
}

describe("PreviewOverlayMenu", () => {
    it("saves the master switch and a field change without a Save button", async () => {
        const transport = previewTransport();
        renderWithApi(<PreviewOverlayMenu />, { transport });

        const trigger = await screen.findByRole("button", { name: "Preview overlay" });
        fireEvent.click(trigger);
        const master = await screen.findByRole("switch", {
            name: "Show the preview overlay",
        });
        expect(master.getAttribute("aria-checked")).toBe("false");

        fireEvent.click(master);
        await waitFor(() => expect(savedSettings(transport).preview_overlay?.enabled).toBe(true));

        const noise = await screen.findByRole("checkbox", { name: "Noise" });
        await waitFor(() => expect(noise.hasAttribute("disabled")).toBe(false));
        fireEvent.click(noise);
        await waitFor(() => expect(savedSettings(transport).preview_overlay?.noise).toBe(false));
    });

    it("keeps the control disabled with an explanation where the host has no preview", () => {
        renderWithApi(<PreviewOverlayMenu />, { transport: new MockTransport() });

        const button = screen.getByRole("button", { name: "Preview overlay" });
        expect(button.hasAttribute("disabled")).toBe(true);
        expect(button.parentElement?.getAttribute("data-tip")).toBe(
            "Preview overlay needs the desktop preview surface",
        );
    });
});
