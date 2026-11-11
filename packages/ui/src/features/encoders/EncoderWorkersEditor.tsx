import type { Dispatch, SetStateAction } from "react";

const FIELD =
    "h-9 min-w-0 rounded-md border border-line-strong bg-raised px-2 font-mono text-[10.5px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:opacity-50";

const MEMORY_CHOICES = [
    { label: "No cap", megabytes: null },
    { label: "4 GB", megabytes: 4096 },
    { label: "8 GB", megabytes: 8192 },
    { label: "16 GB", megabytes: 16384 },
    { label: "32 GB", megabytes: 32768 },
    { label: "64 GB", megabytes: 65536 },
] as const;

function record(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

/**
 * How many encoder workers run, and what the benchmarker is allowed to decide.
 *
 * The engine treats a configured `workers` count as manual and a missing count as Auto;
 * Benchmarker refuses to run when a count is already present. Keeping both settings on one
 * card is therefore the only way to show that the benchmark fields do not apply to Manual.
 *
 * Inline, the three controls share the Encoder band's baseline instead of stacking, so the
 * encoder select and Passes are not pushed down by a taller neighbour; each control then
 * carries its own label because the group heading is gone.
 */
export function EncoderWorkersEditor({
    draft,
    setDraft,
    locked,
    inline = false,
}: {
    draft: Record<string, unknown>;
    setDraft: Dispatch<SetStateAction<Record<string, unknown> | null>>;
    locked: boolean;
    /** Render as a field beside the encoder select rather than a card of its own. */
    inline?: boolean;
}) {
    const parallel = record(draft.parallel_encoder);
    const benchmarker = record(draft.benchmarker);
    const manual = typeof parallel.workers === "number" && parallel.workers > 0;
    const workers = manual ? (parallel.workers as number) : 1;
    const threshold = typeof benchmarker.threshold === "number" ? benchmarker.threshold : 5;
    const memory = typeof benchmarker.max_memory === "number" ? benchmarker.max_memory : null;

    const update = (next: Record<string, unknown>) => {
        setDraft((previous) => (previous === null ? previous : { ...previous, ...next }));
    };

    const chooseMode = (mode: "auto" | "manual") => {
        if (locked || (mode === "auto") === !manual) {
            return;
        }
        update({
            parallel_encoder: { ...parallel, workers: mode === "auto" ? null : workers },
            benchmarker: {
                threshold,
                max_memory: memory,
            },
        });
    };

    const label = "flex h-[16px] items-center text-[10.5px] font-medium text-ink-secondary";

    return (
        <section className={inline ? "min-w-0" : "rounded-lg border border-line bg-surface"}>
            {inline ? null : (
                <div className="border-b border-line px-4 py-4 sm:px-5">
                    <h2 className="m-0 text-base font-semibold text-ink">Workers</h2>
                    <p className="mt-0.5 mb-0 max-w-[70ch] text-[11.5px] leading-relaxed text-ink-muted">
                        Auto runs the benchmarker and uses the count it finds. Manual skips
                        benchmarking.
                    </p>
                </div>
            )}
            <div className={inline ? "flex flex-wrap items-end gap-2" : "px-4 py-4 sm:px-5"}>
                <div className="min-w-0 shrink-0">
                    <span className={label}>Workers</span>
                    <div
                        role="radiogroup"
                        aria-label="Worker count"
                        className="mt-1 inline-flex h-9 overflow-hidden rounded-md border border-line-strong"
                    >
                        {(["auto", "manual"] as const).map((mode) => {
                            const selected = (mode === "auto") === !manual;
                            return (
                                <button
                                    key={mode}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    disabled={locked}
                                    onClick={() => chooseMode(mode)}
                                    className={`h-full min-w-[72px] border-r border-line-strong px-3 text-[11px] capitalize transition-colors duration-150 last:border-r-0 disabled:opacity-50 ${
                                        selected
                                            ? "bg-raised font-medium text-ink"
                                            : "bg-app text-ink-muted hover:text-ink"
                                    }`}
                                >
                                    {mode}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {manual ? (
                    <label className={inline ? "block w-[112px]" : "mt-3 block max-w-[160px]"}>
                        <span className={label}>Count</span>
                        <input
                            type="number"
                            min={1}
                            max={255}
                            step={1}
                            aria-label="Encoder workers"
                            value={workers}
                            disabled={locked}
                            onChange={(event) =>
                                update({
                                    parallel_encoder: {
                                        ...parallel,
                                        workers: Math.min(
                                            255,
                                            Math.max(
                                                1,
                                                Math.trunc(Number(event.target.value) || 1),
                                            ),
                                        ),
                                    },
                                })
                            }
                            className={`${FIELD} mt-1 w-full`}
                        />
                    </label>
                ) : (
                    <>
                        <label className="block w-[132px]">
                            <span className={label}>Minimum speed gain</span>
                            <span className="mt-1 flex items-center gap-1.5">
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    aria-label="Minimum speed gain"
                                    value={threshold}
                                    disabled={locked}
                                    onChange={(event) =>
                                        update({
                                            benchmarker: {
                                                ...benchmarker,
                                                threshold: Math.min(
                                                    100,
                                                    Math.max(
                                                        0,
                                                        Math.trunc(Number(event.target.value) || 0),
                                                    ),
                                                ),
                                            },
                                        })
                                    }
                                    className={`${FIELD} w-full text-right`}
                                />
                                <span className="text-[10.5px] text-ink-muted">%</span>
                            </span>
                        </label>
                        <label className="block w-[128px]">
                            <span className={label}>
                                Memory cap
                                <span className="ml-1 text-[9px] font-normal text-ink-muted">
                                    optional
                                </span>
                            </span>
                            <select
                                aria-label="Memory cap"
                                value={memory === null ? "" : String(memory)}
                                disabled={locked}
                                onChange={(event) =>
                                    update({
                                        benchmarker: {
                                            ...benchmarker,
                                            max_memory:
                                                event.target.value === ""
                                                    ? null
                                                    : Number(event.target.value),
                                        },
                                    })
                                }
                                className={`${FIELD} mt-1 w-full`}
                            >
                                {MEMORY_CHOICES.map((choice) => (
                                    <option
                                        key={choice.label}
                                        value={
                                            choice.megabytes === null
                                                ? ""
                                                : String(choice.megabytes)
                                        }
                                    >
                                        {choice.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </>
                )}

                {inline ? null : (
                    <p className="mt-3 mb-0 max-w-[72ch] text-[10px] leading-relaxed text-ink-muted">
                        {manual
                            ? "Every configured worker is used for each scene. Choose Auto when the encoder's scaling is unknown."
                            : "The benchmarker measures throughput at 1, 2, 4… workers. If you already know the count, Manual is faster. The memory cap stops adding workers when projected use would exceed it."}
                    </p>
                )}
            </div>
        </section>
    );
}
