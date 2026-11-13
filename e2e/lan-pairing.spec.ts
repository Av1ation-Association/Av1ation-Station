import { ProjectSummarySchema, VideoSummarySchema } from "@av1ation/contracts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { expectAxeClean } from "./support/axe";
import { guardExternalRequests } from "./support/network";

/**
 * A second browser reaches the host through the authenticated LAN listener.
 *
 * It has its own session storage, so it starts at the pairing form instead of the shell.
 * The test exchanges the code the desktop would show, then creates a project and a video
 * from that origin. Creation matters: a paired page is a plain-HTTP non-secure context, and
 * the browser's `crypto.randomUUID` is unavailable there. A read-only journey would miss
 * the fallback.
 */
test("pairs a second browser over LAN and creates a project and video", async ({
    browser,
    request,
    hosts,
    journeyFor,
    workspaceFor,
}, testInfo) => {
    test.setTimeout(60_000);
    const serviceOrigin = hosts.lan.origin;
    const lan = hosts.lan.lan;
    if (lan === undefined) {
        throw new Error("The LAN host did not publish its pairing origin.");
    }

    const workspace = workspaceFor(serviceOrigin);
    const projectName = workspace.name("E2E LAN");
    const videoName = "E2E LAN source";
    const outputDir = testInfo.outputDir;
    mkdirSync(outputDir, { recursive: true });
    const sourcePath = join(outputDir, "lan-source.mkv");
    const outputPath = join(outputDir, "lan-source.av1.mkv");
    writeFileSync(sourcePath, "av1ation-e2e LAN fixture");

    const pageErrors: string[] = [];
    const context = await browser.newContext();
    try {
        const external = await guardExternalRequests(
            context,
            Object.values(hosts).flatMap((host) => [
                host.origin,
                ...(host.lan === undefined ? [] : [host.lan.origin]),
            ]),
        );
        const lanPage = await context.newPage();
        lanPage.on("pageerror", (error) => pageErrors.push(error.message));

        await lanPage.goto(`${lan.origin}/`);
        await expect(lanPage.getByRole("heading", { name: "Pair this browser" })).toBeVisible();
        await expectAxeClean(lanPage, "LAN pairing");

        await lanPage.getByLabel("Pairing code or link").fill(lan.shortcode);
        await lanPage.getByRole("button", { name: "Pair", exact: true }).click();
        await expect(lanPage.getByRole("heading", { name: "Projects", exact: true })).toBeVisible({
            timeout: 15_000,
        });
        await expectAxeClean(lanPage, "LAN Projects");

        await lanPage.getByRole("button", { name: "New project" }).first().click();
        await lanPage.getByLabel("Project name").fill(projectName);
        await lanPage.getByRole("button", { name: "Create project" }).click();
        await expect(lanPage.getByRole("link", { name: projectName })).toBeVisible();

        const projectsResponse = await request.get(`${serviceOrigin}/api/projects`);
        expect(projectsResponse.ok()).toBeTruthy();
        const projects = ProjectSummarySchema.array().parse(await projectsResponse.json());
        const project = projects.find((entry) => entry.name === projectName);
        if (project === undefined) {
            throw new Error("The project created through LAN was not returned by the host.");
        }
        workspace.trackProject(journeyFor(serviceOrigin).project(project.id));

        await lanPage.getByRole("link", { name: projectName }).click();
        await expect(lanPage.getByRole("heading", { name: "Queue", exact: true })).toBeVisible();
        await lanPage.getByRole("button", { name: "Add videos" }).first().click();
        await expect(lanPage.getByLabel("Input file")).toBeVisible();
        await lanPage.getByLabel("Input file").fill(sourcePath);
        await lanPage.getByLabel("Output file").fill(outputPath);
        await lanPage.getByLabel("Label").fill(videoName);
        await lanPage.getByRole("button", { name: "Add 1 video" }).click();
        await expect(lanPage.getByText(videoName).first()).toBeVisible();
        await expectAxeClean(lanPage, "LAN project queue");

        const videosResponse = await request.get(
            `${serviceOrigin}/api/projects/${project.id}/videos`,
        );
        expect(videosResponse.ok()).toBeTruthy();
        const videos = VideoSummarySchema.array().parse(await videosResponse.json());
        expect(videos.some((entry) => entry.name === videoName)).toBe(true);

        // The token lives in session storage, not the address bar, so a reload remains paired.
        await lanPage.reload();
        await expect(lanPage.getByRole("heading", { name: "Queue", exact: true })).toBeVisible();
        expect(new URL(lanPage.url()).hash).toBe("");
        expect(pageErrors).toEqual([]);
        expect(external).toEqual([]);
    } finally {
        await context.close();
    }
});
