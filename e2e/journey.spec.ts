import { ProjectSummarySchema, RunStartedSchema, VideoSummarySchema } from "@av1ation/contracts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { expectAxeClean } from "./support/axe";

/**
 * The full fake-engine journey.
 *
 * It drives the real SPA and the real HTTP surface: create a project, add a queued video,
 * save the video's General document, validate it, start the run, observe progress and a
 * terminal event through the replay endpoint, then reload History. The completing runner is
 * debug-only; it writes a terminal timeline record but deliberately does not fabricate a
 * Condor checkpoint, so History is the durable completion evidence here.
 */
test("creates, configures, validates, runs, and reloads a fake-engine journey", async ({
    page,
    request,
    hosts,
    journeyFor,
    workspaceFor,
}, testInfo) => {
    test.setTimeout(60_000);
    const serviceOrigin = hosts.complete.origin;
    const workspace = workspaceFor(serviceOrigin);
    const projectName = workspace.name("E2E journey");
    const videoName = "E2E source";
    const outputDir = testInfo.outputDir;
    mkdirSync(outputDir, { recursive: true });
    const sourcePath = join(outputDir, "source.mkv");
    const initialOutput = join(outputDir, "source.av1.mkv");
    const configuredOutput = join(outputDir, "source-configured.av1.mkv");
    writeFileSync(sourcePath, "av1ation-e2e fixture");

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${serviceOrigin}/`);
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expectAxeClean(page, "Projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Project name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("link", { name: projectName })).toBeVisible();

    const projectsResponse = await request.get(`${serviceOrigin}/api/projects`);
    expect(projectsResponse.ok()).toBeTruthy();
    const projects = ProjectSummarySchema.array().parse(await projectsResponse.json());
    const project = projects.find((entry) => entry.name === projectName);
    if (project === undefined) {
        throw new Error("The project created through the UI was not returned by /api/projects.");
    }

    await page.goto(`${serviceOrigin}/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: "Queue", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add videos" }).first().click();
    await expect(page.getByLabel("Input file")).toBeVisible();
    await page.getByLabel("Input file").fill(sourcePath);
    await page.getByLabel("Output file").fill(initialOutput);
    await page.getByLabel("Label").fill(videoName);
    await page.getByRole("button", { name: "Add 1 video" }).click();
    await expect(page.getByText(videoName).first()).toBeVisible();

    const videosResponse = await request.get(`${serviceOrigin}/api/projects/${project.id}/videos`);
    expect(videosResponse.ok()).toBeTruthy();
    const videos = VideoSummarySchema.array().parse(await videosResponse.json());
    const video = videos.find((entry) => entry.name === videoName);
    if (video === undefined) {
        throw new Error("The video added through the queue was not returned by /api/videos.");
    }

    const projectHandle = workspace.trackProject(journeyFor(serviceOrigin).project(project.id));
    const videoHandle = projectHandle.video(video.id);

    await page.goto(`${serviceOrigin}/projects/${project.id}/videos/${video.id}/config/general`);
    await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
    await expectAxeClean(page, "video General");
    const outputField = page.getByLabel("Output file");
    await expect(outputField).toHaveValue(initialOutput);
    await outputField.fill(configuredOutput);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Video General saved").first()).toBeVisible();

    const validation = await videoHandle.validate();
    expect(validation.video_id).toBe(video.id);
    expect(validation.source_exists).toBe(true);
    expect(validation.output_writable).toBe(true);
    expect(validation.scratch_writable).toBe(true);
    expect(validation.blockers, validation.blockers.join("\n")).toEqual([]);
    expect(validation.can_encode).toBe(true);

    const start = page.getByRole("button", { name: "Start", exact: true });
    await expect(start).toBeEnabled();
    const startResponsePromise = page.waitForResponse(
        (response) =>
            response.url().endsWith(`/api/projects/${project.id}/videos/${video.id}/encode`) &&
            response.request().method() === "POST",
    );
    await start.click();
    const startResponse = await startResponsePromise;
    expect(startResponse.status()).toBe(202);
    const started = RunStartedSchema.parse(await startResponse.json());
    expect(started.run_id).not.toBe("");

    // The UI starts the run; the module attaches to that run for replay, state, and history.
    const run = videoHandle.run(started.run_id);
    const events = await run.waitForEvents(["started", "progress"]);
    expect(events.map((event) => event.kind)).toEqual(
        expect.arrayContaining(["started", "progress"]),
    );

    const terminal = await run.waitForTerminal();
    expect(terminal.outcome).toBe("completed");

    const idle = await run.waitForIdle();
    expect(idle.active).toBe(false);

    const history = await run.history();
    expect(history.entries.some((entry) => entry.outcome === "completed")).toBe(true);

    await page.goto(`${serviceOrigin}/projects/${project.id}/videos/${video.id}/history`);
    await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
    await expectAxeClean(page, "video History");
    await expect(page.getByText("SceneDetector").first()).toBeVisible();
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
});
