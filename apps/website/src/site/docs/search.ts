import type MiniSearchType from "minisearch";

import type { DocsSearchRecord } from "./search-index";

export interface DocsSearchHit {
    readonly id: string;
    readonly pageId: string;
    readonly pageTitle: string;
    readonly group: string;
    readonly section: string;
    readonly snippet: string;
}

interface SearchDocument extends DocsSearchRecord {
    readonly title: string;
}

export interface DocsSearchEngine {
    search(query: string): readonly DocsSearchHit[];
}

function snippet(text: string, query: string): string {
    const normalized = text.toLowerCase();
    const needle = query.trim().toLowerCase();
    const index = needle === "" ? 0 : normalized.indexOf(needle);
    if (index <= 0) {
        return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
    }
    const start = Math.max(0, index - 64);
    const end = Math.min(text.length, index + needle.length + 96);
    return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function engineFor(
    MiniSearch: typeof MiniSearchType,
    records: readonly DocsSearchRecord[],
): DocsSearchEngine {
    const index = new MiniSearch<SearchDocument>({
        fields: ["title", "pageTitle", "section", "text", "group"],
        storeFields: ["pageId", "pageTitle", "group", "section", "text"],
        searchOptions: {
            boost: { title: 3, pageTitle: 2, section: 2 },
            fuzzy: 0.2,
            prefix: true,
        },
    });
    index.addAll(
        records.map((record) => ({
            ...record,
            title: `${record.pageTitle} ${record.section}`,
        })),
    );

    return {
        search(query: string): readonly DocsSearchHit[] {
            const trimmed = query.trim();
            if (trimmed === "") {
                return [];
            }
            const results = index.search(trimmed).slice(0, 16) as unknown as Array<
                SearchDocument & { score: number }
            >;
            const seen = new Set<string>();
            const hits: DocsSearchHit[] = [];
            for (const result of results) {
                const key = `${result.pageId}#${result.section}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                hits.push({
                    id: result.id,
                    pageId: result.pageId,
                    pageTitle: result.pageTitle,
                    group: result.group,
                    section: result.section,
                    snippet: snippet(result.text, trimmed),
                });
            }
            return hits;
        },
    };
}

/** Build the lazy client index from the module that owns the MDX text. */
export async function openDocsSearch(): Promise<DocsSearchEngine> {
    const [{ default: MiniSearch }, { loadDocsRecords }] = await Promise.all([
        import("minisearch"),
        import("./search-index"),
    ]);
    return engineFor(MiniSearch, await loadDocsRecords());
}

/** A pure seam for tests: the same ranking with records supplied directly. */
export function createDocsSearch(
    records: readonly DocsSearchRecord[],
    MiniSearch: typeof MiniSearchType,
): DocsSearchEngine {
    return engineFor(MiniSearch, records);
}
