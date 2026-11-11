import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "../../shared/Button";
import { NumberField } from "../../shared/NumberField";
import { Switch } from "../../shared/Switch";

type Point = { speed: number; quantizer: number };

/**
 * The engine's `speed_quantizers` pairs. Each pair is `[speed, quantizer]` in the wire
 * document, even though the sequence is described as a speed for a quantizer; the graph
 * therefore plots quantizer on x and speed on y, and serialization keeps the engine order.
 */
export function speedPoints(value: unknown): Point[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const points: Point[] = [];
    for (const entry of value) {
        if (Array.isArray(entry) && typeof entry[0] === "number" && typeof entry[1] === "number") {
            // Wire order is [speed, quantizer], while the graph and controls read
            // quantizer first because it is the scene-derived input.
            points.push({ speed: entry[0], quantizer: entry[1] });
        }
    }
    return points;
}

const WIDTH = 720;
const HEIGHT = 260;
// The left gutter carries the y tick numbers and the rotated axis title; the bottom gutter
// carries the x tick numbers and the axis title beneath them.
const INSET = { left: 52, right: 16, top: 16, bottom: 42 };

/**
 * Maps each scene's chosen quantizer to an encoder speed.
 *
 * One full-width graph is the editor: points are labelled, click a point to select it,
 * drag it to move it, and click empty space to add one. The selected point has its two
 * exact values below the graph, so the table that used to squeeze the graph is gone.
 */
