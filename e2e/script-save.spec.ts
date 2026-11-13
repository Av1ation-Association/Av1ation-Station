import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ProjectSchema } from "@av1ation/contracts";
import { projectGeneralPath, projectPath } from "@av1ation/api/paths";

import { expect, test } from "./fixtures";

const MARKER = "E2E_SCRIPT_MARKER";

/**
 * The script-save journey: switch General's input to stored text, replace the seeded
 * template in Monaco, commit from the top bar, and prove both the project document and a
 * reload carry the saved program. The project workspace cleans itself up after a pass.
 */
test("saves a stored project script and reloads it", async ({
    page,
    request,
    hosts,
    workspaceFor,
}, testInfo) => {
    test.setTimeout(60_000);
    const serviceOrigin = hosts.complete.origin;
    const workspace = workspaceFor(serviceOrigin);
    const project = await workspace.createProject("E2E script save");
    const seedScriptPath = join(testInfo.outputDir, "seed.vpy");
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(
        seedScriptPath,
        [
            "import vapoursynth as vs",
            "clip = vs.core.std.BlankClip(format=vs.YUV420P10)",
            "clip.set_output()",
            "",
        ].join("\n"),
    );
    const script = [
        `# ${MARKER}`,
        "import vapoursynth as vs",
        "clip = vs.core.std.BlankClip(format=vs.YUV420P10)",
        "clip.set_output()",
    ].join("\n");
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const projectResponse = await request.get(`${serviceOrigin}${projectPath(project.id)}`);
    expect(projectResponse.ok()).toBeTruthy();
    const projectDocument = ProjectSchema.parse(await projectResponse.json());
    const seeded = await request.put(`${serviceOrigin}${projectGeneralPath(project.id)}`, {
        data: {
            ...projectDocument.general,
            input_kind: "vapour_synth_script",
            script_mode: "file",
            script: seedScriptPath,
            output_mode: "next_to_input",
        },
    });
    expect(seeded.ok()).toBeTruthy();

    await page.goto(`${serviceOrigin}/projects/${project.id}/config/script`);
    const store = page.getByRole("button", { name: "Store a script in the app", exact: true });
    await expect(store).toBeVisible();
    await store.click();

    await expect(page.locator(".monaco-editor").first()).toBeVisible();
    await page.locator(".monaco-editor .view-lines").first().click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(script);
    await expect(page.locator(".view-lines").first()).toContainText(MARKER);

    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeEnabled();
    const saved = page.waitForResponse(
        (response) =>
            response.url().endsWith(projectGeneralPath(project.id)) &&
            response.request().method() === "PUT",
    );
    await save.click();
    expect((await saved).status()).toBe(200);

    const storedResponse = await request.get(`${serviceOrigin}${projectPath(project.id)}`);
    expect(storedResponse.ok()).toBeTruthy();
    const stored = ProjectSchema.parse(await storedResponse.json());
    expect(stored.general.script_mode).toBe("text");
    expect(stored.general.script_text).toContain(MARKER);

    await page.reload();
    await expect(page.locator(".monaco-editor").first()).toBeVisible();
    await expect(page.locator(".view-lines").first()).toContainText(MARKER);
    expect(pageErrors).toEqual([]);
});
