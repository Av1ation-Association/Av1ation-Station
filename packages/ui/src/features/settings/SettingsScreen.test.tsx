// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MockTransport } from "@av1ation/api";

import { renderRoute } from "../../test/render";
import { SettingsScreen } from "./SettingsScreen";
import { SETTINGS_TABS, SETTINGS_TAB_SLUGS, type SettingsTab } from "./settings-tabs";

/** Text only the named panel renders; the tab strip alone cannot satisfy these. */
const PANEL_MARKERS: Record<SettingsTab, string> = {
    Appearance: "Row density",
    Dependencies: "TransNetV2 model",
    Encoders: "Parameters",
    "Project Templates": "Add template",
    Storage: "Application data",
    Network: "LAN access",
    About: "Export a bundle for a bug report",
};

describe("SettingsScreen", () => {
    it.each(SETTINGS_TABS)("mounts the %s panel named by its hash", async (tab) => {
        renderRoute(<SettingsScreen />, {
            transport: new MockTransport(),
            route: "/settings",
            initialEntry: `/settings#${SETTINGS_TAB_SLUGS[tab]}`,
            stubs: ["/settings/encoders/$encoderId/json"],
            topBar: true,
        });

        expect(await screen.findByRole("tab", { name: tab, selected: true })).toBeTruthy();
        expect(await screen.findByText(PANEL_MARKERS[tab])).toBeTruthy();
        // Exactly one panel mounts, so a later hash cannot leave the previous panel behind.
        for (const [other, marker] of Object.entries(PANEL_MARKERS)) {
            if (other !== tab) {
                expect(screen.queryByText(marker)).toBeNull();
            }
        }
    });

    it("switches from Appearance to Network through the tab strip", async () => {
        const view = renderRoute(<SettingsScreen />, {
            transport: new MockTransport(),
            route: "/settings",
            initialEntry: "/settings#appearance",
            stubs: ["/settings/encoders/$encoderId/json"],
            topBar: true,
        });

        expect(await screen.findByRole("tab", { name: "Appearance", selected: true })).toBeTruthy();
        expect(await screen.findByText("Row density")).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: "Network" }));

        await waitFor(() => {
            expect(screen.getByRole("tab", { name: "Network", selected: true })).toBeTruthy();
            expect(view.router.state.location.hash).toBe("network");
        });
        expect(await screen.findByText("LAN access")).toBeTruthy();
        expect(screen.queryByText("Row density")).toBeNull();
    });
});
