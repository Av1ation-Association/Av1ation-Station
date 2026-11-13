import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { expectAxeClean } from "./support/axe";

/**
 * Navigation stays available while the holding fake runner owns the singleton. The run
 * chip must survive leaving the video and reopen it, and Stop must then cancel the run.
 *
 * Project/video setup and the start call go through the real HTTP surface so this journey
 * focuses on what the browser must prove: the run chip, the dirty-draft guard, and Stop.
 * The completion journey keeps the UI's create/add/Start flow covered.
 */
test("navigates away from a running encode and cancels it from the video", async ({
    page,
    hosts,
    workspaceFor,
}, testInfo) => {
    test.setTimeout(60_000);
    const holdingServiceOrigin = hosts.holding.origin;
    const workspace = workspaceFor(holdingServiceOrigin);
    const projectName = workspace.name("E2E navigation");
    const videoName = "E2E holding source";
    const outputDir = testInfo.outputDir;
    mkdirSync(outputDir, { recursive: true });
    const sourcePath = join(outputDir, "holding-source.mkv");
    const outputPath = join(outputDir, "holding-source.av1.mkv");
    writeFileSync(sourcePath, "av1ation-e2e holding fixture");

    const project = await workspace.createProject("E2E navigation");
    const video = await project.addVideo({
        name: videoName,
        inputPath: sourcePath,
        outputPath,
    });

    const siblingSourcePath = join(outputDir, "sibling-source.mkv");
    const siblingOutputPath = join(outputDir, "sibling-source.av1.mkv");
    const savedSiblingOutput = join(outputDir, "sibling-saved.av1.mkv");
    writeFileSync(siblingSourcePath, "av1ation-e2e sibling fixture");
    const sibling = await project.addVideo({
        name: "E2E sibling source",
        inputPath: siblingSourcePath,
        outputPath: siblingOutputPath,
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${holdingServiceOrigin}/projects/${project.id}/videos/${video.id}`);
    await expect(page.getByRole("heading", { name: "Pipeline", exact: true })).toBeVisible();
    await expectAxeClean(page, "video pipeline");

    const header = page.locator("header");
    const start = header.getByRole("button", { name: "Start", exact: true });
    await expect(start).toBeEnabled();

    const run = await video.startRun();

    const stop = header.getByRole("button", { name: "Stop", exact: true });
    await expect(stop).toBeEnabled({ timeout: 10_000 });
    const runChip = header.getByRole("link", { name: /^Encoding /u });
    await expect(runChip).toBeVisible();

    const events = await run.waitForEvents(["started", "progress"]);
    expect(events.map((event) => event.kind)).toEqual(
        expect.arrayContaining(["started", "progress"]),
    );

    const active = await video.state();
    expect(active.active).toBe(true);

    // Leaving the video is allowed; the dirty-draft guard must not treat the running
    // encode as an unsaved edit, and the run chip must remain the way back.
    await page.getByRole("link", { name: projectName, exact: true }).click();
    await expect(page).toHaveURL(`${holdingServiceOrigin}/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: "Queue", exact: true })).toBeVisible();
    await expect(runChip).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    // A sibling video stays editable while the run owns the project. Open it through the
    // router, not a full reload, so the in-memory run chip remains available. Making its
    // output draft dirty and clicking the run chip then exercises the navigation guard;
    // Stay keeps the draft and Discard returns to the running video.
    await page.getByRole("link", { name: /^E2E sibling source/u }).click();
    await expect(page).toHaveURL(
        `${holdingServiceOrigin}/projects/${project.id}/videos/${sibling.id}`,
    );
    await page.getByRole("link", { name: /^General/u }).click();
    await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
    await expectAxeClean(page, "video General");
    await page.getByLabel("Output file").fill(join(outputDir, "sibling-configured.av1.mkv"));
    await expect(header.getByRole("button", { name: "Save", exact: true })).toBeEnabled();

    const unsaved = page.locator("dialog[open]").filter({ hasText: /unsaved/u });
    await runChip.click();
    await expect(unsaved).toBeVisible();
    await expect(page).toHaveURL(
        `${holdingServiceOrigin}/projects/${project.id}/videos/${sibling.id}/config/general`,
    );
    await unsaved.getByRole("button", { name: "Stay and keep editing" }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page).toHaveURL(
        `${holdingServiceOrigin}/projects/${project.id}/videos/${sibling.id}/config/general`,
    );

    await runChip.click();
    await expect(unsaved).toBeVisible();
    await unsaved.getByRole("button", { name: "Discard changes" }).click();
    await expect(page).toHaveURL(
        `${holdingServiceOrigin}/projects/${project.id}/videos/${video.id}`,
    );
    await expect(stop).toBeEnabled();

    // The guard also owns the other exit: save the draft, then navigate only after the
    // service accepted it. Reopen the sibling and make a change that the test can read
    // back over HTTP, so a dialog that merely closed cannot pass.
    await page.getByRole("link", { name: projectName, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Queue", exact: true })).toBeVisible();
    await page.getByRole("link", { name: /^E2E sibling source/u }).click();
    await page.getByRole("link", { name: /^General/u }).click();
    await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
    await page.getByLabel("Output file").fill(savedSiblingOutput);
    await expect(header.getByRole("button", { name: "Save", exact: true })).toBeEnabled();

    await runChip.click();
    await expect(unsaved).toBeVisible();
    await unsaved.getByRole("button", { name: "Save and leave" }).click();
    await expect(page).toHaveURL(
        `${holdingServiceOrigin}/projects/${project.id}/videos/${video.id}`,
    );
    const savedGeneral = await sibling.general();
    expect((savedGeneral.output as { path?: string }).path).toBe(savedSiblingOutput);
    await expect(stop).toBeEnabled();

    const cancelResponsePromise = page.waitForResponse(
        (response) =>
            response.url().endsWith(`/api/projects/${project.id}/videos/${video.id}/encode`) &&
            response.request().method() === "DELETE",
    );
    await stop.click();
    const cancelResponse = await cancelResponsePromise;
    expect(cancelResponse.status()).toBe(202);

    const terminal = await run.waitForTerminal();
    expect(terminal.outcome).toBe("cancelled");

    const idle = await run.waitForIdle();
    expect(idle.active).toBe(false);

    const history = await run.history();
    expect(history.entries.some((entry) => entry.outcome === "cancelled")).toBe(true);

    await page.goto(`${holdingServiceOrigin}/projects/${project.id}/videos/${video.id}/history`);
    await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
    await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
    await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
});
