import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    // The deterministic screenshot gallery has its own website server and publisher.
    testIgnore: ["screenshots/**"],
    fullyParallel: false,
    workers: 1,
    forbidOnly: process.env.CI === "true",
    retries: process.env.CI === "true" ? 1 : 0,
    timeout: 30_000,
    expect: { timeout: 10_000 },
    outputDir: "dist/test-results/playwright",
    reporter: [["list"], ["html", { open: "never", outputFolder: "dist/playwright-report" }]],
    globalSetup: "./e2e/global-setup.ts",
    globalTeardown: "./e2e/global-teardown.ts",
    use: {
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        locale: "en-US",
        timezoneId: "UTC",
        reducedMotion: "reduce",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
