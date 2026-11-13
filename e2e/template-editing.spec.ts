import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { GeneralDefaultsSchema, ProjectTemplateSchema } from "@av1ation/contracts";
import { templateGeneralPath, templatePath } from "@av1ation/api/paths";

import { expect, test } from "./fixtures";

/**
 * The template editing journey: create a template in Settings, open its General section,
 * change the output policy, save, and prove both the API and a reload carry the value.
 * The template is deleted in `finally` because templates are global machine state, unlike
 * the project workspaces the other journeys create.
 */
test("edits a project template's General defaults and reloads them", async ({
    page,
    request,
    hosts,
}, testInfo) => {
    test.setTimeout(60_000);
    const serviceOrigin = hosts.complete.origin;
    const templateName = `E2E template ${randomUUID().slice(0, 8)}`;
    const outputFolder = join(testInfo.outputDir, "template-output");
    mkdirSync(outputFolder, { recursive: true });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    let templateId: string | undefined;
    try {
        await page.goto(`${serviceOrigin}/settings#project-templates`);
        await expect(page.getByRole("button", { name: "Add template" })).toBeVisible();
        await page.getByRole("button", { name: "Add template" }).click();

        const dialog = page.getByRole("dialog", { name: "Add a project template" });
        await expect(dialog).toBeVisible();
        await dialog.getByRole("textbox").fill(templateName);

        const created = page.waitForResponse(
            (response) =>
                response.url().endsWith("/api/settings/templates") &&
                response.request().method() === "POST",
        );
        await dialog.getByRole("button", { name: "Create", exact: true }).click();
        const createdResponse = await created;
        expect(createdResponse.status()).toBe(201);
        const template = ProjectTemplateSchema.parse(await createdResponse.json());
        templateId = template.id;

        await expect(page.getByRole("link", { name: templateName })).toBeVisible();
        await page.getByRole("link", { name: templateName }).click();
        await expect(page).toHaveURL(`${serviceOrigin}/settings/templates/${template.id}`);
        await page.locator('a[href$="/general"]').click();
        await expect(page).toHaveURL(`${serviceOrigin}/settings/templates/${template.id}/general`);

        const specificFolder = page.getByRole("radio", { name: /Specific folder/u });
        await expect(specificFolder).toBeVisible();
        await specificFolder.click();
        await page.getByLabel("Output folder").fill(outputFolder);

        const save = page.getByRole("button", { name: "Save", exact: true });
        await expect(save).toBeEnabled();
        const saved = page.waitForResponse(
            (response) =>
                response.url().endsWith(templateGeneralPath(template.id)) &&
                response.request().method() === "PUT",
        );
        await save.click();
        expect((await saved).status()).toBe(200);

        const generalResponse = await request.get(
            `${serviceOrigin}${templateGeneralPath(template.id)}`,
        );
        expect(generalResponse.ok()).toBeTruthy();
        const general = GeneralDefaultsSchema.parse(await generalResponse.json());
        expect(general.output_mode).toBe("folder");
        expect(general.output_folder).toBe(outputFolder);

        await page.reload();
        await expect(page.getByLabel("Output folder")).toHaveValue(outputFolder);
        expect(pageErrors).toEqual([]);
    } finally {
        if (templateId !== undefined) {
            await request.delete(`${serviceOrigin}${templatePath(templateId)}`);
        }
    }
});
