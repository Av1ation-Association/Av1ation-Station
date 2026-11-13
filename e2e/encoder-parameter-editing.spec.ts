import { EncoderDescriptorSchema } from "@av1ation/contracts";
import { encoderParametersPath, encodersPath } from "@av1ation/api/paths";

import { expect, test } from "./fixtures";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * The encoder-parameter journey: find a built-in descriptor in Settings → Encoders, edit
 * its label through the parameter sheet, commit the descriptor map from the top bar, and
 * prove the API and a reload see it. The override is restored before the test ends so a
 * global catalogue edit cannot leak into another journey.
 */
test("edits a built-in encoder parameter and restores the engine descriptors", async ({
    page,
    request,
    hosts,
}) => {
    test.setTimeout(60_000);
    const serviceOrigin = hosts.complete.origin;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const catalogueResponse = await request.get(`${serviceOrigin}${encodersPath()}`);
    expect(catalogueResponse.ok()).toBeTruthy();
    const catalogue = EncoderDescriptorSchema.array().parse(await catalogueResponse.json());
    const builtIn = catalogue.filter((encoder) => !encoder.fork);
    const target = builtIn.find((encoder) => Object.keys(encoder.parameters).length > 0);
    if (target === undefined) {
        throw new Error("The encoder catalogue has no built-in descriptor to edit.");
    }
    const parameterKey = Object.keys(target.parameters)[0];
    if (parameterKey === undefined) {
        throw new Error("The selected encoder has no parameter key.");
    }
    const descriptor = target.parameters[parameterKey];
    if (descriptor === undefined) {
        throw new Error("The selected encoder parameter has no descriptor.");
    }
    const originalLabel = descriptor.label;
    const editedLabel = `${originalLabel} E2E`;
    const firstBuiltInId = builtIn[0]?.id;

    const selectTarget = async () => {
        if (target.id !== firstBuiltInId) {
            await page
                .getByRole("button", { name: new RegExp(`\\b${escapeRegExp(target.id)}\\b`, "u") })
                .first()
                .click();
        }
    };

    let restored = false;
    try {
        await page.goto(`${serviceOrigin}/settings#encoders`);
        await expect(page.getByRole("heading", { name: "Parameters", exact: true })).toBeVisible();
        await selectTarget();

        const search = page.getByLabel("Search parameters");
        await search.fill(parameterKey);
        const row = page.getByRole("button", {
            name: new RegExp(`\\(${escapeRegExp(parameterKey)}\\) Edit$`, "u"),
        });
        await expect(row).toBeVisible();
        await row.click();

        const dialog = page.getByRole("dialog", { name: "Edit parameter" });
        await expect(dialog).toBeVisible();
        await dialog.getByLabel("Label").fill(editedLabel);
        await dialog.getByRole("button", { name: "Save parameter", exact: true }).click();
        await expect(dialog).toBeHidden();

        const save = page.getByRole("button", { name: "Save", exact: true });
        await expect(save).toBeEnabled();
        const parametersSaved = page.waitForResponse(
            (response) =>
                response.url().endsWith(encoderParametersPath(target.id)) &&
                response.request().method() === "PUT",
        );
        await save.click();
        expect((await parametersSaved).status()).toBe(204);

        const editedResponse = await request.get(`${serviceOrigin}${encodersPath()}`);
        expect(editedResponse.ok()).toBeTruthy();
        const edited = EncoderDescriptorSchema.array().parse(await editedResponse.json());
        const editedTarget = edited.find((encoder) => encoder.id === target.id);
        expect(editedTarget?.parameters[parameterKey]?.label).toBe(editedLabel);

        await page.reload();
        await expect(page.getByRole("heading", { name: "Parameters", exact: true })).toBeVisible();
        await selectTarget();
        await page.getByLabel("Search parameters").fill(parameterKey);
        const editedRow = page.getByRole("button", {
            name: new RegExp(`\\(${escapeRegExp(parameterKey)}\\) Edit$`, "u"),
        });
        await expect(editedRow).toContainText(editedLabel);

        const restore = page.getByRole("button", { name: "Restore engine descriptors" });
        await expect(restore).toBeVisible();
        const parametersRestored = page.waitForResponse(
            (response) =>
                response.url().endsWith(encoderParametersPath(target.id)) &&
                response.request().method() === "DELETE",
        );
        await restore.click();
        expect((await parametersRestored).status()).toBe(204);
        restored = true;

        const restoredResponse = await request.get(`${serviceOrigin}${encodersPath()}`);
        expect(restoredResponse.ok()).toBeTruthy();
        const restoredCatalogue = EncoderDescriptorSchema.array().parse(
            await restoredResponse.json(),
        );
        const restoredTarget = restoredCatalogue.find((encoder) => encoder.id === target.id);
        expect(restoredTarget?.parameters[parameterKey]?.label).toBe(originalLabel);
        expect(pageErrors).toEqual([]);
    } finally {
        if (!restored) {
            await request.delete(`${serviceOrigin}${encoderParametersPath(target.id)}`);
        }
    }
});
