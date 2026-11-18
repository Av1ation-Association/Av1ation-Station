import { randomUUID } from "node:crypto";

import { AppSettingsSchema, ProjectTemplateExportSchema } from "@av1ation/contracts";
import {
    settingsPath,
    templateExportPath,
    templatePath,
    templatesImportPath,
} from "@av1ation/api/paths";
import type { JSHandle, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

interface DropFile {
    readonly name: string;
    readonly text: string;
}

/** Build a browser-side file list the drop handler can read like an OS drag. */
async function transferWith(
    page: Page,
    files: readonly DropFile[],
): Promise<JSHandle<DataTransfer>> {
    return page.evaluateHandle((entries) => {
        const transfer = new DataTransfer();
        for (const entry of entries) {
            transfer.items.add(new File([entry.text], entry.name, { type: "application/json" }));
        }
        return transfer;
    }, files);
}

/**
 * The drag-and-drop journey: the screen names the drop target while a file drag is over it,
 * imports a multi-file drop, and refuses more than ten files before reading any of them.
 * The host is freshly seeded for each suite, so its first template supplies a valid archive
 * without creating another row; only the imported rows need cleanup.
 */
test("drops template files, shows the overlay, and refuses more than ten", async ({
    page,
    request,
    hosts,
}) => {
    test.setTimeout(60_000);
    const serviceOrigin = hosts.complete.origin;
    const suffix = randomUUID().slice(0, 8);
    const first = `E2E Drop ${suffix} One`;
    const second = `E2E Drop ${suffix} Two`;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    try {
        const settingsResponse = await request.get(`${serviceOrigin}${settingsPath()}`);
        expect(settingsResponse.ok()).toBeTruthy();
        const [source] = AppSettingsSchema.parse(await settingsResponse.json()).project_templates;
        if (source === undefined) {
            throw new Error("The E2E host seeded no template to export.");
        }

        const exportedResponse = await request.get(
            `${serviceOrigin}${templateExportPath(source.id)}`,
        );
        expect(exportedResponse.ok()).toBeTruthy();
        const exported = ProjectTemplateExportSchema.parse(await exportedResponse.json());
        const archive = (name: string) =>
            JSON.stringify({
                ...exported.archive,
                template: { ...exported.archive.template, name },
            });
        const files = [first, second].map((name, index) => ({
            name: `drop-${String(index)}.json`,
            text: archive(name),
        }));

        await page.goto(`${serviceOrigin}/settings#project-templates`);
        const section = page.getByRole("region", { name: "Project templates" });
        const overlay = page.getByText("Drop to import templates");
        await expect(section).toBeVisible();

        const importRequests: string[] = [];
        page.on("request", (outgoing) => {
            if (outgoing.method() === "POST" && outgoing.url().endsWith(templatesImportPath())) {
                importRequests.push(outgoing.url());
            }
        });

        const twoFiles = await transferWith(page, files);
        await section.dispatchEvent("dragenter", { dataTransfer: twoFiles });
        await expect(overlay).toBeVisible();
        await expect(page.getByText("Up to 10 .json files", { exact: true })).toBeVisible();

        await section.dispatchEvent("dragover", { dataTransfer: twoFiles });
        await section.dispatchEvent("drop", { dataTransfer: twoFiles });

        await expect(page.getByRole("link", { name: first, exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: second, exact: true })).toBeVisible();
        await expect(overlay).toHaveCount(0);
        expect(importRequests).toHaveLength(2);
        await twoFiles.dispose();

        importRequests.length = 0;
        const tooMany = await transferWith(
            page,
            Array.from({ length: 11 }, (_, index) => ({
                name: `too-many-${String(index)}.json`,
                text: "{}",
            })),
        );
        await section.dispatchEvent("dragenter", { dataTransfer: tooMany });
        await expect(overlay).toBeVisible();
        await section.dispatchEvent("drop", { dataTransfer: tooMany });

        const limit = page
            .getByRole("alert")
            .filter({ hasText: "Choose at most 10 template files at a time." });
        await expect(limit).toBeVisible();
        await expect(limit).toContainText("Choose the files again.");
        expect(importRequests).toEqual([]);
        await tooMany.dispose();
        expect(pageErrors).toEqual([]);
    } finally {
        const settings = await request.get(`${serviceOrigin}${settingsPath()}`);
        if (settings.ok()) {
            for (const template of AppSettingsSchema.parse(await settings.json())
                .project_templates) {
                if ([first, second].includes(template.name)) {
                    await request.delete(`${serviceOrigin}${templatePath(template.id)}`);
                }
            }
        }
    }
});
