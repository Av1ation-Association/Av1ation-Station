import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            "**/dist/**",
            "**/node_modules/**",
            "**/target/**",
            "schema/**",
            "design/penpot/**",
            "coverage/**",
            "playwright-report/**",
            "test-results/**",
        ],
    },
    ...tseslint.configs.recommended,
    {
        files: ["**/*.{ts,tsx}"],
        plugins: { "react-hooks": reactHooks },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
            ],
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["@tauri-apps/*"],
                            message:
                                "Native APIs belong behind a transport in packages/api, not in shared UI.",
                        },
                        {
                            group: ["**/transport", "**/transport/**"],
                            message: "Import the typed façade from @av1ation/api instead.",
                        },
                    ],
                },
            ],
        },
    },
    {
        // The Tauri host is the one place a native API belongs: it constructs the transport and
        // injects host capabilities such as the file dialog. Shared UI and packages/api stay
        // browser-portable, so the ban stays in force everywhere else.
        files: ["apps/desktop/src/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["**/transport", "**/transport/**"],
                            message: "Import the typed façade from @av1ation/api instead.",
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ["packages/api/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["@tauri-apps/*"],
                            message:
                                "Native APIs belong behind a transport in packages/api, not in shared UI.",
                        },
                    ],
                },
            ],
        },
    },
);
