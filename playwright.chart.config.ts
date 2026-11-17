import { defineConfig, devices } from "@playwright/test";

/**
 * The analytics chart's gesture path belongs to the documentation site, which is a separate
 * document from the service-served app. Its own config keeps the website server out of the
 * app journey suite while still running the assertion on every E2E invocation.
 */
export default defineConfig({
    testDir: "./e2e",
    testMatch: /chart-zoom\.spec\.ts/u,
    fullyParallel: false,
    workers: 1,
    forbidOnly: process.env.CI === "true",
    retries: process.env.CI === "true" ? 1 : 0,
    timeout: 30_000,
    expect: { timeout: 10_000 },
    outputDir: "dist/test-results/playwright-chart",
    reporter: [["list"]],
    use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        baseURL: "http://127.0.0.1:1422",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        locale: "en-US",
        timezoneId: "UTC",
        reducedMotion: "reduce",
    },
    webServer: {
        command: "npm run dev --workspace @av1ation/website -- --port 1422 --host 127.0.0.1",
        url: "http://127.0.0.1:1422/docs/concepts/quality",
        reuseExistingServer: process.env.CI !== "true",
        timeout: 120_000,
    },
});
