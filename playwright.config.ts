import { defineConfig, devices } from "@playwright/test";

const servicePort = Number(process.env.AV1ATION_E2E_PORT ?? 8731);
const serviceUrl = `http://127.0.0.1:${servicePort}`;

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    workers: 1,
    forbidOnly: process.env.CI === "true",
    retries: process.env.CI === "true" ? 1 : 0,
    timeout: 30_000,
    expect: { timeout: 10_000 },
    outputDir: "dist/test-results/playwright",
    reporter: [["list"], ["html", { open: "never", outputFolder: "dist/playwright-report" }]],
    use: {
        baseURL: serviceUrl,
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
    webServer: {
        command: `node scripts/dev-headless.mjs --static --no-open --no-build --fresh --data-dir dist/test-data/e2e --port ${servicePort}`,
        url: `${serviceUrl}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
    },
});
