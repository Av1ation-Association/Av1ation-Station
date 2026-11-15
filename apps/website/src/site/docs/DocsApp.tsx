import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type LazyExoticComponent,
} from "react";

import { SiteFooter } from "../SiteFooter";
import { SiteHeader } from "../SiteHeader";
import { DOCS_COMPONENTS } from "./components";
import { docsContentLoader } from "./content";
import { DocsSearch } from "./DocsSearch";
import {
    DOCS_GROUPS,
    DOCS_PAGE_BY_PATH,
    docsNeighbours,
    isDocsPath,
    normalizeDocsPath,
    pagesInGroup,
    slugifyHeading,
    type DocsPage,
} from "./manifest";
import { DocsNavigationContext } from "./navigation";
import type { MdxModule } from "./content";

interface TocHeading {
    readonly id: string;
    readonly label: string;
    readonly level: 2 | 3;
}

const PAGE_COMPONENTS = new Map<string, LazyExoticComponent<MdxModule["default"]>>();

function pageComponent(page: DocsPage): LazyExoticComponent<MdxModule["default"]> | null {
    const loader = docsContentLoader(page.path);
    if (loader === null) {
        return null;
    }
    const cached = PAGE_COMPONENTS.get(page.path);
    if (cached !== undefined) {
        return cached;
    }
    const loaded = lazy(loader as () => Promise<MdxModule>);
    PAGE_COMPONENTS.set(page.path, loaded);
    return loaded;
}

function headingList(page: DocsPage): readonly TocHeading[] {
    return page.sections.map((section) => ({
        id: slugifyHeading(section),
        label: section,
        level: 2,
    }));
}

function setMeta(name: string, content: string): void {
    let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (meta === null) {
        meta = document.createElement("meta");
        meta.name = name;
        document.head.append(meta);
    }
    meta.content = content;
}

