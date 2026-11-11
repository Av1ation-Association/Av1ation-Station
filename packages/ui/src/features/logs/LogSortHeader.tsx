import { COLUMNS, SORT_COLUMNS, type SortColumn } from "./log-format";

export function LogSortHeader({
    sort,
    onSort,
}: {
    sort: { column: SortColumn; direction: "asc" | "desc" };
    onSort: (column: SortColumn) => void;
}) {
    return (
        <div
            className={`${COLUMNS} border-b border-line-subtle bg-sunken px-3 py-1.5 font-mono text-[9px] tracking-[0.12em] text-ink-muted uppercase sm:px-4`}
        >
            {SORT_COLUMNS.map((column) => {
                const active = sort.column === column.value;
                return (
                    <button
                        key={column.value}
                        type="button"
                        onClick={() => onSort(column.value)}
                        aria-label={`Sort by ${column.label}, ${
                            active && sort.direction === "desc" ? "descending" : "ascending"
                        }`}
                        className={`inline-flex min-w-0 items-center gap-1 text-left uppercase transition-colors duration-150 hover:text-ink ${
                            active ? "text-ink" : ""
                        } ${column.value === "seq" ? "justify-end" : ""} ${
                            column.value === "sequence" ? "hidden sm:inline-flex" : ""
                        }`}
                    >
                        <span className="truncate">{column.label}</span>
                        <span aria-hidden="true" className="shrink-0 text-[8px]">
                            {active ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
