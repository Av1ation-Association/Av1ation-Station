import type { ComponentPropsWithoutRef } from "react";

import type { LogRecord } from "@av1ation/contracts";

import { COLUMNS, LEVEL_CHIP, clock } from "./log-format";

/** One fixed-height line. A log row never wraps, so the virtualizer can size the scrollbar. */
export const LOG_ROW_HEIGHT = 22;

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

type LogRowProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
    record: LogRecord;
    search?: string;
};

/**
 * One log line, shared by the virtualized viewer and the manual's sample.
 *
 * The parent owns placement and scrolling: this renders the row content and forwards the
 * pointer and context-menu handlers the viewer uses for copy actions.
 */
export function LogRow({ record, search = "", className = "", style, ...rest }: LogRowProps) {
    return (
        <div
            {...rest}
            className={`${COLUMNS} px-3 font-mono text-[11px] leading-none text-ink-secondary transition-colors duration-100 hover:bg-hover sm:px-4 ${className}`}
            style={{ height: LOG_ROW_HEIGHT, ...style }}
            data-tip={`${record.at} · ${record.message}`}
        >
            <span className="text-right text-[10px] text-ink-muted tabular-nums">
                {record.seq.toLocaleString()}
            </span>
            <span className="text-[10px] text-ink-muted tabular-nums">{clock(record.at)}</span>
            <span
                className={`text-[9.5px] font-medium uppercase ${
                    LEVEL_CHIP[record.level] ?? "text-ink-muted"
                }`}
            >
                {record.level}
            </span>
            <span className="hidden truncate text-[10px] text-ink-muted sm:block">
                {record.sequence ?? "run"}
            </span>
            <span className="min-w-0 truncate text-ink-secondary">
                <Highlight text={record.message} needle={search} />
            </span>
        </div>
    );
}
