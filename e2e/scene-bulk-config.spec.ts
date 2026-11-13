import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixtures";

/**
 * The scene multi-select journey: one bulk encoder write, one undo entry.
 *
 * Two ranges are seeded over HTTP because the fake engine deliberately fabricates no Condor
 * checkpoint. The browser then owns the selection, scope choice, parameter edit, and undo;
 * the typed scene reads prove the undo restored both rows, not only the last one written.
 */
test("bulk-configures selected scenes and restores them with one undo", async ({
    page,
    hosts,
    workspaceFor,
}, testInfo) => {
    test.setTimeout(60_000);
    const serviceOrigin = hosts.complete.origin;
    const workspace = workspaceFor(serviceOrigin);
    const outputDir = testInfo.outputDir;
    mkdirSync(outputDir, { recursive: true });
    const sourcePath = join(outputDir, "scene-source.mkv");
    writeFileSync(sourcePath, "av1ation-e2e scene fixture");

    const project = await workspace.createProject("E2E scene bulk config");
    const video = await project.addVideo({
        name: "E2E scene source",
        inputPath: sourcePath,
        outputPath: join(outputDir, "scene-source.av1.mkv"),
    });
    await video.addScene({ start_frame: 0, end_frame: 24 });
    await video.addScene({ start_frame: 24, end_frame: 48 });

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const writes: string[] = [];
    const undos: string[] = [];
    page.on("request", (request) => {
        if (request.method() === "PUT" && request.url().endsWith("/scenes/encoder")) {
            writes.push(request.url());
        }
        if (request.method() === "POST" && request.url().endsWith("/scenes/undo")) {
            undos.push(request.url());
        }
    });

    await page.goto(`${serviceOrigin}/projects/${project.id}/videos/${video.id}/scenes`);
    await expect(page.getByRole("heading", { name: "Scenes", exact: true })).toBeVisible();
    const rail = page.getByRole("listbox", { name: "Scenes" });
    await expect(rail.getByRole("option")).toHaveCount(2);

    await rail.getByRole("option").nth(0).click();
    await rail
        .getByRole("option")
        .nth(1)
        .click({ modifiers: ["Shift"] });
    const details = page.locator("section[aria-labelledby='scene-details-heading']");
    await expect(details.getByRole("heading", { name: "2 scenes" })).toBeVisible();

    await details.getByRole("button", { name: "Change", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Scene encoder" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("radio", { name: /These 2 scenes/u }).check();
    const passes = sheet.getByLabel("Encoder passes");
    await expect(passes).toBeVisible();
    await passes.fill("2");

    const saveResponse = page.waitForResponse(
        (response) =>
            response.url().endsWith("/scenes/encoder") && response.request().method() === "PUT",
    );
    await sheet.getByRole("button", { name: "Save for scenes", exact: true }).click();
    expect((await saveResponse).status()).toBe(200);
    await expect(sheet).toBeHidden();
    await expect(page.getByText("The encoder was written to 2 scenes.")).toBeVisible();
    await expect(details.getByText(/Custom for all 2 scenes/u)).toBeVisible();

    const written = await video.scenes();
    expect(written.scenes.map((scene) => scene.encoder_custom)).toEqual([true, true]);

    const undo = details.getByRole("button", { name: "Undo last scene edit" });
    await expect(undo).toBeEnabled();
    const undoResponse = page.waitForResponse(
        (response) =>
            response.url().endsWith("/scenes/undo") && response.request().method() === "POST",
    );
    await undo.click();
    expect((await undoResponse).status()).toBe(204);
    await expect(
        page.getByText("Scene edit undone; re-run encoding to write the chunks again"),
    ).toBeVisible();

    const restored = await video.scenes();
    expect(restored.scenes.map((scene) => scene.encoder_custom)).toEqual([false, false]);
    await rail.getByRole("option").nth(0).click();
    await expect(details.getByRole("button", { name: "Undo last scene edit" })).toBeDisabled();
    expect(writes).toHaveLength(1);
    expect(undos).toHaveLength(1);
    expect(pageErrors).toEqual([]);
});
