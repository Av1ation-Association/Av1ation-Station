import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROUTE_CASES } from "../packages/ui/src/test/route-cases";
import {
    SETTINGS_TABS,
    SETTINGS_TAB_SLUGS,
    type SettingsTab,
} from "../packages/ui/src/features/settings/settings-tabs";
import { expect, test } from "./fixtures";
import { expectAxeClean } from "./support/axe";

/**
 * The real browser's route sweep.
 *
 * The jsdom pass is a fast pre-check; it cannot measure contrast or target size. This sweep
 * uses the real service, one project, and one video so every screen settles into its data
 * branch, then audits each route family plus every Settings hash. The four-state matrix and
 * the screen suites still own behaviour; this owns layout and colour in Chromium.
 */
const PANEL_MARKERS: Record<SettingsTab, string> = {
    Appearance: "Row density",
    Dependencies: "TransNetV2 model",
    Encoders: "Parameters",
    "Project Templates": "Add template",
    Storage: "Application data",
    Network: "LAN access",
    About: "Export a bundle for a bug report",
};

test("audits every route family and Settings tab in Chromium", async ({
    page,
    hosts,
    workspaceFor,
}, testInfo) => {
    test.setTimeout(180_000);
    const origin = hosts.complete.origin;
    const workspace = workspaceFor(origin);
    const project = await workspace.createProject("A11y route sweep");
    mkdirSync(testInfo.outputDir, { recursive: true });
    const sourcePath = join(testInfo.outputDir, "sweep-source.mkv");
    writeFileSync(sourcePath, "av1ation-a11y-source");
    const video = await project.addVideo({
        name: "A11y sweep source",
        inputPath: sourcePath,
        outputPath: join(testInfo.outputDir, "sweep-output.av1.mkv"),
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const routes = ROUTE_CASES.map((routeCase) => ({
        ...routeCase,
        path: routeCase.path
            .replaceAll("demo-project", project.id)
            .replaceAll("demo-video", video.id),
    }));

    for (const routeCase of routes) {
        await page.goto(`${origin}${routeCase.path}`);
        await expect(page.getByRole("main")).toBeVisible();
        // The route matrix's shared loading marker. Waiting for it to clear keeps axe from
        // auditing a skeleton while the populated branch is still arriving. Closed sheets
        // keep their own loading branch mounted and hidden; only a visible one is the page.
        await expect(page.locator('[aria-busy="true"]:visible')).toHaveCount(0, {
            timeout: 15_000,
        });
        // The source is a tiny stand-in rather than decodable media, so the preview's
        // unsupported-source alert is expected on the video routes. Axe still audits it.
        await expectAxeClean(page, routeCase.name);
    }

    // A hash is part of the interaction: each one has to mount its own panel, not only
    // select a tab in the strip. The panel marker is the proof that the hash was consumed.
    for (const tab of SETTINGS_TABS) {
        await page.goto(`${origin}/settings#${SETTINGS_TAB_SLUGS[tab]}`);
        await expect(page.getByRole("tab", { name: tab, selected: true })).toBeVisible();
        await expect(page.getByText(PANEL_MARKERS[tab], { exact: false }).first()).toBeVisible();
        await expect(page.locator('[role="alert"]')).toHaveCount(0);
        await expectAxeClean(page, `Settings · ${tab}`);
    }

    expect(pageErrors).toEqual([]);
});
