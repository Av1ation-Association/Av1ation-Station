import { describe, expect, it } from "vitest";

import { parseFeatureArguments, resolveFeatureSelection } from "./screenshot-selection.mjs";

const screens = [
    { id: "quality-check", feature: "Quality" },
    { id: "target-quality", feature: "Quality" },
    { id: "scenes", feature: "Scenes" },
    { id: "home", feature: "App and settings" },
    { id: "logs", feature: "Runs and logs" },
    { id: "log-export", feature: "Runs and logs" },
];

describe("feature screenshot arguments", () => {
    it("requires one selector for a feature run", () => {
        expect(() => parseFeatureArguments(["--feature-notes"])).toThrow(
            "exactly one feature group or screen id",
        );
        expect(() =>
            parseFeatureArguments(["--feature-notes", "Quality", "quality-check"]),
        ).toThrow("exactly one feature group or screen id");
    });

    it("accepts a selector only through the feature-notes command", () => {
        expect(() => parseFeatureArguments(["Quality"])).toThrow(
            "a feature selector requires --feature-notes",
        );
        expect(() => parseFeatureArguments(["--feature-notes", "--group", "Quality"])).toThrow(
            "unknown screenshot option",
        );
    });

    it("returns the selector with a feature run and nothing for a normal run", () => {
        expect(parseFeatureArguments(["--feature-notes", "Runs and logs"])).toEqual({
            featureNotes: true,
            selector: "Runs and logs",
        });
        expect(parseFeatureArguments([])).toEqual({
            featureNotes: false,
            selector: undefined,
        });
    });
});

describe("feature screenshot selection", () => {
    it("selects every screen in a group", () => {
        const selection = resolveFeatureSelection(screens, "Quality");
        expect(selection).toMatchObject({ kind: "feature", value: "Quality" });
        expect(selection.screens.map((screen) => screen.id)).toEqual([
            "quality-check",
            "target-quality",
        ]);
    });

    it("selects one screen by exact id", () => {
        const selection = resolveFeatureSelection(screens, "quality-check");
        expect(selection).toMatchObject({ kind: "screen", value: "quality-check" });
        expect(selection.screens.map((screen) => screen.id)).toEqual(["quality-check"]);
    });

    it("prefers an exact id over a group whose name differs only by case", () => {
        expect(resolveFeatureSelection(screens, "scenes")).toMatchObject({
            kind: "screen",
            value: "scenes",
        });
        expect(resolveFeatureSelection(screens, "Scenes")).toMatchObject({
            kind: "feature",
            value: "Scenes",
        });
    });

    it("falls back to case-insensitive matching and returns the canonical value", () => {
        expect(resolveFeatureSelection(screens, "quality")).toMatchObject({
            kind: "feature",
            value: "Quality",
        });
        expect(resolveFeatureSelection(screens, "QUALITY-CHECK")).toMatchObject({
            kind: "screen",
            value: "quality-check",
        });
    });

    it("reports every valid selector when nothing matches", () => {
        expect(() => resolveFeatureSelection(screens, "missing")).toThrow(
            "no screenshot feature group or screen id matches",
        );
        expect(() => resolveFeatureSelection(screens, "missing")).toThrow("Runs and logs");
        expect(() => resolveFeatureSelection(screens, "missing")).toThrow("log-export");
    });
});
