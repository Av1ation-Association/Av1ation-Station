import { describe, expect, it } from "vitest";

import {
    DOCS_GROUPS,
    DOCS_PAGES,
    DOCS_PAGE_BY_ID,
    DOCS_PAGE_BY_PATH,
    docsNeighbours,
    isDocsPath,
    normalizeDocsPath,
    pagesInGroup,
} from "./manifest";

describe("docs manifest", () => {
    it("has exactly forty-eight pages with unique ids and paths", () => {
        expect(DOCS_PAGES).toHaveLength(48);
        expect(new Set(DOCS_PAGES.map((page) => page.id)).size).toBe(48);
        expect(new Set(DOCS_PAGES.map((page) => page.path)).size).toBe(48);
        expect(DOCS_PAGE_BY_ID.size).toBe(48);
        expect(DOCS_PAGE_BY_PATH.size).toBe(48);
    });

    it("declares every page under exactly one group", () => {
        const grouped = DOCS_GROUPS.flatMap((group) =>
            pagesInGroup(group.id).map((page) => page.id),
        );
        expect(grouped.sort()).toEqual(DOCS_PAGES.map((page) => page.id).sort());
    });

    it("resolves trailing slashes to the same page", () => {
        expect(normalizeDocsPath("/docs/")).toBe("/docs");
        expect(normalizeDocsPath("/docs/get-started/install/")).toBe(
            "/docs/get-started/install",
        );
        expect(DOCS_PAGE_BY_PATH.get(normalizeDocsPath("/docs/guides/lan-access/"))?.id).toBe(
            "G11",
        );
    });

    it("treats only /docs routes as documentation", () => {
        expect(isDocsPath("/docs")).toBe(true);
        expect(isDocsPath("/docs/reference/video")).toBe(true);
        expect(isDocsPath("/documentation")).toBe(false);
        expect(isDocsPath("/")).toBe(false);
    });

    it("chains previous and next in manifest order", () => {
        expect(docsNeighbours("D00").previous).toBeNull();
        expect(docsNeighbours("D00").next?.id).toBe("T01");
        expect(docsNeighbours("T01").previous?.id).toBe("D00");
        expect(docsNeighbours("X01").next).toBeNull();
        expect(docsNeighbours("missing")).toEqual({ previous: null, next: null });
    });

    it("keeps every related page id resolvable", () => {
        for (const page of DOCS_PAGES) {
            for (const related of page.related) {
                expect(DOCS_PAGE_BY_ID.has(related), `${page.id} -> ${related}`).toBe(true);
            }
        }
    });
});
