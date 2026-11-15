import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { DOCS_PAGE_BY_ID, slugifyHeading } from "./manifest";
import { openDocsSearch, type DocsSearchEngine, type DocsSearchHit } from "./search";

export function DocsSearch({
    open,
    onClose,
    onNavigate,
}: {
    open: boolean;
    onClose: () => void;
    onNavigate: (href: string) => void;
}) {
    const [query, setQuery] = useState("");
    const [engine, setEngine] = useState<DocsSearchEngine | null>(null);
    const [active, setActive] = useState(0);
    const [failed, setFailed] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const returnFocus = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setQuery("");
        setActive(0);
        setFailed(false);
        const frame = requestAnimationFrame(() => inputRef.current?.focus());
        let cancelled = false;
        void openDocsSearch()
            .then((next) => {
                if (!cancelled) {
                    setEngine(next);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setFailed(true);
                }
            });
        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
        };
    }, [open]);

    useEffect(() => {
        if (open) {
            return;
        }
        returnFocus.current?.focus();
    }, [open]);

    const hits = useMemo<readonly DocsSearchHit[]>(() => {
        if (engine === null || query.trim() === "") {
            return [];
        }
        return engine.search(query);
    }, [engine, query]);

    useEffect(() => {
        setActive(0);
    }, [query]);

    if (!open) {
        return null;
    }

    const choose = (hit: DocsSearchHit): void => {
        const page = DOCS_PAGE_BY_ID.get(hit.pageId);
        if (page === undefined) {
            return;
        }
        const section = slugifyHeading(hit.section);
        onNavigate(section === "" ? page.path : `${page.path}#${section}`);
        onClose();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => Math.min(current + 1, Math.max(hits.length - 1, 0)));
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, 0));
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            const hit = hits[active];
            if (hit !== undefined) {
                choose(hit);
            }
        }
    };

    let previousPage = "";
    return (
        <div
            className="docs-search"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                className="docs-search__panel"
                role="dialog"
                aria-modal="true"
                aria-label="Search documentation"
            >
                <div className="docs-search__field">
                    <label htmlFor="docs-search-input" className="sr-only">
                        Search the documentation
                    </label>
                    <input
                        ref={inputRef}
                        id="docs-search-input"
                        type="search"
                        value={query}
                        placeholder="Search the manual…"
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={onKeyDown}
                    />
                    <button type="button" onClick={onClose} aria-label="Close search">
                        Esc
                    </button>
                </div>
                <div className="docs-search__results" role="listbox" aria-label="Search results">
                    {failed ? (
                        <p className="docs-search__empty">
                            The search index could not be loaded. Reload the page to try again.
                        </p>
                    ) : query.trim() === "" ? (
                        <p className="docs-search__empty">
                            Search page titles, sections, field names, and guide steps. Press{" "}
                            <kbd>Ctrl</kbd> + <kbd>K</kbd> from anywhere in the manual.
                        </p>
                    ) : engine === null ? (
                        <p className="docs-search__empty">Loading the index…</p>
                    ) : hits.length === 0 ? (
                        <p className="docs-search__empty">
                            No page matches “{query.trim()}”. Try the guide name or a field label.
                        </p>
                    ) : (
                        hits.map((hit, index) => {
                            const showPage = hit.pageTitle !== previousPage;
                            previousPage = hit.pageTitle;
                            return (
                                <div key={hit.id}>
                                    {showPage ? (
                                        <p className="docs-search__group">{hit.pageTitle}</p>
                                    ) : null}
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={index === active}
                                        className="docs-search__hit"
                                        onMouseEnter={() => setActive(index)}
                                        onClick={() => choose(hit)}
                                    >
                                        <span className="docs-search__section">{hit.section}</span>
                                        <span className="docs-search__snippet">{hit.snippet}</span>
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
                <p className="docs-search__hint">
                    <span>
                        <kbd>↑</kbd> <kbd>↓</kbd> move
                    </span>
                    <span>
                        <kbd>Enter</kbd> open
                    </span>
                    <span>
                        <kbd>Esc</kbd> close
                    </span>
                </p>
            </div>
        </div>
    );
}
