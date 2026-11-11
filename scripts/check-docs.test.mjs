import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkDocs, contentsErrors, headingSlug, PLAN_BANNER } from "./check-docs.mjs";

const roots = [];

function fixture(files) {
    const root = mkdtempSync(join(tmpdir(), "av1ation-docs-"));
    roots.push(root);
    for (const [path, content] of Object.entries(files)) {
        const target = join(root, path);
        mkdirSync(join(target, ".."), { recursive: true });
        writeFileSync(target, content);
    }
    return root;
}

function longReference(headings) {
    const contents = headings
        .map((heading) => `- [${heading.replace(/[`*]/gu, "")}](#${headingSlug(heading)})`)
        .join("\n");
    return `# Reference\n\n## Contents\n\n${contents}\n\n${headings
        .map((heading) => `## ${heading}\n`)
        .join("\n")}`;
}

const HEADINGS = ["One", "Code `x`", "Three", "Four", "Five", "Six"];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("documentation links", () => {
    it("uses GitHub-shaped heading slugs", () => {
        expect(headingSlug("9.3 Metrics")).toBe("93-metrics");
        expect(headingSlug("Decision — one")).toBe("decision--one");
    });

    it("accepts relative links, same-file anchors, and external URLs", () => {
        const root = fixture({
            "README.md":
                "# Index\n\n## Guide\n\n[Guide](#guide)\n[Other](guide.md#target)\n[Web](https://example.com/x)\n",
            "guide.md": "# Guide\n\n## Target\n\n```md\n[ignored](missing.md)\n```\n",
        });
        expect(checkDocs(root)).toEqual([]);
    });

    it("reports a missing file and a missing anchor", () => {
        const root = fixture({
            "README.md": "# Index\n\n[Missing](missing.md)\n[Anchor](guide.md#absent)\n",
            "guide.md": "# Guide\n",
        });
        expect(checkDocs(root)).toEqual([
            "README.md: missing link target missing.md",
            "README.md: missing anchor guide.md#absent",
        ]);
    });

    it("reports duplicate headings instead of accepting GitHub's suffix", () => {
        const root = fixture({ "README.md": "# One\n\n## Same\n\n## Same\n" });
        expect(checkDocs(root)).toEqual(["README.md: duplicate heading anchor #same"]);
    });

    it("reports a missing same-file anchor", () => {
        const root = fixture({ "README.md": "# Index\n\n[Guide](#missing)\n" });
        expect(checkDocs(root)).toEqual(["README.md: missing anchor #missing"]);
    });

    it("accepts a complete Contents map in a long reference document", () => {
        const root = fixture({ "docs/reference.md": longReference(HEADINGS) });
        expect(checkDocs(root)).toEqual([]);
    });

    it("accepts a complete Contents map in a long nested reference document", () => {
        const root = fixture({ "docs/screens/video.md": longReference(HEADINGS) });
        expect(checkDocs(root)).toEqual([]);
    });

    it("reports a long reference document without a Contents section", () => {
        const headings = HEADINGS.map((heading) => `## ${heading}\n`).join("\n");
        const root = fixture({ "docs/reference.md": `# Reference\n\n${headings}` });
        expect(checkDocs(root)).toEqual([
            `${join("docs", "reference.md")}: missing Contents section (6 H2 headings)`,
        ]);
    });

    it("reports a long nested reference document without a Contents section", () => {
        const headings = HEADINGS.map((heading) => `## ${heading}\n`).join("\n");
        const root = fixture({ "docs/screens/video.md": `# Video\n\n${headings}` });
        expect(checkDocs(root)).toEqual([
            `${join("docs", "screens", "video.md")}: missing Contents section (6 H2 headings)`,
        ]);
    });

    it("does not require Contents in nested plan or spike records", () => {
        const headings = HEADINGS.map((heading) => `## ${heading}\n`).join("\n");
        const root = fixture({
            "docs/progress.md": "# Progress\n",
            "docs/plan/05-ci.md": `# CI\n\n${PLAN_BANNER}\n\n${headings}`,
            "docs/spikes/S1.md": `# Spike\n\n${headings}`,
        });
        expect(checkDocs(root)).toEqual([]);
    });

    it("rejects a status block in the root README", () => {
        const root = fixture({ "README.md": "# Project\n\n> **Status:** Phase 1 complete.\n" });
        expect(checkDocs(root)).toEqual([
            "README.md: root README must not carry a status block; current delivery status lives in docs/progress.md",
        ]);
    });

    it("reports a plan without the planning-record banner", () => {
        const root = fixture({ "docs/plan/05-ci.md": "# CI\n" });
        expect(checkDocs(root)).toEqual([
            "docs/plan/05-ci.md: missing the planning-record banner that links to ../progress.md",
        ]);
    });

    it("accepts a plan with the planning-record banner", () => {
        const root = fixture({
            "docs/progress.md": "# Progress\n",
            "docs/plan/05-ci.md": `# CI\n\n${PLAN_BANNER}\n`,
        });
        expect(checkDocs(root)).toEqual([]);
    });

    it("does not require Contents in the docs index", () => {
        const headings = HEADINGS.map((heading) => `## ${heading}\n`).join("\n");
        const root = fixture({ "docs/README.md": `# Docs\n\n${headings}` });
        expect(checkDocs(root)).toEqual([]);
    });

    it("reports a Contents entry that no longer matches its heading", () => {
        const markdown = longReference(HEADINGS).replace("- [Three](#three)", "- [Old](#old)");
        expect(contentsErrors(markdown)).toContain(
            'Contents entry 3 is "Old" but the heading is "Three"',
        );
    });
});
