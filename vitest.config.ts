import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Coverage instrumentation roughly doubles the jsdom-heavy component tests. This
        // keeps the budget about the work, not the instrumentation; it does not relax an
        // assertion.
        testTimeout: 15_000,
        // File-scoped `vi.mock` factories cannot share a module cache. A broad route/a11y
        // file can pin an editor or provider module under its own stub, leaving a later test
        // with the wrong context even though its mock is registered. A fresh fork per file
        // costs about half a minute and makes the suite independent of file order.
        isolate: true,
        setupFiles: ["./packages/ui/src/test/setup.ts"],
        exclude: ["**/node_modules/**", "**/dist/**", "**/target/**", "e2e/**"],
        coverage: {
            provider: "v8",
            reporter: ["text-summary", "json-summary", "lcov"],
            reportsDirectory: "dist/coverage/web",
            reportOnFailure: true,
            include: ["packages/api/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
            exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts", "**/test/**", "**/__snapshots__/**"],
        },
    },
});
