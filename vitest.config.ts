import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Coverage instrumentation roughly doubles the jsdom-heavy component tests. This
        // keeps the budget about the work, not the instrumentation; it does not relax an
        // assertion.
        testTimeout: 15_000,
        exclude: ["**/node_modules/**", "**/dist/**", "**/target/**", "e2e/**"],
        coverage: {
            provider: "v8",
            reporter: ["text-summary", "json-summary", "lcov"],
            reportsDirectory: "dist/coverage",
            reportOnFailure: true,
            include: ["packages/api/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
            exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts", "**/test/**", "**/__snapshots__/**"],
        },
    },
});
