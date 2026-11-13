// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { casesFor, resetA11y, violationsAt } from "../test/a11y";

// Monaco needs layout, workers, and a canvas that jsdom does not provide. The accessibility
// pass cares about the surrounding shell, not the editor runtime, so it uses a textarea.
vi.mock("@monaco-editor/react", async () => {
    const React = await import("react");
    return {
        default: ({
            value,
            onChange,
            options,
        }: {
            value?: string;
            onChange?: (value: string | undefined) => void;
            options?: { ariaLabel?: string };
        }) =>
            React.createElement("textarea", {
                "aria-label": options?.ariaLabel,
                value: value ?? "",
                onChange: (event: { target: { value: string } }) => onChange?.(event.target.value),
            }),
        loader: { config: () => undefined },
    };
});

// The theme module also starts the real Monaco runtime, whose clipboard listener outlives a
// file in the shared worker. The accessibility pass needs the theme names only.
vi.mock("../shared/monaco-env", () => ({
    MONACO_THEMES: { dark: "av1ation-dark", light: "av1ation-light" },
}));

const CASES = casesFor([
    "/projects/$projectId",
    "/projects/$projectId/config/general",
    "/projects/$projectId/config/$section",
    "/projects/$projectId/config/script",
]);

afterEach(resetA11y);

describe("screen accessibility · project", () => {
    it.each(CASES)(
        "$name",
        async ({ path }) => {
            expect(await violationsAt(path)).toEqual([]);
        },
        30_000,
    );
});
