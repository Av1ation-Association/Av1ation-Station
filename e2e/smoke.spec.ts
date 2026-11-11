import { expect, test } from "@playwright/test";

test("creates a project against the real service and opens Settings", async ({ page, request }) => {
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    const body = (await health.json()) as { name: string; api_version: number };
    expect(body.name).toBe("Av1ation Station");
    expect(body.api_version).toBeGreaterThan(0);

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(page.getByText("No projects yet")).toBeVisible();

    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Project name").fill("Smoke project");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("link", { name: "Smoke project" })).toBeVisible();

    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings/u);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeAttached();
    expect(pageErrors).toEqual([]);
});
