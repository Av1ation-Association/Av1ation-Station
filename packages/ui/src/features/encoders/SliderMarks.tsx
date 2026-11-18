import { useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Mark } from "@av1ation/contracts";

/** The marks a slider draws: curated marks inside the range plus the automatic default. */
function sliderMarks(
    marks: readonly Mark[] | undefined,
    min: number,
    max: number,
    defaultValue: unknown,
): Mark[] {
    const inside = (value: number): boolean =>
        Number.isFinite(value) && value >= min && value <= max;
    const merged = new Map<number, Mark>();
    for (const mark of marks ?? []) {
        if (!inside(mark.value)) {
            continue;
        }
        const label = mark.label?.trim() ?? "";
        merged.set(mark.value, {
            value: mark.value,
            label: label === "" ? null : label,
        });
    }
    const defaultMark =
        typeof defaultValue === "number" && inside(defaultValue)
            ? { value: defaultValue, label: `Default ${String(defaultValue)}` }
            : null;
    if (defaultMark !== null) {
        merged.set(defaultMark.value, defaultMark);
    }
    const drawn = [...merged.values()].sort((left, right) => left.value - right.value);
    // The default marker leads so it wins the collision pass.
    return defaultMark === null
        ? drawn
        : [defaultMark, ...drawn.filter((mark) => mark.value !== defaultMark.value)];
}

/**
 * The scale under a slider. Ticks are always present; labels are suppressed only when they
 * would collide, and a tick's title still names the position on hover.
 */
export function SliderMarks({
    min,
    max,
    defaultValue,
    marks,
}: {
    min: number;
    max: number;
    defaultValue: unknown;
    marks: readonly Mark[] | undefined;
}) {
    const drawn = useMemo(
        () => sliderMarks(marks, min, max, defaultValue),
        [marks, min, max, defaultValue],
    );
    const track = useRef<HTMLDivElement>(null);
    const labels = useRef(new Map<number, HTMLSpanElement>());
    const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
    const [hovered, setHovered] = useState<number | null>(null);
    const [focusedMark, setFocusedMark] = useState<number | null>(null);
    const span = max - min;

    useLayoutEffect(() => {
        const element = track.current;
        if (element === null) {
            return;
        }
        const measure = () => {
            const width = element.clientWidth;
            if (width === 0) {
                setHidden(new Set());
                return;
            }
            let rightEdge = Number.NEGATIVE_INFINITY;
            const next = new Set<number>();
            for (const mark of drawn) {
                const label = labels.current.get(mark.value);
                if (label === undefined || mark.label === null) {
                    continue;
                }
                const position = ((mark.value - min) / span) * width;
                const left = position - label.offsetWidth / 2;
                const right = position + label.offsetWidth / 2;
                if (left < rightEdge + 4) {
                    next.add(mark.value);
                } else {
                    rightEdge = right;
                }
            }
            setHidden(next);
        };
        measure();
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
        observer?.observe(element);
        window.addEventListener("resize", measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [drawn, min, span]);

    if (span <= 0) {
        return null;
    }

    return (
        <div
            ref={track}
            role="group"
            aria-label={`Marks: ${drawn
                .map((mark) => mark.label ?? String(mark.value))
                .join(", ")}`}
            className="relative mt-1 h-4 rounded-sm"
        >
            {drawn.map((mark) => {
                const percent = ((mark.value - min) / span) * 100;
                const revealed = hovered === mark.value || focusedMark === mark.value;
                const edgeTransform =
                    percent <= 0
                        ? "none"
                        : percent >= 100
                          ? "translateX(-100%)"
                          : "translateX(-50%)";
                return (
                    <span key={mark.value}>
                        <span
                            data-mark-value={mark.value}
                            role="img"
                            tabIndex={0}
                            aria-label={mark.label ?? String(mark.value)}
                            title={mark.label ?? String(mark.value)}
                            onMouseEnter={() => {
                                setHovered(mark.value);
                            }}
                            onMouseLeave={() => {
                                setHovered((current) => (current === mark.value ? null : current));
                            }}
                            onFocus={() => {
                                setFocusedMark(mark.value);
                            }}
                            onBlur={() => {
                                setFocusedMark((current) =>
                                    current === mark.value ? null : current,
                                );
                            }}
                            className="absolute top-0 h-1.5 w-px bg-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                            style={{ left: `${String(percent)}%` }}
                        />
                        {mark.label === null ? null : (
                            <span
                                ref={(element) => {
                                    if (element === null) {
                                        labels.current.delete(mark.value);
                                    } else {
                                        labels.current.set(mark.value, element);
                                    }
                                }}
                                aria-hidden="true"
                                className={`absolute top-1.5 font-mono text-[8.5px] whitespace-nowrap text-ink-muted ${
                                    hidden.has(mark.value) && !revealed ? "invisible" : ""
                                }`}
                                style={{
                                    left: `${String(percent)}%`,
                                    transform: edgeTransform,
                                }}
                            >
                                {mark.label}
                            </span>
                        )}
                    </span>
                );
            })}
        </div>
    );
}
