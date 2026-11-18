import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
    AppSettingsSchema,
    GeneralDefaultsSchema,
    ProjectTemplateExportSchema,
    ProjectTemplateImportResultSchema,
    ProjectTemplateSchema,
} from "@av1ation/contracts";
import {
    settingsPath,
    templateExportPath,
    templateGeneralPath,
    templatePath,
    templatesDefaultPath,
    templatesImportPath,
    templatesPath,
} from "@av1ation/api/paths";

import { expect, test } from "./fixtures";

/**
 * The template portability journey: a folder-backed template exports as a portable file with
 * its host path removed, and re-importing that exact download creates a suffixed row without
 * moving the default marker. The template is global machine state, so both rows and the
 * previous default are restored in `finally`.
 */
test("exports a template with a removed path and imports it under a suffixed name", async ({
    page,
    request,
    hosts,
}, testInfo) => {
    test.setTimeout(60_000);
    const serviceOrigin = hosts.complete.origin;
    const suffix = randomUUID().slice(0, 8);
    const templateName = `E2E Portable ${suffix}`;
    const importedName = `${templateName} (2)`;
    const expectedFilename = `e2e-portable-${suffix}-template.json`;
    const outputFolder = join(testInfo.outputDir, "portable-output");
    mkdirSync(outputFolder, { recursive: true });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    let templateId: string | undefined;
    let importedId: string | undefined;
    let previousDefaultId: string | null | undefined;

    try {
        const initialResponse = await request.get(`${serviceOrigin}${settingsPath()}`);
        expect(initialResponse.ok()).toBeTruthy();
        previousDefaultId = AppSettingsSchema.parse(
            await initialResponse.json(),
        ).default_project_template_id;

        const created = await request.post(`${serviceOrigin}${templatesPath()}`, {
            data: { name: templateName },
        });
        expect(created.status()).toBe(201);
        const template = ProjectTemplateSchema.parse(await created.json());
        templateId = template.id;

        const general = GeneralDefaultsSchema.parse({
            ...template.general,
            output_mode: "folder",
            output_folder: outputFolder,
        });
        const written = await request.put(`${serviceOrigin}${templateGeneralPath(template.id)}`, {
            data: general,
        });
        expect(written.ok()).toBeTruthy();

        const marked = await request.put(`${serviceOrigin}${templatesDefaultPath()}`, {
            data: { id: template.id },
        });
        expect(marked.ok()).toBeTruthy();

        await page.goto(`${serviceOrigin}/settings#project-templates`);
        const nameLink = page.getByRole("link", { name: templateName, exact: true });
        await expect(nameLink).toBeVisible();
        const defaultButton = page.getByRole("button", {
            name: `${templateName} is the default template`,
            exact: true,
        });
        await expect(defaultButton).toHaveAttribute("aria-pressed", "true");

        const exportResponsePromise = page.waitForResponse(
            (response) =>
                response.url().endsWith(templateExportPath(template.id)) &&
                response.request().method() === "GET",
        );
        await page.getByRole("button", { name: `Export ${templateName}`, exact: true }).click();
        const exportResponse = await exportResponsePromise;
        expect(exportResponse.status()).toBe(200);
        const exported = ProjectTemplateExportSchema.parse(await exportResponse.json());
        expect(exported.filename).toBe(expectedFilename);
        expect(exported.report.removed).toEqual(["Output folder"]);
        expect(exported.archive.template.general.output_folder).toBeUndefined();

        const report = page.getByRole("dialog", { name: `Export “${templateName}”?` });
        await expect(report).toBeVisible();
        await expect(report.getByRole("heading", { name: "Included in the file" })).toBeVisible();
        await expect(
            report.getByRole("heading", { name: "Removed for portability" }),
        ).toBeVisible();
        await expect(report.getByText("Output folder", { exact: true })).toBeVisible();
        await expect(report).not.toContainText(outputFolder);

        const downloadPromise = page.waitForEvent("download");
        await report.getByRole("button", { name: "Download", exact: true }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe(expectedFilename);
        expect(await download.failure()).toBeNull();
        const downloadedPath = await download.path();
        if (downloadedPath === null) {
            throw new Error("Playwright did not retain the exported template file.");
        }

        const chooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "More template actions", exact: true }).click();
        await page.getByRole("menuitem", { name: "Import template…", exact: true }).click();
        const chooser = await chooserPromise;

        const importResponsePromise = page.waitForResponse(
            (response) =>
                response.url().endsWith(templatesImportPath()) &&
                response.request().method() === "POST",
        );
        await chooser.setFiles({
            name: expectedFilename,
            mimeType: "application/json",
            buffer: readFileSync(downloadedPath),
        });
        const importResponse = await importResponsePromise;
        expect(importResponse.status()).toBe(201);
        const imported = ProjectTemplateImportResultSchema.parse(await importResponse.json());
        importedId = imported.template.id;
        expect(imported.template.name).toBe(importedName);

        await expect(page.getByRole("link", { name: importedName, exact: true })).toBeVisible();
        await expect(
            page.getByRole("button", {
                name: `${importedName} is the default template`,
                exact: true,
            }),
        ).toHaveCount(0);
        await expect(defaultButton).toHaveAttribute("aria-pressed", "true");

        const afterResponse = await request.get(`${serviceOrigin}${settingsPath()}`);
        expect(afterResponse.ok()).toBeTruthy();
        expect(
            AppSettingsSchema.parse(await afterResponse.json()).default_project_template_id,
        ).toBe(template.id);
        expect(pageErrors).toEqual([]);
    } finally {
        if (templateId !== undefined) {
            await request.put(`${serviceOrigin}${templatesDefaultPath()}`, {
                data: { id: previousDefaultId ?? null },
            });
        }
        for (const id of [importedId, templateId]) {
            if (id !== undefined) {
                await request.delete(`${serviceOrigin}${templatePath(id)}`);
            }
        }
    }
});
