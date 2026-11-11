import { Search, X } from "lucide-react";

import { LEVELS, type Level } from "./log-format";

export function LogFilterBar({
    searchInput,
    onSearchChange,
    levels,
    onAllLevels,
    onToggleLevel,
    total,
    filtered,
}: {
    searchInput: string;
    onSearchChange: (value: string) => void;
    levels: ReadonlySet<Level>;
    onAllLevels: () => void;
    onToggleLevel: (level: Level) => void;
    total: number;
    filtered: boolean;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 sm:px-4">
            <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line-strong bg-sunken px-2 focus-within:border-brand sm:max-w-[420px]">
                <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                <input
                    type="search"
                    value={searchInput}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Search messages or sequences"
                    aria-label="Search the log"
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-muted focus:outline-none"
                />
                {searchInput === "" ? null : (
                    <button
                        type="button"
                        aria-label="Clear the search"
                        onClick={() => onSearchChange("")}
                        className="rounded p-0.5 text-ink-muted hover:text-ink"
                    >
                        <X aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Filter by level">
                <button
                    type="button"
                    aria-pressed={levels.size === LEVELS.length}
                    onClick={onAllLevels}
                    className={`h-8 rounded-md border px-2 text-[10.5px] transition-colors duration-150 ${
                        levels.size === LEVELS.length
                            ? "border-line-strong bg-raised font-semibold text-ink"
                            : "border-line bg-sunken text-ink-secondary hover:text-ink"
                    }`}
                    data-tip="Show every level"
                >
                    All
                </button>
                {LEVELS.map((entry) => {
                    const on = levels.has(entry.value);
                    return (
                        <button
                            key={entry.value}
                            type="button"
                            aria-pressed={on}
                            onClick={() => onToggleLevel(entry.value)}
                            className={`h-8 rounded-md border px-2 text-[10.5px] transition-colors duration-150 ${
                                on
                                    ? "border-line-strong bg-raised font-semibold text-ink"
                                    : "border-line bg-sunken text-ink-muted hover:text-ink"
                            }`}
                        >
                            {entry.label}
                        </button>
                    );
                })}
            </div>
            <span className="ml-auto font-mono text-[10.5px] text-ink-muted tabular-nums">
                {total.toLocaleString()} {filtered ? "matching " : ""}
                {total === 1 ? "line" : "lines"}
            </span>
        </div>
    );
}
