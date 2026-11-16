import { describe, expect, it } from "vitest";

import {
    isDocumentationPath,
    reviewWeeklyRelease,
    selectPreviousWeeklyTag,
    weeklyTagFor,
} from "./weekly-release-tag.mjs";

const HEAD = "a".repeat(40);

describe("weekly release tag", () => {
    it("builds the weekly tag from the stable package base and UTC date", () => {
        expect(weeklyTagFor({ baseVersion: "0.1.0", date: "20261116" })).toBe(
            "v0.1.0-weekly.20261116",
        );
    });

    it("rejects a prerelease base or an impossible date", () => {
        expect(() => weeklyTagFor({ baseVersion: "0.1.0-rc.1", date: "20261116" })).toThrow(
            /stable package version/u,
        );
        expect(() => weeklyTagFor({ baseVersion: "0.1.0", date: "20260231" })).toThrow(
            /real UTC date/u,
        );
    });

    it("recognises documentation paths but not a code path that happens to contain docs", () => {
        expect(isDocumentationPath("docs/releases.md")).toBe(true);
        expect(isDocumentationPath("README.md")).toBe(true);
        expect(isDocumentationPath("docs")).toBe(false);
        expect(isDocumentationPath("scripts/docs/releases.mjs")).toBe(false);
    });

    it("selects the newest weekly tag by date", () => {
        expect(
            selectPreviousWeeklyTag([
                "v0.1.0-weekly.20261102",
                "v0.1.0-weekly.20261116",
                "v0.1.0-rc.1",
                "v0.1.0-weekly.20261026",
            ]),
        ).toMatchObject({ tag: "v0.1.0-weekly.20261116", date: "20261116" });
    });

    it("creates the first weekly tag when there is no previous tag", () => {
        const result = reviewWeeklyRelease({
            baseVersion: "0.1.0",
            date: "20261116",
            head: HEAD,
            tags: [],
            changedPaths: ["docs/releases.md"],
        });

        expect(result).toMatchObject({
            tag: "v0.1.0-weekly.20261116",
            skip: false,
            previous_tag: null,
        });
    });

    it("skips a week whose changes are documentation only", () => {
        const result = reviewWeeklyRelease({
            baseVersion: "0.1.0",
            date: "20261116",
            head: HEAD,
            tags: ["v0.1.0-weekly.20261109"],
            changedPaths: ["docs/releases.md", "README.md"],
        });

        expect(result).toMatchObject({
            tag: "v0.1.0-weekly.20261116",
            skip: true,
            previous_tag: "v0.1.0-weekly.20261109",
        });
        expect(result.reason).toMatch(/only documentation/u);
    });

    it("creates a tag for a non-documentation change", () => {
        const result = reviewWeeklyRelease({
            baseVersion: "0.1.0",
            date: "20261116",
            head: HEAD,
            tags: ["v0.1.0-weekly.20261109"],
            changedPaths: ["docs/releases.md", "scripts/release-preflight.mjs"],
        });

        expect(result.skip).toBe(false);
        expect(result.code_paths).toEqual(["scripts/release-preflight.mjs"]);
    });

    it("never creates a second tag for a date", () => {
        const result = reviewWeeklyRelease({
            baseVersion: "0.1.0",
            date: "20261116",
            head: HEAD,
            tags: ["v0.1.0-weekly.20261116"],
            changedPaths: ["apps/web/src/App.tsx"],
        });

        expect(result).toMatchObject({
            tag: "v0.1.0-weekly.20261116",
            skip: true,
        });
        expect(result.reason).toMatch(/already exists/u);
    });

    it("skips when the previous tag has no changes at HEAD", () => {
        const result = reviewWeeklyRelease({
            baseVersion: "0.1.0",
            date: "20261116",
            head: HEAD,
            tags: ["v0.1.0-weekly.20261109"],
            changedPaths: [],
        });

        expect(result.skip).toBe(true);
        expect(result.reason).toMatch(/no changes/u);
    });
});
