// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetA11y, violationsAt } from "../test/a11y";

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

afterEach(resetA11y);

describe("screen accessibility · settings", () => {
    // The strip names seven destinations; only the default inventory is the bare route.
    it("settings appearance", async () => {
        expect(await violationsAt("/settings#appearance")).toEqual([]);
    }, 30_000);

    it("settings encoders", async () => {
        expect(await violationsAt("/settings#encoders")).toEqual([]);
    }, 30_000);

    it("settings project template", async () => {
        expect(await violationsAt("/settings#project-defaults")).toEqual([]);
    }, 30_000);

    it("settings storage", async () => {
        expect(await violationsAt("/settings#storage")).toEqual([]);
    }, 30_000);

    it("settings network", async () => {
        expect(await violationsAt("/settings#network")).toEqual([]);
    }, 30_000);

    it("about", async () => {
        expect(await violationsAt("/settings/about")).toEqual([]);
    }, 30_000);
});
