/**
 * Map a public docs URL to its MDX body, and back.
 *
 * The content tree mirrors the `/docs/...` URLs so a reader can find a page from its address
 * without consulting the manifest: `/docs/concepts/pipeline` is
 * `content/docs/concepts/pipeline.mdx`. `/docs` is the single `index.mdx`.
 */
const CONTENT_PREFIX = "../../../content/docs/";

/** The module key Vite uses for a docs URL's body. */
export function docsContentFile(pagePath: string): string {
    const slug = pagePath.replace(/^\/docs\/?/u, "").replace(/\/+$/u, "");
    return `${CONTENT_PREFIX}${slug === "" ? "index" : slug}.mdx`;
}

/** The public docs path for a module key, or `null` for a file outside the docs tree. */
export function docsPathForContentFile(file: string): string | null {
    if (!file.startsWith(CONTENT_PREFIX) || !file.endsWith(".mdx")) {
        return null;
    }
    const slug = file.slice(CONTENT_PREFIX.length, -".mdx".length);
    if (slug === "" || slug.startsWith("/") || slug.split("/").includes("..")) {
        return null;
    }
    return slug === "index" ? "/docs" : `/docs/${slug}`;
}
