import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { useConcatSourceInfo } from "@av1ation/api";
import type { ConcatChapter, ConcatMetadataEntry } from "@av1ation/contracts";

import { Button } from "../../shared/Button";
import { Sheet } from "../../shared/Sheet";

/** Which read-only source view the sheet is showing. */
export type SourceDetailsView = "chapters" | "metadata";

const TAB_LABELS: Record<SourceDetailsView, string> = {
    chapters: "Chapters",
    metadata: "Metadata",
};

function chapterTime(seconds: number): string {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    return hours > 0
        ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
        : `${String(minutes)}:${String(remainder).padStart(2, "0")}`;
}

function ChapterList({ chapters }: { chapters: ConcatChapter[] }) {
    return (
        <ol aria-label="Source chapters" className="m-0 list-none p-0">
            {chapters.map((chapter) => {
                const end = chapter.end_seconds;
                return (
                    <li
                        key={chapter.index}
                        className="flex gap-3 border-b border-line-subtle py-2.5 last:border-b-0"
                    >
                        <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-[10px] text-ink-muted tabular-nums">
                            {chapter.index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="m-0 truncate text-[11.5px] font-medium text-ink">
                                {chapter.title ?? `Chapter ${String(chapter.index + 1)}`}
                            </p>
                            <p className="m-0 mt-0.5 font-mono text-[10px] text-ink-muted tabular-nums">
                                {chapterTime(chapter.start_seconds)}
                                {end === null || end === undefined ? "" : ` – ${chapterTime(end)}`}
                            </p>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

function MetadataList({ entries }: { entries: ConcatMetadataEntry[] }) {
    return (
        <dl aria-label="Source metadata" className="m-0">
            {entries.map((entry, index) => (
                <div
                    key={`${entry.key}-${String(index)}`}
                    className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 border-b border-line-subtle py-2.5 last:border-b-0"
                >
                    <dt
                        className="m-0 truncate font-mono text-[10px] text-ink-muted"
                        title={entry.key}
                    >
                        {entry.key}
                    </dt>
                    <dd className="m-0 break-words font-mono text-[11px] leading-relaxed text-ink">
                        {entry.value}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

/**
 * The one read-only source sheet.
 *
 * `view` selects the tab to open; the user can switch tabs without closing it. Both tabs
 * share one query and one sheet shell, so opening the second tab after the first reuses the
 * cached source document instead of starting another FFmpeg process. The query stays disabled
 * until a view is requested.
 */
export function SourceDetailsSheet({
    projectId,
    videoId,
    view,
    onClose,
}: {
    projectId: string;
    videoId: string;
    view: SourceDetailsView | null;
    onClose: () => void;
}) {
    const [activeView, setActiveView] = useState<SourceDetailsView>("chapters");
    const tabRefs = useRef<Record<SourceDetailsView, HTMLButtonElement | null>>({
        chapters: null,
        metadata: null,
    });
    const sourceInfo = useConcatSourceInfo(projectId, videoId, view !== null);

    useEffect(() => {
        if (view !== null) {
            setActiveView(view);
        }
    }, [view]);

    const isChapters = activeView === "chapters";
    const chapters = sourceInfo.data?.chapters ?? [];
    const metadata = sourceInfo.data?.metadata ?? [];
    const detail = isChapters
        ? (sourceInfo.data?.chapters_detail ?? "")
        : (sourceInfo.data?.metadata_detail ?? "");
    const empty = isChapters ? chapters.length === 0 : metadata.length === 0;
    const error = sourceInfo.isError
        ? sourceInfo.error instanceof Error
            ? sourceInfo.error.message
            : `The source's ${isChapters ? "chapters" : "metadata"} could not be read.`
        : null;

    const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
        let next: SourceDetailsView | null = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            next = activeView === "chapters" ? "metadata" : "chapters";
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            next = activeView === "chapters" ? "metadata" : "chapters";
        } else if (event.key === "Home") {
            next = "chapters";
        } else if (event.key === "End") {
            next = "metadata";
        }
        if (next === null) {
            return;
        }
        event.preventDefault();
        setActiveView(next);
        tabRefs.current[next]?.focus();
    };

    return (
        <Sheet
            open={view !== null}
            eyebrow="SOURCE · READ-ONLY"
            title="Source details"
            description={
                isChapters
                    ? "Read-only. Choosing whether to copy them stays on the Chapters card."
                    : "Read-only. Whether tags are copied and any explicit tags stay on the Metadata card."
            }
            onClose={onClose}
            footer={
                <Button variant="secondary" onClick={onClose}>
                    Close
                </Button>
            }
        >
            <div
                role="tablist"
                aria-label="Source details views"
                onKeyDown={onTabKey}
                className="mb-4 flex items-center gap-1 border-b border-line"
            >
                {(["chapters", "metadata"] as const).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        id={`source-details-tab-${tab}`}
                        aria-controls="source-details-panel"
                        aria-selected={activeView === tab}
                        tabIndex={activeView === tab ? 0 : -1}
                        onClick={() => setActiveView(tab)}
                        ref={(element) => {
                            tabRefs.current[tab] = element;
                        }}
                        className={`-mb-px border-b-2 px-3 py-2.5 text-[11.5px] transition-colors duration-150 ${
                            activeView === tab
                                ? "border-brand text-ink"
                                : "border-transparent text-ink-muted hover:text-ink-secondary"
                        }`}
                    >
                        {TAB_LABELS[tab]}
                    </button>
                ))}
            </div>

            <div
                role="tabpanel"
                id="source-details-panel"
                aria-labelledby={`source-details-tab-${activeView}`}
            >
                {sourceInfo.isPending ? (
                    <p className="m-0 text-[11.5px] text-ink-muted">
                        Reading {isChapters ? "chapters" : "metadata"}…
                    </p>
                ) : error !== null ? (
                    <p role="alert" className="m-0 text-[11.5px] leading-relaxed text-danger">
                        {error}
                    </p>
                ) : empty ? (
                    <p className="m-0 text-[11.5px] leading-relaxed text-ink-secondary">
                        {detail === ""
                            ? isChapters
                                ? "This source has no chapters."
                                : "This source reports no global metadata."
                            : detail}
                    </p>
                ) : isChapters ? (
                    <ChapterList chapters={chapters} />
                ) : (
                    <MetadataList entries={metadata} />
                )}
            </div>
        </Sheet>
    );
}
