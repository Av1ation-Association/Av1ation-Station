import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { expectAxeClean } from "./support/axe";

/**
 * The Logs journey: filter one run, then review the anonymised export.
 *
 * The completing fake runner writes a debug source-path detail into its JSONL log. The default
 * level filter hides it, so the journey first proves the filter is server-side, then enables
 * Debug and proves the export replaces the stored path before the preview reaches the user.
 */
test("filters a log and previews an export with no paths", async ({
    page,
    hosts,
    workspaceFor,
}, testInfo) => {
    test.setTimeout(60_000);
    const serviceOrigin = hosts.complete.origin;
    const workspace = workspaceFor(serviceOrigin);
    const outputDir = testInfo.outputDir;
    mkdirSync(outputDir, { recursive: true });
    const sourcePath = join(outputDir, "log-source.mkv");
    writeFileSync(sourcePath, "av1ation-e2e log fixture");

    const project = await workspace.createProject("E2E log export");
    const video = await project.addVideo({
        name: "E2E log source",
        inputPath: sourcePath,
        outputPath: join(outputDir, "log-source.av1.mkv"),
    });
    const run = await video.startRun();
    expect((await run.waitForTerminal()).outcome).toBe("completed");
    await run.waitForIdle();

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${serviceOrigin}/projects/${project.id}/videos/${video.id}/logs`);
    await expect(page.getByRole("heading", { name: "Logs", exact: true })).toBeVisible();
    await expect(page.getByText("Fake encode started")).toBeVisible();
    await expectAxeClean(page, "video Logs");

    const search = page.getByLabel("Search the log");
    await search.fill("started");
    await expect(page.getByText("1 matching line", { exact: true })).toBeVisible();
    await expect(page.getByRole("log").getByText("Fake encode started")).toBeVisible();
    await expect(page.getByRole("log").getByText("Fake encode progress")).toHaveCount(0);

    // Clear the search, then opt into the debug line that carries the source path. The
    // export always reads the whole file, not the filtered page.
    await page.getByRole("button", { name: "Clear the search" }).click();
    await page.getByRole("button", { name: "Debug", exact: true }).click();
    await expect(page.getByRole("log").getByText(`Source file: ${sourcePath}`)).toBeVisible();

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Export this run" });
    await expect(sheet).toBeVisible();
    const preview = sheet.locator("pre");
    await expect(preview).toContainText("<PATH:1>");
    const exported = (await preview.textContent()) ?? "";
    expect(exported).not.toContain(sourcePath);
    expect(exported).not.toMatch(/[A-Z]:\\/u);
    await expect(sheet.getByText("1 value redacted", { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
});
