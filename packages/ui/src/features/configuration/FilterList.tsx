import { useState, type ReactNode } from "react";

import { GripVertical, Plus, Trash2 } from "lucide-react";

import { type JsonSchema } from "../../shared/schema/config-schema";
import { Button } from "../../shared/Button";
import { FilterComposer } from "./FilterComposer";
import { filterSummary } from "./filter-summary";

function IconAction({
    label,
    onClick,
    disabled,
    children,
}: {
    label: string;
    onClick: () => void;
    disabled: boolean;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className="rounded p-1 text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-30"
        >
            {children}
        </button>
    );
}

/**
 * One reorderable engine filter chain.
 *
 * Input, VapourSynth Script, and Noise Detector's reference and denoised passes all carry
 * the same `VapourSynthFilter` (or `Ffms2Filter`) list. Rendering them from this one component
 * keeps drag order, edit, remove, and the schema-driven composer identical in every place a
 * chain is configured; a second bespoke list drifted into text rows with no reordering.
 */
export function FilterList({
    label,
    help,
    filters,
    schema,
    target,
    disabled,
    emptyText,
    addLabel = "Add filter",
    canAdd = true,
    onChange,
}: {
    /** The list's heading, for example `Reference filters`. */
    label: string;
    /** The smaller note beside the heading, when the list needs one. */
    help?: string | undefined;
    filters: unknown[];
    /** The engine schema for this filter variant, when the service has answered. */
    schema: JsonSchema | undefined;
    target: "ffms2" | "vapour_synth";
    disabled: boolean;
    emptyText: string;
    addLabel?: string;
    /** False when the schema reports no filter variant this context can add. */
    canAdd?: boolean;
    onChange: (next: unknown[]) => void;
}) {
    const [editing, setEditing] = useState<number | null>(null);
    const [dragging, setDragging] = useState<number | null>(null);
    const [dropAt, setDropAt] = useState<number | null>(null);

    const move = (from: number, to: number) => {
        if (from === to) {
            return;
        }
        const next = [...filters];
        const [item] = next.splice(from, 1);
        if (item === undefined) {
            return;
        }
        next.splice(to, 0, item);
        onChange(next);
    };

    const commit = (filter: unknown, again: boolean) => {
        if (editing === null) {
            return;
        }
        const next = [...filters];
        if (editing < 0) {
            next.push(filter);
        } else {
            next[editing] = filter;
        }
        onChange(next);
        if (!again) {
            setEditing(null);
        }
    };

    return (
        <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="m-0 text-[10.5px] font-medium text-ink-secondary">{label}</p>
                {help === undefined ? null : (
                    <p className="m-0 text-[9.5px] text-ink-muted">{help}</p>
                )}
            </div>
            <div className="mt-1.5">
                {filters.length === 0 ? (
                    <p className="m-0 rounded-md border border-dashed border-line px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-muted">
                        {emptyText}
                    </p>
                ) : (
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                        {filters.map((entry, index) => {
                            const summary = filterSummary(entry);
                            return (
                                <li
                                    key={`${String(index)}-${summary}`}
                                    onDragOver={(event) => {
                                        if (disabled || dragging === null) {
                                            return;
                                        }
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "move";
                                        setDropAt(index);
                                    }}
                                    onDragLeave={() =>
                                        setDropAt((current) => (current === index ? null : current))
                                    }
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        const from = Number(
                                            event.dataTransfer.getData("text/plain"),
                                        );
                                        setDropAt(null);
                                        setDragging(null);
                                        if (Number.isInteger(from) && from !== index) {
                                            move(from, index);
                                        }
                                    }}
                                    className={`flex min-w-0 items-center gap-2 rounded-md border bg-sunken px-2 py-1.5 transition-colors duration-150 ${
                                        dropAt === index && dragging !== null && dragging !== index
                                            ? "border-line border-t-2 border-t-brand"
                                            : "border-line"
                                    } ${dragging === index ? "opacity-50" : ""}`}
                                >
                                    <button
                                        type="button"
                                        draggable={!disabled}
                                        disabled={disabled}
                                        aria-label={`Reorder ${summary}`}
                                        title={disabled ? undefined : "Drag to reorder"}
                                        onDragStart={(event) => {
                                            event.dataTransfer.setData("text/plain", String(index));
                                            event.dataTransfer.effectAllowed = "move";
                                            setDragging(index);
                                        }}
                                        onDragEnd={() => {
                                            setDragging(null);
                                            setDropAt(null);
                                        }}
                                        className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-ink-muted hover:text-ink active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <GripVertical aria-hidden="true" className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Edit ${summary}`}
                                        disabled={disabled}
                                        onClick={() => setEditing(index)}
                                        className="min-w-0 flex-1 truncate text-left text-[11px] text-ink disabled:pointer-events-none disabled:opacity-50"
                                    >
                                        {summary}
                                    </button>
                                    <IconAction
                                        label={`Remove ${summary}`}
                                        disabled={disabled}
                                        onClick={() =>
                                            onChange(
                                                filters.filter((_, cursor) => cursor !== index),
                                            )
                                        }
                                    >
                                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    </IconAction>
                                </li>
                            );
                        })}
                    </ul>
                )}
                <Button
                    variant="secondary"
                    className="mt-2 h-8 px-2.5 text-[10.5px]"
                    disabled={disabled || schema === undefined || !canAdd}
                    onClick={() => setEditing(-1)}
                >
                    <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                    {addLabel}
                </Button>
            </div>

            <FilterComposer
                open={editing !== null}
                target={target}
                schema={schema}
                initial={editing !== null && editing >= 0 ? (filters[editing] ?? null) : null}
                onClose={() => setEditing(null)}
                onCommit={commit}
            />
        </div>
    );
}
