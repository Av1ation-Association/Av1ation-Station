import { useEffect, useState } from "react";

import { Minus, Plus } from "lucide-react";

/**
 * A number field that keeps the user's text while it is being typed.
 *
 * The native number input refuses a trailing decimal point in most browsers, so `0.` became
 * `0` and the next keystroke produced `02`. A text input with `inputMode="decimal"` accepts
 * the partial value; only a complete number is written to the draft, and the field falls back
 * to the stored value on blur. Explicit steppers make the increment affordance visible on
 * every platform instead of depending on a spinner the browser may hide.
 */
export function NumberField({
    value,
    onChange,
    label,
    disabled = false,
    step = 1,
    min,
    max,
    integer = false,
    placeholder,
    className = "",
    id,
}: {
    value: number | null | undefined;
    onChange: (next: number) => void;
    label: string;
    disabled?: boolean;
    step?: number;
    min?: number | undefined;
    max?: number | undefined;
    /** Whole numbers only: truncate a typed fraction instead of rejecting the edit. */
    integer?: boolean;
    placeholder?: string;
    className?: string;
    id?: string;
}) {
    const stored = value === null || value === undefined ? "" : String(value);
    const [text, setText] = useState(stored);

    useEffect(() => {
        setText(stored);
    }, [stored]);

    const clamp = (next: number): number => {
        const truncated = integer ? Math.trunc(next) : next;
        const floored = min === undefined ? truncated : Math.max(min, truncated);
        return max === undefined ? floored : Math.min(max, floored);
    };

    const commit = (next: string) => {
        if (next.trim() === "" || next === "-" || next === "." || next === "-.") {
            return;
        }
        const parsed = Number(next);
        if (Number.isFinite(parsed)) {
            onChange(clamp(parsed));
        }
    };

    const stepBy = (direction: 1 | -1) => {
        const base =
            value === null || value === undefined || !Number.isFinite(value) ? (min ?? 0) : value;
        const next = clamp(Number((base + direction * step).toFixed(integer ? 0 : 6)));
        onChange(next);
    };

    return (
        <span
            className={`flex h-9 min-w-0 items-stretch overflow-hidden rounded-md border border-line-strong bg-app focus-within:border-brand ${className}`}
        >
            <input
                id={id}
                aria-label={label}
                type="text"
                inputMode={integer ? "numeric" : "decimal"}
                value={text}
                disabled={disabled}
                placeholder={placeholder}
                spellCheck={false}
                onChange={(event) => {
                    const next = event.target.value;
                    // Reject a letter immediately rather than writing a stale number and
                    // leaving the field showing something the draft does not contain.
                    if (next !== "" && !/^-?\d*\.?\d*$/u.test(next)) {
                        return;
                    }
                    setText(next);
                    commit(next);
                }}
                onBlur={() => {
                    setText(stored);
                }}
                className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-[11px] text-ink outline-none placeholder:text-ink-muted disabled:opacity-50"
            />
            <span className="flex shrink-0 items-center">
                <button
                    type="button"
                    aria-label={`Decrease ${label}`}
                    data-tip={`Decrease ${label}`}
                    disabled={disabled}
                    onClick={() => stepBy(-1)}
                    className="flex h-full w-6 items-center justify-center text-ink-muted hover:bg-hover hover:text-ink disabled:opacity-30"
                >
                    <Minus aria-hidden="true" className="h-3 w-3" />
                </button>
                <button
                    type="button"
                    aria-label={`Increase ${label}`}
                    data-tip={`Increase ${label}`}
                    data-tip-align="end"
                    disabled={disabled}
                    onClick={() => stepBy(1)}
                    className="flex h-full w-6 items-center justify-center border-l border-line text-ink-muted hover:bg-hover hover:text-ink disabled:opacity-30"
                >
                    <Plus aria-hidden="true" className="h-3 w-3" />
                </button>
            </span>
        </span>
    );
}
