import {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";

import {
    useExportRunLog,
    useRunLogPage,
    useRunLogPages,
    useVideo,
    useVideoRuns,
    useVideoState,
    type RunLogRequest,
} from "@av1ation/api";
import type { LogRecord } from "@av1ation/contracts";
import { useParams, useSearch } from "@tanstack/react-router";
import { Download, RefreshCw, ScrollText, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { DeleteRunDialog } from "./DeleteRunDialog";
import { Switch } from "../../shared/Switch";
import { VideoRunActions } from "../videos/VideoRunActions";
import { VideoTabs } from "../videos/VideoTabs";
import { runLength } from "../../shared/duration";
import {
    elapsedSeconds,
    fromContractOutcome,
    runOutcome,
    runWhen,
} from "../../shared/model/run-presentation";
import { STATUS_CHIP_TONES, failureSummary } from "../../shared/model/video-status";
import { LogErrorPanel } from "./LogErrorPanel";
import { LogExportSheet } from "./LogExportSheet";
import { LogFilterBar } from "./LogFilterBar";
import { LogLineMenu } from "./LogLineMenu";
import { LogSortHeader } from "./LogSortHeader";
import {
    COLUMNS,
    LEVELS,
    LEVEL_CHIP,
    clock,
    type Level,
    type LogMenu,
    type SortColumn,
} from "./log-format";

const PAGE_SIZE = 400;
/** One fixed-height line. A log row never wraps, so the virtualizer can size the scrollbar. */
const ROW_HEIGHT = 22;

/** How long a touch has to rest on a row before the copy menu opens. */
const LONG_PRESS_MS = 480;

function useDebouncedValue(value: string, delay: number): string {
    const [settled, setSettled] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setSettled(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);
    return settled;
}

/** Marks the search needle inside a line without splitting it into a regex. */
function Highlight({ text, needle }: { text: string; needle: string }) {
    if (needle === "") {
        return text;
    }
    const lower = text.toLowerCase();
    const wanted = needle.toLowerCase();
    const parts: Array<{ text: string; match: boolean }> = [];
    let cursor = 0;
    let found = lower.indexOf(wanted);
    while (found >= 0) {
        if (found > cursor) {
            parts.push({ text: text.slice(cursor, found), match: false });
        }
        parts.push({ text: text.slice(found, found + wanted.length), match: true });
        cursor = found + wanted.length;
        found = lower.indexOf(wanted, cursor);
    }
    if (cursor < text.length) {
        parts.push({ text: text.slice(cursor), match: false });
    }
    return (
        <>
            {parts.map((part, index) =>
                part.match ? (
                    <mark key={index} className="rounded-xs bg-brand/25 px-0.5 text-ink">
                        {part.text}
                    </mark>
                ) : (
                    <span key={index}>{part.text}</span>
                ),
            )}
        </>
    );
}

/**
 * One run's log, newest lines first on open.
 *
 * A log can be tens of thousands of lines, so the page never renders the file: the viewer
 * asks for the tail and for the aligned pages under the viewport, and a fixed-height
 * virtualizer paints only the rows on screen. Follow polls only the tail of a live run.
 */
export function LogsScreen() {
    const { projectId, videoId } = useParams({
        from: "/projects/$projectId/videos/$videoId/logs",
    });
    // A History card can name the run it wants opened. The run is only a starting point:
    // the selector below still moves the viewer, and the effect falls back to the newest
    // log when this id no longer exists.
    const { run: linkedRun } = useSearch({
        from: "/projects/$projectId/videos/$videoId/logs",
    });
    const video = useVideo(projectId, videoId);
    const state = useVideoState(projectId, videoId);
    const runs = useVideoRuns(projectId, videoId);

    const [chosenRun, setChosenRun] = useState<string | null>(linkedRun ?? null);
    // At least one level stays visible: with none, the viewer would show an empty table with
    // no setting that looks wrong, which is worse than refusing the last toggle off.
    const [levels, setLevels] = useState<Set<Level>>(new Set(["info", "warn", "error"]));
    const [sort, setSort] = useState<{ column: SortColumn; direction: "asc" | "desc" }>({
        column: "seq",
        direction: "asc",
    });
    const [searchInput, setSearchInput] = useState("");
    const search = useDebouncedValue(searchInput.trim(), 250);
    const [followOverride, setFollowOverride] = useState<boolean | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(520);
    const [atBottom, setAtBottom] = useState(true);
    const [exportOpen, setExportOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    // A right click, or a long press on a touch screen, opens the same line actions. The
    // viewer is a virtualized list of non-editable rows, so the browser's own copy gesture
    // is unreliable there; this gives both input methods one explicit route.
    const [menu, setMenu] = useState<LogMenu | null>(null);
    const pressTimer = useRef<number | null>(null);
    const pressOrigin = useRef<{ x: number; y: number } | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const initialised = useRef(false);

    // A new run is selected when the list first arrives, and a run that disappeared from
    // the list (a deleted log) falls back to the newest one rather than an empty screen.
    useEffect(() => {
        if (runs.data === undefined || runs.data.length === 0) {
            return;
        }
        if (chosenRun === null || !runs.data.some((run) => run.run_id === chosenRun)) {
            setChosenRun(runs.data[0]?.run_id ?? null);
        }
    }, [runs.data, chosenRun]);

    const selected = runs.data?.find((run) => run.run_id === chosenRun) ?? runs.data?.[0];
    const runId = selected?.run_id ?? "";
    const exportLog = useExportRunLog(runId);
    const deleteRun = runs.data?.find((run) => run.run_id === deleteTarget);
    const running = selected?.outcome === "running";
    const follow = running && (followOverride ?? true);

    useEffect(() => {
        setFollowOverride(null);
    }, [runId]);

    const level = useMemo(() => [...levels].sort().join(","), [levels]);
    const direction = sort.direction;
    const tailRequest = useMemo<RunLogRequest>(
        () => ({
            tail: true,
            limit: PAGE_SIZE,
            level,
            search,
            sort: sort.column,
            direction,
        }),
        [level, search, sort.column, direction],
    );
    const tail = useRunLogPage(runId, tailRequest, runId !== "", follow ? 1_200 : false);
    const total = tail.data?.total ?? 0;
    const tailRecords = tail.data?.records ?? [];
    const tailStart = Math.max(0, total - tailRecords.length);

    // A long log opens at its newest line; following keeps it there as the run grows. The
    // view key resets the opening scroll when the run or a filter changes, before the new
    // page's total can be mistaken for the old one's.
    const viewKey = `${runId}\u0000${level}\u0000${search}\u0000${sort.column}\u0000${direction}`;
    const lastView = useRef("");
    useLayoutEffect(() => {
        if (lastView.current !== viewKey) {
            lastView.current = viewKey;
            initialised.current = false;
        }
        const element = scrollRef.current;
        if (element === null || total === 0) {
            return;
        }
        if (!initialised.current || follow) {
            element.scrollTop = element.scrollHeight;
            initialised.current = true;
            setAtBottom(true);
        }
    }, [viewKey, total, follow]);

    useEffect(() => {
        const element = scrollRef.current;
        if (element === null) {
            return;
        }
        const measure = () => setViewportHeight(element.clientHeight || 520);
        measure();
        if (typeof ResizeObserver === "undefined") {
            return;
        }
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [tail.isPending, total]);

    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 24);
    const endIndex = Math.min(total, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + 24);

    // Aligned pages under the viewport. A page the tail already covers is not requested a
    // second time; the partial page that straddles the tail is still fetched for the rows
    // above it, and the tail wins for the overlap.
    const pageStarts = useMemo(() => {
        if (total === 0 || endIndex <= startIndex) {
            return [];
        }
        const first = Math.floor(startIndex / PAGE_SIZE) * PAGE_SIZE;
        const last = Math.floor((endIndex - 1) / PAGE_SIZE) * PAGE_SIZE;
        const starts: number[] = [];
        for (let start = first; start <= last; start += PAGE_SIZE) {
            if (start < tailStart) {
                starts.push(start);
            }
        }
        return starts;
    }, [startIndex, endIndex, total, tailStart]);

    const pageRequests = useMemo<RunLogRequest[]>(
        () =>
            pageStarts.map((offset) => ({
                offset,
                limit: PAGE_SIZE,
                level,
                search,
                sort: sort.column,
                direction,
            })),
        [pageStarts, level, search, sort.column, direction],
    );
    const pages = useRunLogPages(runId, pageRequests, runId !== "" && total > 0);
    const pageData = useMemo(() => {
        const map = new Map<number, LogRecord[]>();
        pageStarts.forEach((start, index) => {
            const data = pages[index]?.data;
            if (data !== undefined) {
                map.set(start, data.records);
            }
        });
        return map;
    }, [pageStarts, pages]);

    const recordAt = (index: number): LogRecord | undefined => {
        if (index >= tailStart) {
            return tailRecords[index - tailStart];
        }
        const start = Math.floor(index / PAGE_SIZE) * PAGE_SIZE;
        return pageData.get(start)?.[index - start];
    };

    const onScroll = () => {
        const element = scrollRef.current;
        if (element === null) {
            return;
        }
        const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
        setScrollTop(element.scrollTop);
        setAtBottom(bottom);
        // A line menu describes one place in the file; scrolling moves it.
        setMenu(null);
        // Scrolling up is an intentional pause, not a fight with the tail poll.
        if (follow && !bottom) {
            setFollowOverride(false);
        }
    };

    const copy = async (text: string, what: string) => {
        setMenu(null);
        try {
            if (navigator.clipboard === undefined) {
                throw new Error("no clipboard");
            }
            await navigator.clipboard.writeText(text);
            toast.success(`${what} copied`);
        } catch {
            toast.error("The clipboard is not available in this window.");
        }
    };

    const cancelPress = () => {
        if (pressTimer.current !== null) {
            window.clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
        pressOrigin.current = null;
    };

    /** A touch rests on a row for a moment; a scroll or a lift cancels the menu. */
    const beginPress = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== "touch") {
            return;
        }
        cancelPress();
        const target = event.currentTarget;
        const { clientX, clientY } = event;
        pressOrigin.current = { x: clientX, y: clientY };
        pressTimer.current = window.setTimeout(() => {
            pressTimer.current = null;
            // A long press has no browser context-menu event, and Radix anchors the
            // popup from one. Dispatch it at the touch point so the menu opens there.
            target.dispatchEvent(
                new MouseEvent("contextmenu", {
                    bubbles: true,
                    cancelable: true,
                    button: 2,
                    clientX,
                    clientY,
                }),
            );
        }, LONG_PRESS_MS);
    };

    const trackPress = (event: ReactPointerEvent<HTMLDivElement>) => {
        const origin = pressOrigin.current;
        if (
            origin !== null &&
            (Math.abs(event.clientX - origin.x) > 8 || Math.abs(event.clientY - origin.y) > 8)
        ) {
            cancelPress();
        }
    };

    const refresh = () => {
        void runs.refetch();
        void tail.refetch();
    };

    const openExport = () => {
        setExportOpen(true);
        exportLog.mutate();
    };

    const retry = () => {
        void runs.refetch();
        void tail.refetch();
    };

    // Every state keeps the video's own navigation: the tab strip and the run controls
    // describe the video, not the selected run, so a list that is still loading, failed,
    // or empty must not replace them with a bare document.
    const pageShell = (body: ReactNode, note: ReactNode) => (
        <main id="main" className="flex min-h-[calc(100dvh-56px)] flex-col">
            {/* The tab strip replaces the visible page title, so the destination still names itself. */}
            <h1 className="sr-only">Logs</h1>
            <VideoTabs projectId={projectId} videoId={videoId} active="logs" note={note} />
            <VideoRunActions projectId={projectId} videoId={videoId} state={state.data} />
            <div className="page flex-1 py-4">{body}</div>
        </main>
    );

    if (runs.isPending) {
        return pageShell(
            <div aria-busy="true" className="space-y-3">
                <div className="h-11 animate-pulse rounded-lg border border-line bg-surface" />
                <div className="h-[480px] animate-pulse rounded-lg border border-line bg-surface" />
            </div>,
            "Loading runs",
        );
    }

    if (runs.isError) {
        return pageShell(
            <LogErrorPanel
                message={
                    runs.error instanceof Error
                        ? runs.error.message
                        : "The run history could not be read."
                }
                onRetry={() => void runs.refetch()}
            />,
            "Run history unavailable",
        );
    }

    if ((runs.data ?? []).length === 0) {
        return pageShell(
            <section className="rounded-lg border border-line bg-surface px-6 py-10 text-center">
                <ScrollText
                    aria-hidden="true"
                    className="mx-auto h-7 w-7 text-ink-muted"
                    strokeWidth={1.4}
                />
                <p className="mt-3 mb-1 text-sm font-medium text-ink">No runs yet</p>
                <p className="mx-auto mt-0 max-w-[52ch] text-[12px] leading-relaxed text-ink-secondary">
                    A log is written the moment an encode starts. Run{" "}
                    {video.data?.name ?? "this video"} and its events appear here.
                </p>
            </section>,
            "No runs recorded",
        );
    }

    const filtered = levels.size < LEVELS.length || search !== "";
    const chip = selected === undefined ? null : runOutcome(fromContractOutcome(selected.outcome));
    const elapsed =
        selected === undefined ? null : elapsedSeconds(selected.started_at, selected.ended_at);
    const durationText =
        selected === undefined
            ? null
            : selected.ended_at === undefined || selected.ended_at === null
              ? "Elapsed time is shown when the run ends"
              : elapsed === null
                ? null
                : runLength(elapsed);
    const toggleLevel = (value: Level) => {
        setLevels((current) => {
            if (current.has(value)) {
                if (current.size === 1) {
                    return current;
                }
                const next = new Set(current);
                next.delete(value);
                return next;
            }
            return new Set([...current, value]);
        });
    };
    const sortBy = (column: SortColumn) => {
        setSort((current) =>
            current.column === column
                ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
                : { column, direction: "asc" },
        );
    };
    return pageShell(
        <>
            <section
                aria-label="Run log"
                className="overflow-hidden rounded-lg border border-line bg-surface"
            >
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
                    <label
                        htmlFor="run-select"
                        className="text-[10px] font-medium tracking-[0.12em] text-ink-muted uppercase"
                    >
                        Run
                    </label>
                    <select
                        id="run-select"
                        value={runId}
                        onChange={(event) => {
                            setChosenRun(event.target.value);
                            setExportOpen(false);
                            setDeleteTarget(null);
                            exportLog.reset();
                        }}
                        className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-sunken px-2 text-[12px] text-ink focus:border-brand focus:outline-none sm:max-w-[340px]"
                    >
                        {(runs.data ?? []).map((run) => {
                            const outcome = runOutcome(fromContractOutcome(run.outcome));
                            return (
                                <option key={run.run_id} value={run.run_id}>
                                    {`Run · ${runWhen(run.started_at)}${
                                        outcome.recorded ? ` · ${outcome.label}` : ""
                                    }`}
                                </option>
                            );
                        })}
                    </select>
                    {chip !== null && chip.recorded ? (
                        <span
                            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_CHIP_TONES[chip.tone]}`}
                        >
                            {chip.label}
                        </span>
                    ) : null}
                    {selected === undefined ? null : (
                        <span
                            className="hidden text-[11px] text-ink-muted tabular-nums sm:inline"
                            data-tip={selected.message ?? undefined}
                        >
                            {runWhen(selected.started_at)}
                            {durationText === null ? "" : ` · ${durationText}`}
                        </span>
                    )}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <Button
                            variant="ghost"
                            className="h-8 px-2 text-[11.5px]"
                            onClick={refresh}
                            aria-label="Refresh runs and log"
                            data-tip="Refresh runs and log"
                        >
                            <RefreshCw
                                aria-hidden="true"
                                className={`h-3.5 w-3.5 ${runs.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`}
                            />
                            Refresh
                        </Button>
                        <div
                            className={`flex h-8 items-center gap-2 rounded-md border border-line px-2.5 text-[11.5px] ${
                                running ? "text-ink-secondary" : "text-ink-muted"
                            }`}
                            data-tip={
                                running
                                    ? "Keep the newest lines in view as the run writes them"
                                    : "Follow is only available while the run is live"
                            }
                        >
                            Follow
                            <Switch
                                checked={follow}
                                label="Follow the active run"
                                disabled={!running}
                                onChange={(next) => setFollowOverride(next)}
                            />
                        </div>
                        <Button
                            variant="secondary"
                            className="h-8 px-3 text-[11.5px]"
                            onClick={openExport}
                            disabled={runId === ""}
                        >
                            <Download aria-hidden="true" className="h-3.5 w-3.5" />
                            Export
                        </Button>
                        <Button
                            variant="dangerOutline"
                            className="h-8 px-3 text-[11.5px]"
                            onClick={() => setDeleteTarget(runId)}
                            disabled={runId === "" || running}
                        >
                            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                            Delete
                        </Button>
                    </div>
                </div>

                <LogFilterBar
                    searchInput={searchInput}
                    onSearchChange={setSearchInput}
                    levels={levels}
                    onAllLevels={() => setLevels(new Set(LEVELS.map((entry) => entry.value)))}
                    onToggleLevel={toggleLevel}
                    total={total}
                    filtered={filtered}
                />

                <LogSortHeader sort={sort} onSort={sortBy} />

                {tail.isPending ? (
                    <div className="flex h-[480px] items-center justify-center text-[12px] text-ink-muted">
                        Opening the log…
                    </div>
                ) : tail.isError ? (
                    <div className="p-4">
                        <LogErrorPanel
                            message={
                                tail.error instanceof Error
                                    ? tail.error.message
                                    : "The run log could not be read."
                            }
                            onRetry={retry}
                        />
                    </div>
                ) : total === 0 ? (
                    <div className="flex h-[320px] flex-col items-center justify-center gap-1 px-6 text-center">
                        <ScrollText
                            aria-hidden="true"
                            className="h-6 w-6 text-ink-muted"
                            strokeWidth={1.4}
                        />
                        <p className="m-0 text-[12.5px] font-medium text-ink">
                            {filtered ? "No lines match" : "No lines yet"}
                        </p>
                        <p className="m-0 max-w-[52ch] text-[11.5px] leading-relaxed text-ink-secondary">
                            {filtered
                                ? "Clear the search or enable every level to see the run again."
                                : running
                                  ? "The run is live; its first event has not been written yet."
                                  : "This run recorded no events."}
                        </p>
                    </div>
                ) : (
                    <LogLineMenu
                        menu={menu}
                        runId={runId}
                        running={running}
                        onClose={() => setMenu(null)}
                        onCopy={copy}
                        onDelete={() => {
                            setMenu(null);
                            setDeleteTarget(runId);
                        }}
                    >
                        <div
                            ref={scrollRef}
                            onScroll={onScroll}
                            tabIndex={0}
                            role="log"
                            aria-label={`Log lines for run ${runId}`}
                            className="relative overflow-auto select-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                            style={{ height: "clamp(320px, calc(100dvh - 360px), 680px)" }}
                        >
                            <div
                                className="relative w-full"
                                style={{ height: `${String(total * ROW_HEIGHT)}px` }}
                            >
                                {Array.from(
                                    { length: Math.max(0, endIndex - startIndex) },
                                    (_, offset) => {
                                        const index = startIndex + offset;
                                        const record = recordAt(index);
                                        if (record === undefined) {
                                            return (
                                                <div
                                                    key={index}
                                                    aria-hidden="true"
                                                    className={`${COLUMNS} absolute inset-x-0 px-3 sm:px-4`}
                                                    style={{
                                                        top: `${String(index * ROW_HEIGHT)}px`,
                                                        height: `${String(ROW_HEIGHT)}px`,
                                                    }}
                                                >
                                                    <span className="ml-auto h-2 w-6 animate-pulse rounded-xs bg-raised motion-reduce:animate-none" />
                                                    <span className="h-2 w-14 animate-pulse rounded-xs bg-raised motion-reduce:animate-none" />
                                                    <span className="h-2 w-8 animate-pulse rounded-xs bg-raised motion-reduce:animate-none" />
                                                    <span className="hidden h-2 w-24 animate-pulse rounded-xs bg-raised motion-reduce:animate-none sm:block" />
                                                    <span className="h-2 w-3/4 animate-pulse rounded-xs bg-raised motion-reduce:animate-none" />
                                                </div>
                                            );
                                        }
                                        return (
                                            <div
                                                key={index}
                                                className={`${COLUMNS} absolute inset-x-0 px-3 font-mono text-[11px] leading-none text-ink-secondary transition-colors duration-100 hover:bg-hover sm:px-4`}
                                                style={{
                                                    top: `${String(index * ROW_HEIGHT)}px`,
                                                    height: `${String(ROW_HEIGHT)}px`,
                                                }}
                                                data-tip={`${record.at} · ${record.message}`}
                                                onContextMenu={() => {
                                                    setMenu({ record });
                                                }}
                                                onPointerDown={(event) => beginPress(event)}
                                                onPointerMove={trackPress}
                                                onPointerUp={cancelPress}
                                                onPointerCancel={cancelPress}
                                            >
                                                <span className="text-right text-[10px] text-ink-muted tabular-nums">
                                                    {record.seq.toLocaleString()}
                                                </span>
                                                <span className="text-[10px] text-ink-muted tabular-nums">
                                                    {clock(record.at)}
                                                </span>
                                                <span
                                                    className={`text-[9.5px] font-medium uppercase ${LEVEL_CHIP[record.level] ?? "text-ink-muted"}`}
                                                >
                                                    {record.level}
                                                </span>
                                                <span className="hidden truncate text-[10px] text-ink-muted sm:block">
                                                    {record.sequence ?? "run"}
                                                </span>
                                                <span className="min-w-0 truncate text-ink-secondary">
                                                    <Highlight
                                                        text={record.message}
                                                        needle={search}
                                                    />
                                                </span>
                                            </div>
                                        );
                                    },
                                )}
                            </div>
                        </div>
                    </LogLineMenu>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-2 text-[10.5px] text-ink-muted sm:px-4">
                    <span>
                        {running
                            ? follow
                                ? "Following the active run"
                                : "Paused. Follow resumes the live tail."
                            : selected === undefined
                              ? "No run selected"
                              : chip === null || !chip.recorded
                                ? "Run ended"
                                : `Run ended · ${chip.label}`}
                    </span>
                    {selected?.message === undefined || selected.message === null ? null : (
                        <span className="min-w-0 flex-1 truncate" data-tip={selected.message}>
                            {failureSummary(selected.message)}
                        </span>
                    )}
                    <span className="ml-auto tabular-nums">
                        {total.toLocaleString()} {total === 1 ? "line" : "lines"}
                        {filtered ? " shown" : ""}
                    </span>
                    {atBottom ? null : <span className="text-ink-muted">Scrolled back</span>}
                </div>
            </section>

            <p className="mt-3 mb-0 max-w-[100ch] text-[10.5px] leading-relaxed text-ink-muted">
                Logs are the service's event view of a run. Export redacts file paths, filenames,
                hostnames and addresses before the preview, and the download contains exactly that
                text. Deleting a log removes it from this viewer; the run itself stays in the
                video's history.
            </p>

            {deleteRun === undefined ? null : (
                <DeleteRunDialog
                    projectId={projectId}
                    videoId={videoId}
                    runId={deleteRun.run_id}
                    startedAt={deleteRun.started_at}
                    onClose={() => setDeleteTarget(null)}
                />
            )}

            <LogExportSheet
                open={exportOpen}
                onClose={() => setExportOpen(false)}
                runId={runId}
                data={exportLog.data}
                isPending={exportLog.isPending}
                isError={exportLog.isError}
                error={exportLog.error}
                onRetry={() => exportLog.mutate()}
            />
        </>,
        selected === undefined ? "No run selected" : `Run · ${runWhen(selected.started_at)}`,
    );
}
