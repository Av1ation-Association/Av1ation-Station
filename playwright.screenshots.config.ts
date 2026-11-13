import { defineConfig } from "@playwright/test";

const port = Number(process.env.AV1ATION_SCREENSHOT_PORT ?? 8740);
const origin = `http://127.0.0.1:${String(port)}`;

/**
 * The screenshot gallery is deterministic and needs no service: the website host injects
 * the demo transport, and `?gallery=` seeds one rich project from the checked-in fixture.
 *
 * The same catalog is captured in both themes from the same page and data state. The
 * publisher converts the PNGs to AVIF, writes the catalog, and removes the raw files, so
 * this config is never part of the browser smoke suite.
 */
export default defineConfig({
    testDir: "./e2e/screenshots",
    fullyParallel: false,
    workers: 1,
    forbidOnly: true,
    retries: 0,
    timeout: 180_000,
    expect: { timeout: 20_000 },
    outputDir: "dist/test-results/screenshots/playwright",
    reporter: [["list"]],
    use: {
        baseURL: origin,
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        locale: "en-US",
        timezoneId: "UTC",
        reducedMotion: "reduce",
        trace: "retain-on-failure",
        screenshot: "off",
    },
    projects: [
        {
            name: "dark",
            use: { colorScheme: "dark" },
        },
        {
            name: "light",
            use: { colorScheme: "light" },
        },
    ],
    webServer: {
        command: `node scripts/serve-static.mjs --root dist/apps/website --port ${String(port)}`,
        url: `${origin}/index.html`,
        reuseExistingServer: false,
        timeout: 30_000,
        stdout: "pipe",
        stderr: "pipe",
    },
});
