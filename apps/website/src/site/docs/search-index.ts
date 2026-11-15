import { docsPathForContentFile } from "./content-path";
import { DOCS_PAGE_BY_ID, DOCS_PAGE_BY_PATH } from "./manifest";

export interface DocsSearchRecord {
    readonly id: string;
    readonly pageId: string;
    readonly pageTitle: string;
    readonly group: string;
    readonly section: string;
    readonly text: string;
}

/** Every MDX body, loaded only when the reader opens search. */
const RAW_DOCS = import.meta.glob("../../../content/docs/**/*.mdx", {
    query: "?raw",
    import: "default",
});

function plainMarkdown(value: string): string {
    return value
        .replace(/```[^\n]*\n?/gu, " ")
        .replace(/`([^`]+)`/gu, "$1")
        .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
        .replace(/<\/?[A-Za-z][^>]*>/gu, " ")
        .replace(/\|/gu, " ")
        .replace(/[*_~]/gu, "")
        .replace(/^#{1,6}\s+/gmu, "")
        .replace(/\s+/gu, " ")
        .trim();
}

/**
 * Split one MDX body into search sections.
 *
 * Headings are the section boundary the result list shows. Fenced code stays searchable by
 * its label and content, but component internals are not indexed, per the docs contract.
 */
export function parseMdxSections(
    pageId: string,
    raw: string,
): readonly DocsSearchRecord[] {
    const page = DOCS_PAGE_BY_ID.get(pageId);
    if (page === undefined) {
        return [];
    }
    const records: DocsSearchRecord[] = [];
    const lines = raw.split(/\r?\n/u);
    let section = "Overview";
    let buffer: string[] = [];
    let inFence = false;

    const flush = (): void => {
        const text = plainMarkdown(buffer.join(" "));
        if (text !== "") {
            records.push({
                id: `${page.id}-${records.length}`,
                pageId: page.id,
                pageTitle: page.title,
                group: page.group,
                section,
                text,
            });
        }
        buffer = [];
    };

    for (const line of lines) {
        if (line.trimStart().startsWith("```")) {
            inFence = !inFence;
            buffer.push(line);
            continue;
        }
        const heading = /^#{2,3}\s+(.+)$/u.exec(line);
        if (!inFence && heading !== null) {
            flush();
            section = plainMarkdown(heading[1] ?? "");
            continue;
        }
        buffer.push(line);
    }
    flush();
    return records;
}

export async function loadDocsRecords(): Promise<readonly DocsSearchRecord[]> {
    const records: DocsSearchRecord[] = [];
    const entries = Object.entries(RAW_DOCS);
    await Promise.all(
        entries.map(async ([file, load]) => {
            const path = docsPathForContentFile(file);
            const page = path === null ? undefined : DOCS_PAGE_BY_PATH.get(path);
            if (page === undefined) {
                return;
            }
            const raw = await load();
            records.push(...parseMdxSections(page.id, raw));
        }),
    );
    records.sort((left, right) => {
        const pageOrder =
            [...DOCS_PAGE_BY_ID.keys()].indexOf(left.pageId) -
            [...DOCS_PAGE_BY_ID.keys()].indexOf(right.pageId);
        return pageOrder;
    });
    return records;
}