export function SpeedScalingCard({
    value,
    onChange,
    disabled,
    maxQuantizer,
}: {
    value: unknown;
    onChange: (next: Point[] | null) => void;
    disabled: boolean;
    maxQuantizer: number;
}) {
    const points = speedPoints(value);
    const enabled = points.length >= 2;
    const chartId = useId();
    const [selected, setSelected] = useState<number | null>(null);
    const [hovered, setHovered] = useState<number | null>(null);
    const [dragging, setDragging] = useState<number | null>(null);
    // A drag ends in a click; without this the point that was just moved would also add
    // another one at the pointer position.
    const dragged = useRef(false);
    const maxSpeed = Math.max(13, ...points.map((point) => point.speed));
    const qMax = Math.max(1, maxQuantizer);
    // Whole quantizers only: a fractional quantizer is not a value the encoder can be asked
    // for, and 0.1 steps made the graph read as a continuous curve rather than a lookup.
    const snapQuantizer = (quantizer: number): number =>
        Math.min(Math.round(qMax), Math.max(0, Math.round(quantizer)));

    const x = (quantizer: number) =>
        INSET.left +
        (Math.min(qMax, Math.max(0, quantizer)) / qMax) * (WIDTH - INSET.left - INSET.right);
    const y = (speed: number) =>
        INSET.top +
        (1 - Math.min(maxSpeed, Math.max(0, speed)) / maxSpeed) *
            (HEIGHT - INSET.top - INSET.bottom);

    const ordered = [...points].sort((left, right) => left.quantizer - right.quantizer);
    const path = ordered
        .map(
            (point, index) =>
                `${index === 0 ? "M" : "L"}${String(x(point.quantizer))},${String(y(point.speed))}`,
        )
        .join(" ");

    const position = (event: {
        clientX: number;
        clientY: number;
        currentTarget: SVGSVGElement;
    }): Point => {
        const rect = event.currentTarget.getBoundingClientRect();
        const localX = ((event.clientX - rect.left) / rect.width) * WIDTH;
        const localY = ((event.clientY - rect.top) / rect.height) * HEIGHT;
        const quantizer = ((localX - INSET.left) / (WIDTH - INSET.left - INSET.right)) * qMax;
        const speed = (1 - (localY - INSET.top) / (HEIGHT - INSET.top - INSET.bottom)) * maxSpeed;
        return {
            speed: Math.min(127, Math.max(0, Math.round(speed))),
            quantizer: snapQuantizer(quantizer),
        };
    };

    const write = (next: Point[]) => onChange(next);

    const addPoint = (quantizer: number, speed: number) => {
        if (disabled) {
            return;
        }
        const next = [
            ...points,
            {
                speed: Math.min(127, Math.max(0, Math.round(speed))),
                quantizer: snapQuantizer(quantizer),
            },
        ];
        write(next);
        setSelected(next.length - 1);
    };

    const movePoint = (index: number, next: Point) => {
        write(points.map((point, at) => (at === index ? next : point)));
    };

    const beginDrag = (index: number, event: ReactPointerEvent<SVGCircleElement>) => {
        if (disabled) {
            return;
        }
        event.stopPropagation();
        dragged.current = true;
        setSelected(index);
        setDragging(index);
        event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    };

    const chartPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (dragging === null) {
            return;
        }
        movePoint(dragging, position(event));
    };

    const chosen = selected === null ? undefined : points[selected];

    return (
        <section className="rounded-lg border border-line bg-surface">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
                <div className="min-w-0">
                    <h2 className="m-0 flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
                        2 · Speed scaling
                        <span className="rounded-full border border-line-strong px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.12em] text-ink-muted uppercase">
                            Optional
                        </span>
                    </h2>
                    <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                        Maps the quantizer Target quality chooses to the speed the encoder runs.
                    </p>
                </div>
                <Switch
                    label="Speed scaling"
                    checked={enabled}
                    disabled={disabled}
                    onChange={(next) =>
                        onChange(
                            next
                                ? [
                                      { speed: 8, quantizer: 20 },
                                      { speed: 6, quantizer: 35 },
                                      { speed: 4, quantizer: 50 },
                                  ]
                                : null,
                        )
                    }
                />
            </div>

            {!enabled ? (
                <p className="m-0 px-4 py-5 text-[11.5px] leading-relaxed text-ink-muted sm:px-5">
                    Off. Every scene runs at the encoder&rsquo;s own speed. Turning it on seeds
                    three points, which can be moved before Save. It does not require Target
                    quality; a document can define the curve and be enabled later.
                </p>
            ) : (
                <div className="px-4 py-4 sm:px-5">
                    <svg
                        role="img"
                        aria-labelledby={chartId}
                        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
                        onPointerMove={chartPointerMove}
                        onPointerUp={(event) => {
                            if (dragging !== null) {
                                event.currentTarget.releasePointerCapture(event.pointerId);
                                setDragging(null);
                            }
                        }}
                        onClick={(event) => {
                            if (dragged.current) {
                                dragged.current = false;
                                return;
                            }
                            const next = position(event);
                            addPoint(next.quantizer, next.speed);
                        }}
                        className="w-full cursor-crosshair touch-none rounded-md border border-line bg-app"
                    >
                        <title id={chartId}>
                            Encoder speed by quantizer. Click to add, drag a point to move it.
                        </title>
                        {/* Grid first, then the axes on top: a tick that meets the frame
                            reads as a scale, and the marks never cover a point. */}
                        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                            <line
                                key={`h-${String(fraction)}`}
                                x1={INSET.left}
                                x2={WIDTH - INSET.right}
                                y1={y(maxSpeed * fraction)}
                                y2={y(maxSpeed * fraction)}
                                stroke="var(--border-default)"
                                strokeWidth={1}
                            />
                        ))}
                        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                            <line
                                key={`v-${String(fraction)}`}
                                x1={x(qMax * fraction)}
                                x2={x(qMax * fraction)}
                                y1={INSET.top}
                                y2={HEIGHT - INSET.bottom}
                                stroke="var(--border-default)"
                                strokeWidth={1}
                            />
                        ))}
                        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                            <text
                                key={`yt-${String(fraction)}`}
                                x={INSET.left - 7}
                                y={y(maxSpeed * fraction) + 3}
                                textAnchor="end"
                                className="fill-ink-muted font-mono text-[8px]"
                            >
                                {Math.round(maxSpeed * fraction)}
                            </text>
                        ))}
                        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                            <text
                                key={`xt-${String(fraction)}`}
                                x={x(qMax * fraction)}
                                y={HEIGHT - INSET.bottom + 12}
                                textAnchor="middle"
                                className="fill-ink-muted font-mono text-[8px]"
                            >
                                {Math.round(qMax * fraction)}
                            </text>
                        ))}
                        <line
                            x1={INSET.left}
                            x2={INSET.left}
                            y1={INSET.top}
                            y2={HEIGHT - INSET.bottom}
                            stroke="var(--border-strong)"
                        />
                        <line
                            x1={INSET.left}
                            x2={WIDTH - INSET.right}
                            y1={HEIGHT - INSET.bottom}
                            y2={HEIGHT - INSET.bottom}
                            stroke="var(--border-strong)"
                        />
                        {/* The y title is rotated because every graph that carries a
                            measurement up the side reads that way; the x title sits under
                            the ticks. */}
                        <text
                            transform={`translate(14 ${String(
                                (INSET.top + HEIGHT - INSET.bottom) / 2,
                            )}) rotate(-90)`}
                            textAnchor="middle"
                            className="fill-ink-secondary text-[9px]"
                        >
                            Encoder speed
                        </text>
                        <text
                            x={(INSET.left + WIDTH - INSET.right) / 2}
                            y={HEIGHT - 8}
                            textAnchor="middle"
                            className="fill-ink-secondary text-[9px]"
                        >
                            Quantizer
                        </text>
                        <path
                            d={path}
                            fill="none"
                            stroke="var(--brand-default)"
                            strokeWidth={1.5}
                        />
                        {points.map((point, index) => {
                            const active = index === selected || index === hovered;
                            return (
                                <g
                                    key={`${String(index)}-${String(point.speed)}-${String(point.quantizer)}`}
                                >
                                    {active ? (
                                        <text
                                            x={x(point.quantizer)}
                                            y={y(point.speed) - 12}
                                            textAnchor="middle"
                                            className="fill-ink font-mono text-[9px]"
                                        >
                                            q {point.quantizer} · s {point.speed}
                                        </text>
                                    ) : null}
                                    <circle
                                        cx={x(point.quantizer)}
                                        cy={y(point.speed)}
                                        r={index === selected ? 6 : 4.5}
                                        fill={
                                            index === selected
                                                ? "var(--brand-default)"
                                                : "var(--bg-surface)"
                                        }
                                        stroke="var(--brand-default)"
                                        strokeWidth={2}
                                        onPointerDown={(event) => beginDrag(index, event)}
                                        onPointerEnter={() => setHovered(index)}
                                        onPointerLeave={() => setHovered(null)}
                                        className="cursor-grab"
                                    />
                                </g>
                            );
                        })}
                    </svg>

                    <div className="mt-3 flex flex-wrap items-end gap-2">
                        {chosen === undefined ? (
                            <p className="m-0 mr-auto text-[10.5px] text-ink-muted">
                                Select a point to edit it, or click the graph to add one.
                            </p>
                        ) : (
                            <>
                                <label className="block min-w-0">
                                    <span className="block text-[10px] font-medium text-ink-secondary">
                                        Quantizer
                                    </span>
                                    <NumberField
                                        label="Selected point quantizer"
                                        value={chosen.quantizer}
                                        min={0}
                                        max={qMax}
                                        step={1}
                                        integer
                                        onChange={(next) =>
                                            movePoint(selected ?? 0, {
                                                ...chosen,
                                                quantizer: snapQuantizer(next),
                                            })
                                        }
                                        className="mt-1 w-[132px]"
                                    />
                                </label>
                                <label className="block min-w-0">
                                    <span className="block text-[10px] font-medium text-ink-secondary">
                                        Speed
                                    </span>
                                    <NumberField
                                        label="Selected point speed"
                                        value={chosen.speed}
                                        min={0}
                                        max={127}
                                        integer
                                        onChange={(next) =>
                                            movePoint(selected ?? 0, {
                                                ...chosen,
                                                speed: Math.min(127, Math.max(0, Math.round(next))),
                                            })
                                        }
                                        className="mt-1 w-[132px]"
                                    />
                                </label>
                                <Button
                                    variant="secondary"
                                    className="h-9 px-2.5 text-[11px]"
                                    disabled={disabled || points.length <= 2}
                                    onClick={() => {
                                        const at = selected ?? 0;
                                        write(points.filter((_, index) => index !== at));
                                        setSelected(null);
                                    }}
                                >
                                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    Remove point
                                </Button>
                            </>
                        )}
                        <Button
                            variant="secondary"
                            className="ml-auto h-9 px-2.5 text-[11px]"
                            disabled={disabled}
                            onClick={() => addPoint(qMax / 2, maxSpeed / 2)}
                        >
                            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                            Add point
                        </Button>
                    </div>
                    <p className="mt-2 mb-0 text-[10px] leading-relaxed text-ink-muted">
                        At least two points are required for interpolation. Removal stops at two;
                        every point is kept in the order the engine serializes.
                    </p>
                </div>
            )}
        </section>
    );
}
