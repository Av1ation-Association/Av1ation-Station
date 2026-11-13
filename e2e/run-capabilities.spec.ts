import { RunStartedSchema } from "@av1ation/contracts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { expectAxeClean } from "./support/axe";

/**
 * The run-lock capability matrix.
 *
 * The run guard is exercised both where it is enforced (the real encode route) and where a
 * user meets it: a fresh page that has not received the live event leaves Start enabled,
 * and the resulting `409` must be said in place. The same run proves which writes are
 * frozen (the active video and its project-wide surface) and which stay available (a
 * sibling), and the active page is inspected to prove the disabled state is what the user
 * sees, not only an API answer.
 */
test("refuses a second start in the browser and locks only the active video", async ({
    page,
    hosts,
    workspaceFor,
}, testInfo) => {
    test.setTimeout(60_000);
    // The held-open cancel journey owns the other singleton. A failure there must not
    // leave this test with a 409 before it can exercise the refusal itself.
    const serviceOrigin = hosts.lan.origin;
    const workspace = workspaceFor(serviceOrigin);
    const projectName = workspace.name("E2E locked scope");
    const activeName = "E2E active source";
    const siblingName = "E2E locked sibling";
    const outputDir = testInfo.outputDir;
    mkdirSync(outputDir, { recursive: true });

    const activeSource = join(outputDir, "active-source.mkv");
    const activeOutput = join(outputDir, "active-source.av1.mkv");
    const siblingSource = join(outputDir, "locked-sibling.mkv");
    const siblingOutput = join(outputDir, "locked-sibling.av1.mkv");
    writeFileSync(activeSource, "av1ation-e2e active fixture");
    writeFileSync(siblingSource, "av1ation-e2e sibling fixture");

    const project = await workspace.createProject("E2E locked scope");
    const active = await project.addVideo({
        name: activeName,
        inputPath: activeSource,
        outputPath: activeOutput,
    });
    const sibling = await project.addVideo({
        name: siblingName,
        inputPath: siblingSource,
        outputPath: siblingOutput,
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${serviceOrigin}/projects/${project.id}/videos/${active.id}`);
    await expect(page.getByRole("heading", { name: "Pipeline", exact: true })).toBeVisible();
    await expectAxeClean(page, "video pipeline");

    const header = page.locator("header");
    const start = header.getByRole("button", { name: "Start", exact: true });
    await expect(start).toBeEnabled();
    const startResponsePromise = page.waitForResponse(
        (response) =>
            response.url().endsWith(`/api/projects/${project.id}/videos/${active.id}/encode`) &&
            response.request().method() === "POST",
    );
    await start.click();
    const startResponse = await startResponsePromise;
    expect(startResponse.status()).toBe(202);
    const started = RunStartedSchema.parse(await startResponse.json());
    const run = active.run(started.run_id);

    const stop = header.getByRole("button", { name: "Stop", exact: true });
    await expect(stop).toBeEnabled({ timeout: 10_000 });
    const events = await run.waitForEvents(["started", "progress"]);
    expect(events.map((event) => event.kind)).toEqual(
        expect.arrayContaining(["started", "progress"]),
    );

    const busy = await sibling.attemptStart();
    expect(busy.code).toBe("BUSY");
    expect(busy.message).toContain(activeName);
    expect(busy.message).toContain(projectName);

    const lockedGeneral = await active.attemptSaveGeneral({ input: {}, output: {} });
    expect(lockedGeneral.code).toBe("LOCKED");
    expect(lockedGeneral.message).toBe("Configuration is read-only while an encode is running.");

    const lockedOverrides = await active.attemptSaveOverrides({ fields: {} });
    expect(lockedOverrides.code).toBe("LOCKED");

    // A sibling is not part of the run's snapshot, so its override write still succeeds.
    const siblingConfig = await sibling.saveOverrides({
        fields: { "sequences.parallel_encoder.workers": 8 },
    });
    expect(siblingConfig.values["sequences.parallel_encoder.workers"]?.value).toBe(8);

    await page.goto(`${serviceOrigin}/projects/${project.id}/videos/${active.id}/config/general`);
    await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
    await expect(page.getByText(`${activeName} is encoding`).first()).toBeVisible({
        timeout: 10_000,
    });
    await expect(page.getByLabel("Output file")).toBeDisabled();
    await expect(header.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await expectAxeClean(page, "locked video General");

    // A fresh page has not received the live event that names the running video, so the
    // sibling's Start is still enabled. Clicking it is the user-reachable 409 path: the
    // refusal must be stated in place, not swallowed by the request.
    await page.goto(`${serviceOrigin}/projects/${project.id}/videos/${sibling.id}/config/general`);
    await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
    await expect(page.getByLabel("Output file")).toBeEnabled();
    await expect(header.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
    await expectAxeClean(page, "sibling video General");
    const secondStart = page.waitForResponse(
        (response) =>
            response.url().endsWith(`/api/projects/${project.id}/videos/${sibling.id}/encode`) &&
            response.request().method() === "POST",
    );
    await header.getByRole("button", { name: "Start", exact: true }).click();
    expect((await secondStart).status()).toBe(409);
    await expect(page.getByRole("alert")).toContainText(activeName);
    await expect(page.getByRole("alert")).toContainText("only one encode runs at a time");

    await page.goto(`${serviceOrigin}/projects/${project.id}/videos/${active.id}`);
    await expect(stop).toBeEnabled({ timeout: 10_000 });
    const cancelResponsePromise = page.waitForResponse(
        (response) =>
            response.url().endsWith(`/api/projects/${project.id}/videos/${active.id}/encode`) &&
            response.request().method() === "DELETE",
    );
    await stop.click();
    expect((await cancelResponsePromise).status()).toBe(202);

    expect((await run.waitForTerminal()).outcome).toBe("cancelled");
    expect((await run.waitForIdle()).active).toBe(false);
    expect(pageErrors).toEqual([]);
});