function DocsSidebar({
    page,
    headings,
    onNavigate,
    searchButton,
}: {
    page: DocsPage | null;
    headings: readonly TocHeading[];
    onNavigate: (href: string) => void;
    searchButton: React.RefObject<HTMLButtonElement | null>;
}) {
    const activeEntry = useRef<HTMLLIElement>(null);

    useEffect(() => {
        activeEntry.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [page?.id, headings.length]);

    return (
        <>
            <div className="docs-sidebar__top">
                <p className="docs-sidebar__eyebrow">Av1ation Station</p>
                <p className="docs-sidebar__title">Manual</p>
                <button
                    ref={searchButton}
                    type="button"
                    className="docs-search-trigger"
                    onClick={() => {
                        const event = new CustomEvent("docs-open-search");
                        window.dispatchEvent(event);
                    }}
                >
                    <span>Search the manual</span>
                    <kbd>Ctrl K</kbd>
                </button>
            </div>
            <nav className="docs-sidebar__nav" aria-label="Documentation">
                {DOCS_GROUPS.map((group) => (
                    <section key={group.id} className="docs-sidebar__group">
                        <h2>{group.label}</h2>
                        <ul>
                            {pagesInGroup(group.id).map((entry) => (
                                <li
                                    key={entry.id}
                                    ref={page?.id === entry.id ? activeEntry : undefined}
                                    className="docs-sidebar__entry"
                                >
                                    <a
                                        href={entry.path}
                                        aria-current={page?.id === entry.id ? "page" : undefined}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            onNavigate(entry.path);
                                        }}
                                    >
                                        {entry.title}
                                    </a>
                                    {page?.id === entry.id && headings.length > 0 ? (
                                        <nav
                                            className="docs-sidebar__toc"
                                            aria-label="Page sections"
                                        >
                                            <ol>
                                                {headings.map((heading) => (
                                                    <li
                                                        key={heading.id}
                                                        data-level={heading.level}
                                                    >
                                                        <a
                                                            href={`#${heading.id}`}
                                                            onClick={(event) => {
                                                                event.preventDefault();
                                                                onNavigate(
                                                                    `${entry.path}#${heading.id}`,
                                                                );
                                                            }}
                                                        >
                                                            {heading.label}
                                                        </a>
                                                    </li>
                                                ))}
                                            </ol>
                                        </nav>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </nav>
        </>
    );
}

function Drawer({
    page,
    headings,
    onNavigate,
    onClose,
    trigger,
}: {
    page: DocsPage | null;
    headings: readonly TocHeading[];
    onNavigate: (href: string) => void;
    onClose: () => void;
    trigger: React.RefObject<HTMLButtonElement | null>;
}) {
    const panel = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        panel.current?.querySelector<HTMLElement>("a, button")?.focus();
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    useEffect(() => {
        trigger.current?.focus();
    }, [trigger]);

    return (
        <div className="docs-drawer" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
                onClose();
            }
        }}>
            <div
                ref={panel}
                className="docs-drawer__panel"
                role="dialog"
                aria-modal="true"
                aria-label="Documentation contents"
            >
                <div className="docs-drawer__bar">
                    <p>Contents</p>
                    <button type="button" onClick={onClose} aria-label="Close contents">
                        Close
                    </button>
                </div>
                <DocsSidebar
                    page={page}
                    headings={headings}
                    onNavigate={onNavigate}
                    searchButton={{ current: null }}
                />
            </div>
        </div>
    );
}

/**
 * The public manual shell.
 *
 * One route table, one content manifest, one MDX vocabulary. Navigation is client-side for
 * internal docs links and falls back to normal browser behavior for modifier clicks and
 * external links. The site header stays the shared marketing header.
 */
export function DocsApp({ initialPath }: { initialPath: string }) {
    const [path, setPath] = useState(() => normalizeDocsPath(initialPath));
    const [searchOpen, setSearchOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [headings, setHeadings] = useState<readonly TocHeading[]>([]);
    const articleRef = useRef<HTMLDivElement>(null);
    const menuButton = useRef<HTMLButtonElement>(null);
    const searchButton = useRef<HTMLButtonElement>(null);
    const page = DOCS_PAGE_BY_PATH.get(normalizeDocsPath(path.split("#")[0] ?? path)) ?? null;

    const navigate = useCallback((href: string) => {
        const [target, hash] = href.split("#");
        const normalized = normalizeDocsPath(target ?? href);
        if (!isDocsPath(normalized)) {
            window.location.assign(href);
            return;
        }
        window.history.pushState({ docs: normalized }, "", hash === undefined ? normalized : `${normalized}#${hash}`);
        setPath(normalized);
        setDrawerOpen(false);
        setSearchOpen(false);
        if (hash !== undefined) {
            requestAnimationFrame(() => {
                document.getElementById(hash)?.scrollIntoView({ block: "start" });
            });
        }
    }, []);

    useEffect(() => {
        const onPopState = (): void => {
            setPath(normalizeDocsPath(window.location.pathname));
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    useEffect(() => {
        const onOpenSearch = (): void => setSearchOpen(true);
        const onKeyDown = (event: KeyboardEvent): void => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setSearchOpen(true);
            }
        };
        window.addEventListener("docs-open-search", onOpenSearch);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("docs-open-search", onOpenSearch);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, []);

    useEffect(() => {
        if (page === null) {
            document.title = "Page not found — Av1ation Station";
            return;
        }
        document.title = `${page.title} — Av1ation Station documentation`;
        setMeta("description", page.description);
        setHeadings(headingList(page));
        const frame = requestAnimationFrame(() => {
            window.scrollTo({ top: 0, left: 0 });
            document.getElementById("docs-title")?.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(frame);
    }, [page]);

    // The outline is deliberately limited to the page's real sections. Numbered procedure
    // steps and the related-links footer are children of the content, not chapters, so the
    // active-page list stays short and scannable.
    useEffect(() => {
        const node = articleRef.current;
        if (node === null) {
            return;
        }
        const collect = (): void => {
            const next: TocHeading[] = [];
            for (const heading of node.querySelectorAll<HTMLHeadingElement>("h2")) {
                if (
                    heading.closest(".docs-app-widget") !== null ||
                    heading.closest(".docs-step__title") !== null ||
                    heading.closest(".docs-related") !== null
                ) {
                    continue;
                }
                const id = heading.id || slugifyHeading(heading.textContent ?? "");
                if (id === "" || next.some((entry) => entry.id === id)) {
                    continue;
                }
                heading.id = id;
                // A numbered step's decorative index is not part of its name.
                const label = heading.cloneNode(true) as HTMLElement;
                for (const decorative of label.querySelectorAll('[aria-hidden="true"]')) {
                    decorative.remove();
                }
                next.push({
                    id,
                    label: label.textContent?.trim() ?? "",
                    level: 2,
                });
            }
            setHeadings(next);
        };
        collect();
        const observer = new MutationObserver(collect);
        observer.observe(node, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [page]);

    const Content = useMemo(() => (page === null ? null : pageComponent(page)), [page]);
    const neighbours = page === null ? { previous: null, next: null } : docsNeighbours(page.id);
    const group = page === null ? null : DOCS_GROUPS.find((entry) => entry.id === page.group);

    if (page === null) {
        return (
            <div className="site site--docs">
                <a className="skip-link" href="#site-main">
                    Skip to content
                </a>
                <SiteHeader />
                <main id="site-main" className="docs-missing">
                    <p className="docs-article__eyebrow">404</p>
                    <h1 id="docs-title">That page is not in the manual.</h1>
                    <p>
                        The documentation index lists every page that ships.{" "}
                        <a href="/docs/">Go to the documentation home</a>.
                    </p>
                </main>
                <SiteFooter />
            </div>
        );
    }

    return (
        <DocsNavigationContext.Provider value={navigate}>
            <div className="site site--docs">
                <a className="skip-link" href="#site-main">
                    Skip to content
                </a>
                <SiteHeader />
                <div className="docs-mobilebar">
                    <button
                        ref={menuButton}
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        aria-expanded={drawerOpen}
                        aria-controls="docs-sidebar"
                    >
                        Contents
                    </button>
                    <button type="button" onClick={() => setSearchOpen(true)}>
                        Search
                    </button>
                </div>
                <div className="docs-shell">
                    <aside id="docs-sidebar" className="docs-sidebar">
                        <DocsSidebar
                            page={page}
                            headings={headings}
                            onNavigate={navigate}
                            searchButton={searchButton}
                        />
                    </aside>
                    <main id="site-main" className="docs-main">
                        <nav className="docs-breadcrumb" aria-label="Breadcrumb">
                            <a
                                href="/docs/"
                                onClick={(event) => {
                                    event.preventDefault();
                                    navigate("/docs");
                                }}
                            >
                                Documentation
                            </a>
                            <span aria-hidden="true">/</span>
                            <span>{group?.label}</span>
                            <span aria-hidden="true">/</span>
                            <span aria-current="page">{page.title}</span>
                        </nav>
                        <div ref={articleRef}>
                            <article className="docs-article" aria-labelledby="docs-title">
                                <p className="docs-article__eyebrow">
                                    {group?.label} · {page.id}
                                </p>
                                <h1 id="docs-title" tabIndex={-1} className="docs-article__title">
                                    {page.title}
                                </h1>
                                <p className="docs-article__lede">{page.description}</p>
                                <Suspense fallback={<p className="docs-loading">Loading the page…</p>}>
                                    {Content === null ? (
                                        <p className="docs-loading">
                                            No content file was found for this page.
                                        </p>
                                    ) : (
                                        <Content components={DOCS_COMPONENTS} />
                                    )}
                                </Suspense>
                            </article>
                        </div>
                        <nav className="docs-adjacent" aria-label="Previous and next pages">
                            {neighbours.previous === null ? (
                                <span />
                            ) : (
                                <a
                                    href={neighbours.previous.path}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        navigate(neighbours.previous?.path ?? "/docs");
                                    }}
                                >
                                    <span>Previous</span>
                                    {neighbours.previous.title}
                                </a>
                            )}
                            {neighbours.next === null ? (
                                <span />
                            ) : (
                                <a
                                    className="docs-adjacent__next"
                                    href={neighbours.next.path}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        navigate(neighbours.next?.path ?? "/docs");
                                    }}
                                >
                                    <span>Next</span>
                                    {neighbours.next.title}
                                </a>
                            )}
                        </nav>
                    </main>
                </div>
                <SiteFooter />
                <DocsSearch open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={navigate} />
                {drawerOpen ? (
                    <Drawer
                        page={page}
                        headings={headings}
                        onNavigate={navigate}
                        onClose={() => setDrawerOpen(false)}
                        trigger={menuButton}
                    />
                ) : null}
            </div>
        </DocsNavigationContext.Provider>
    );
}
