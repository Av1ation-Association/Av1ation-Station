import { AppSettingsSchema } from "@av1ation/contracts";
import { settingsPath } from "@av1ation/api/paths";

import { expect, test } from "./fixtures";

/**
 * The Settings write journey: change the theme from the Appearance panel, prove the PATCH
 * reached the service, then reload and prove the radio reflects the stored preference. The
 * original value is restored in `finally` because settings are shared by every host.
 */
test("writes a theme preference and keeps it across a reload", async ({ page, request, hosts }) => {
    test.setTimeout(60_000);
    const serviceOrigin = hosts.complete.origin;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const initialResponse = await request.get(`${serviceOrigin}${settingsPath()}`);
    expect(initialResponse.ok()).toBeTruthy();
    const initial = AppSettingsSchema.parse(await initialResponse.json());
    const nextTheme = initial.theme === "light" ? "dark" : "light";
    const nextLabel = nextTheme === "dark" ? "Dark" : "Light";
    const nextRadio = page.getByRole("radio", {
        name: new RegExp(`^${nextLabel}\\b`, "u"),
    });

    try {
        await page.goto(`${serviceOrigin}/settings#appearance`);
        await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
        await expect(nextRadio).toBeVisible();

        const patched = page.waitForResponse(
            (response) =>
                response.url().endsWith(settingsPath()) && response.request().method() === "PATCH",
        );
        await nextRadio.click();
        expect((await patched).status()).toBe(200);

        const savedResponse = await request.get(`${serviceOrigin}${settingsPath()}`);
        expect(savedResponse.ok()).toBeTruthy();
        const saved = AppSettingsSchema.parse(await savedResponse.json());
        expect(saved.theme).toBe(nextTheme);

        await page.reload();
        await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
        await expect(nextRadio).toHaveAttribute("aria-checked", "true");
        expect(pageErrors).toEqual([]);
    } finally {
        await request.patch(`${serviceOrigin}${settingsPath()}`, {
            data: { theme: initial.theme },
        });
    }
});
