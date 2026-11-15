import { describe, expect, it } from "vitest";

import { docsContentFile, docsPathForContentFile } from "./content-path";
import { DOCS_PAGES, DOCS_PAGE_BY_PATH, slugifyHeading, type DocsPage } from "./manifest";

const RAW = import.meta.glob("../../../content/docs/**/*.mdx", {
    query: "?raw",
    import: "default",
    eager: true,
}) as Record<string, string>;

function pageForContentFile(file: string): DocsPage | undefined {
    const path = docsPathForContentFile(file);
    return path === null ? undefined : DOCS_PAGE_BY_PATH.get(path);
}

function bodyFor(page: DocsPage): string {
    return RAW[docsContentFile(page.path)] ?? "";
}

function h2Headings(markdown: string): readonly string[] {
    const headings: string[] = [];
    let fenced = false;
    for (const line of markdown.split(/\r?\n/u)) {
        if (line.trimStart().startsWith("```")) {
            fenced = !fenced;
            continue;
        }
        if (fenced) {
            continue;
        }
        const match = /^##\s+(.+)$/u.exec(line);
        if (match?.[1] !== undefined) {
            headings.push(match[1].trim());
        }
    }
    return headings;
}

describe("docs content parity", () => {
    it("has exactly one MDX body per public docs path and no orphan body", () => {
        const files = Object.keys(RAW)
            .map((file) => pageForContentFile(file)?.path ?? `orphan:${file}`)
            .sort();
        const paths = DOCS_PAGES.map((page) => page.path).sort();
        expect(files).toEqual(paths);
    });

    it("uses the URL-derived content path as the only page body", () => {
        for (const page of DOCS_PAGES) {
            expect(RAW[docsContentFile(page.path)], page.path).toBeDefined();
        }
    });

    it("contains every manifest section as an H2", () => {
        for (const page of DOCS_PAGES) {
            const body = bodyFor(page);
            const headings = new Set(h2Headings(body).map(slugifyHeading));
            const renderedByComponent = body.includes("<RelatedLinks>") ? ["related-reference"] : [];
            for (const section of page.sections) {
                const slug = slugifyHeading(section);
                expect(
                    headings.has(slug) || renderedByComponent.includes(slug),
                    `${page.id} is missing the section ${section}`,
                ).toBe(true);
            }
        }
    });

    it("gives every page a unique heading anchor", () => {
        for (const page of DOCS_PAGES) {
            const body = bodyFor(page);
            const headings = h2Headings(body);
            const steps = [...body.matchAll(/<Step title="([^"]+)"/gu)].map(
                (match) => match[1] ?? "",
            );
            const slugs = [...headings, ...steps].map(slugifyHeading);
            if (body.includes("<RelatedLinks>")) slugs.push("related-reference");
            expect(new Set(slugs).size, `${page.id} repeats a heading anchor`).toBe(slugs.length);
        }
    });

    it("mounts each focused sample and widget at most once", () => {
        const samples = new Set<string>();
        const widgets = new Set<string>();
        const figures = new Set<string>();
        for (const body of Object.values(RAW)) {
            for (const match of body.matchAll(/<LiveSample kind="([^"]+)"\s*\/>/gu)) {
                const kind = match[1] ?? "";
                expect(samples.has(kind), `${kind} is mounted twice`).toBe(false);
                samples.add(kind);
            }
            for (const match of body.matchAll(/<LiveWidget id="(W\d{2})"\s*\/>/gu)) {
                const id = match[1] ?? "";
                expect(widgets.has(id), `${id} is mounted twice`).toBe(false);
                widgets.add(id);
            }
            for (const match of body.matchAll(/<Figure capture="([^"]+)"/gu)) {
                const capture = match[1] ?? "";
                expect(figures.has(capture), `${capture} is mounted twice`).toBe(false);
                figures.add(capture);
            }
        }
        expect([...samples].sort()).toEqual([
            "appearance",
            "bitrate-threshold",
            "command-palette",
            "draft-actions",
            "history-item",
            "input-kinds",
            "log-filter",
            "network",
            "new-project",
            "project-search",
            "quality-metric",
            "quality-range",
            "queue-selection",
            "retained-removal",
            "run-control",
            "run-lock",
            "scene-details",
            "scene-table",
            "script-validation",
            "speed-scaling",
            "storage",
            "toolchain",
            "video-config",
        ]);
        expect([...widgets].sort()).toEqual(["W01", "W03", "W05"]);
    });

    it("keeps every internal docs link on a declared route or heading", () => {
        const pathSlugs = new Map(
            DOCS_PAGES.map((page) => [
                page.path,
                new Set(page.sections.map((section) => slugifyHeading(section))),
            ]),
        );
        for (const page of DOCS_PAGES) {
            const body = bodyFor(page);
            for (const match of body.matchAll(/\]\((\/docs[^)\s]*)\)/gu)) {
                const href = match[1] ?? "";
                const [path, hash] = href.split("#");
                const target = path === "/docs/" ? "/docs" : (path ?? "");
                const sections = pathSlugs.get(target);
                expect(sections, `${page.id} links to undeclared ${target}`).toBeDefined();
                if (hash !== undefined && hash !== "") {
                    expect(
                        sections?.has(hash),
                        `${page.id} links to a missing heading ${href}`,
                    ).toBe(true);
                }
            }
        }
    });
});
