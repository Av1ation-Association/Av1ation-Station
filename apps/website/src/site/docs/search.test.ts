import MiniSearch from "minisearch";
import { describe, expect, it } from "vitest";

import { DOCS_PAGES } from "./manifest";
import { createDocsSearch } from "./search";
import { loadDocsRecords, parseMdxSections } from "./search-index";

const RECORDS = [
    {
        id: "r1",
        pageId: "R03",
        pageTitle: "General",
        group: "reference",
        section: "Output",
        text: "The output mode chooses the exact file concatenation writes beside the source.",
    },
    {
        id: "r2",
        pageId: "R03",
        pageTitle: "General",
        group: "reference",
        section: "Input kinds",
        text: "The input kind determines which filter target is offered and whether VapourSynth is required.",
    },
    {
        id: "r3",
        pageId: "G07",
        pageTitle: "Configure concatenation and tracks",
        group: "guides",
        section: "Probe the inventory",
        text: "Select Probe again to ask the muxer for the source streams and chapter count.",
    },
];

describe("docs search", () => {
    it("ranks a title and section match above body-only prose", () => {
        const engine = createDocsSearch(RECORDS, MiniSearch);
        const hits = engine.search("output");
        expect(hits[0]?.section).toBe("Output");
    });

    it("finds a section through its body prose and returns a snippet", () => {
        const engine = createDocsSearch(RECORDS, MiniSearch);
        const hits = engine.search("VapourSynth");
        expect(hits[0]?.pageId).toBe("R03");
        expect(hits[0]?.snippet.toLowerCase()).toContain("vapoursynth");
    });

    it("returns nothing for an empty query", () => {
        const engine = createDocsSearch(RECORDS, MiniSearch);
        expect(engine.search("   ")).toEqual([]);
    });

    it("deduplicates hits from the same page section", () => {
        const engine = createDocsSearch(RECORDS, MiniSearch);
        const hits = engine.search("probe");
        const keys = hits.map((hit) => `${hit.pageId}#${hit.section}`);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("MDX document loading", () => {
    it("loads searchable records for every declared page", async () => {
        const records = await loadDocsRecords();
        expect(new Set(records.map((record) => record.pageId)).size).toBe(DOCS_PAGES.length);
        expect(records.some((record) => record.text.includes("concatenation"))).toBe(true);
    });
});

describe("MDX section parsing", () => {
    it("splits a body on H2 headings and drops component markup", () => {
        const body = [
            "Opening prose.",
            "",
            "## Output",
            "",
            "The exact file. <Callout tone=\"note\">Markup is not indexed.</Callout>",
            "",
            "## Input kinds",
            "",
            "VapourSynth needs a provider.",
        ].join("\n");
        const records = parseMdxSections("R03", body);
        expect(records.map((record) => record.section)).toEqual([
            "Overview",
            "Output",
            "Input kinds",
        ]);
        expect(records[1]?.text).toContain("exact file");
        expect(records[1]?.text).not.toContain("Callout");
    });

    it("returns no records for an unknown page id", () => {
        expect(parseMdxSections("NOPE", "## Output\nText.")).toEqual([]);
    });
});
