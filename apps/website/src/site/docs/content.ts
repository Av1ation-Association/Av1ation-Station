import type { ComponentType, ElementType } from "react";

import { docsContentFile } from "./content-path";

export interface MdxModule {
    readonly default: ComponentType<{ components?: Record<string, ElementType> }>;
}

const CONTENT = import.meta.glob<MdxModule>("../../../content/docs/**/*.mdx");

/**
 * The one mapping from a docs URL to its lazy MDX body.
 *
 * The content tree mirrors the public path, so this is a direct lookup rather than an
 * inventory-id convention. The glob is not eager: opening a reference page downloads its
 * body, while the docs shell, navigation, and search stay in the entry chunk.
 */
export function docsContentLoader(pagePath: string): (() => Promise<MdxModule>) | null {
    return CONTENT[docsContentFile(pagePath)] ?? null;
}
