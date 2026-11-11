import type { LogRecord } from "@av1ation/contracts";

// Trace and debug are opt-in: they carry one line per progress tick and one per scene, so
// a run's 5,000-scene evidence would otherwise bury the summaries the screen opens on.
export const LEVELS = [
    { value: "trace", label: "Trace" },
    { value: "debug", label: "Debug" },
    { value: "info", label: "Info" },
    { value: "warn", label: "Warn" },
    { value: "error", label: "Error" },
] as const;

export type Level = (typeof LEVELS)[number]["value"];

export const SORT_COLUMNS = [
    { value: "seq", label: "#" },
    { value: "time", label: "Time" },
    { value: "level", label: "Level" },
    { value: "sequence", label: "Sequence" },
    { value: "message", label: "Message" },
] as const;

export type SortColumn = (typeof SORT_COLUMNS)[number]["value"];

export const LEVEL_CHIP: Record<string, string> = {
    trace: "text-ink-muted/70",
    debug: "text-info",
    info: "text-ink-muted",
    warn: "text-warning",
    error: "text-danger",
};

export const COLUMNS =
    "grid grid-cols-[44px_62px_44px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[52px_72px_48px_140px_minmax(0,1fr)] sm:gap-3";

export interface LogMenu {
    record: LogRecord;
}

/** The whole line as text, for the context menu's copy action. */
export function lineText(record: LogRecord): string {
    return `${clock(record.at)} ${record.level.toUpperCase()} ${
        record.sequence ?? "run"
    }: ${record.message}`;
}

export function clock(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value.slice(11, 19);
    }
    // The selector is local time too; two clocks in one panel would read as a bug.
    return date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}
