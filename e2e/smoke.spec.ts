import { ProjectSummarySchema } from "@av1ation/contracts";

import { expect, test } from "./fixtures";

test("creates a project against the real service and opens Settings", async ({
    page,
    request,
    hosts,
    journeyFor,
    workspaceFor,
}) => {
    const serviceOrigin = hosts.complete.origin;
    const workspace = workspaceFor(serviceOrigin);
    const projectName = workspace.name("Smoke project");
    const health = await request.get(`${serviceOrigin}/api/health`);
    expect(health.ok()).toBeTruthy();
    const body = (await health.json()) as { name: string; api_version: number };
    expect(body.name).toBe("Av1ation Station");
    expect(body.api_version).toBeGreaterThan(0);

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${serviceOrigin}/`);
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();

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
    workspace.trackProject(journeyFor(serviceOrigin).project(project.id));

    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings/u);
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeAttached();
    expect(pageErrors).toEqual([]);
});
