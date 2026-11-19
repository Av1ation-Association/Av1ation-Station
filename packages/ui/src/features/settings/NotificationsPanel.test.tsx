// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MockTransport } from "@av1ation/api";
import type { AppSettings } from "@av1ation/contracts";

import { renderWithApi } from "../../test/render";
import { NotificationsPanel } from "./NotificationsPanel";

function desktopTransport(): MockTransport {
    return new MockTransport({}, { notify: vi.fn(async () => undefined) });
}

function savedSettings(transport: MockTransport): AppSettings {
    return structuredClone(transport.routes.get("/api/settings") as AppSettings);
}

describe("NotificationsPanel", () => {
    it("enables notifications and saves an event choice immediately", async () => {
        const transport = desktopTransport();
        renderWithApi(<NotificationsPanel />, { transport });

        const master = await screen.findByRole("switch", {
            name: "Show desktop notifications for runs",
        });
        expect(master.getAttribute("aria-checked")).toBe("false");
        await waitFor(() => expect(master.hasAttribute("disabled")).toBe(false));
        fireEvent.click(master);
        await waitFor(() =>
            expect(savedSettings(transport).desktop_notifications?.enabled).toBe(true),
        );

        const started = await screen.findByRole("checkbox", { name: /A run starts/ });
        await waitFor(() => expect(started.hasAttribute("disabled")).toBe(false));
        fireEvent.click(started);
        await waitFor(() =>
            expect(savedSettings(transport).desktop_notifications?.started).toBe(false),
        );
    });

    it("explains the disabled controls in a host without a notification surface", async () => {
        renderWithApi(<NotificationsPanel />, { transport: new MockTransport() });

        expect(
            await screen.findByText(/Desktop notifications are available in the desktop/),
        ).toBeTruthy();
        expect(
            screen
                .getByRole("switch", { name: "Show desktop notifications for runs" })
                .hasAttribute("disabled"),
        ).toBe(true);
    });
});
