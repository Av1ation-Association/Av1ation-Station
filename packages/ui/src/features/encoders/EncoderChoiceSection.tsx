import type { ReactNode } from "react";

import type { EncoderDescriptor } from "@av1ation/contracts";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown } from "lucide-react";

import { ENCODER_CHOICES, passCount } from "./encoder-document";
import type { EncoderSelection } from "./encoder-selection";
import { FIELD } from "./parameter-control";

/**
 * The encoder and build one document selects, with the warning when it cannot run itself.
 *
 * The select's value names the selection, not the encoder: a saved build shares its variant
 * with the base encoder, and a marker can name a build that is no longer saved, so each of
 * those needs its own option for choosing the base to stay a real change.
 */
export function EncoderChoiceSection({
    encoders,
    selection,
    locked,
    passable,
    workers,
    copy,
    onChooseEncoder,
    onChooseFork,
    onPasses,
}: {
    encoders: readonly EncoderDescriptor[] | undefined;
    selection: EncoderSelection;
    locked: boolean;
    passable: boolean;
    workers: ReactNode;
    copy: { head: string; foot: string };
    onChooseEncoder: (entry: (typeof ENCODER_CHOICES)[number]) => void;
    onChooseFork: (fork: EncoderDescriptor) => void;
    onPasses: (count: number) => void;
}) {
    const {
        variant,
        body,
        forks,
        selectedFork,
        marker,
        missingFork,
        descriptors,
        executable,
        available,
        forkWarning,
    } = selection;

    return (
        <section className="rounded-lg border border-line bg-surface">
            <div className="border-b border-line px-4 py-4 sm:px-5">
                <h2 className="m-0 text-base font-semibold text-ink">Encoder</h2>
                <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                    {copy.head}
                </p>
            </div>{" "}
            <div className="px-4 py-4 sm:px-5">
                {/* Tops align, not bottoms: Workers is a two-row block, and bottom
                    alignment pushed the encoder select and Passes sixty pixels down. */}
                <div className="flex flex-wrap items-start gap-3">
                    <label className="block min-w-0 flex-1 basis-72">
                        <span className="flex items-center justify-between gap-3">
                            <span className="text-[10.5px] font-medium text-ink-secondary">
                                Encoder
                            </span>
                            <Link
                                to="/settings"
                                hash="encoders"
                                className="text-[10.5px] text-brand-text hover:underline"
                            >
                                Manage encoders
                            </Link>
                        </span>
                        <span className="relative mt-1 block">
                            <select
                                aria-label="Encoder"
                                value={
                                    missingFork
                                        ? `stale:${marker}`
                                        : selectedFork === undefined
                                          ? `base:${variant ?? ""}`
                                          : `fork:${selectedFork.id}`
                                }
                                disabled={locked}
                                onChange={(event) => {
                                    const [kind, ...rest] = event.target.value.split(":");
                                    const id = rest.join(":");
                                    if (kind === "fork") {
                                        const fork = forks.find((entry) => entry.id === id);
                                        if (fork !== undefined) {
                                            onChooseFork(fork);
                                        }
                                        return;
                                    }
                                    const entry = ENCODER_CHOICES.find(
                                        (candidate) => candidate.variant === id,
                                    );
                                    if (entry !== undefined) {
                                        onChooseEncoder(entry);
                                    }
                                }}
                                className={`${FIELD} h-9 w-full appearance-none pr-8`}
                            >
                                <option value="base:" disabled>
                                    Choose an encoder
                                </option>
                                {/* The marker names a build that is gone, so the
                                    document is not on its base encoder even though it
                                    shares the variant. Giving it its own option keeps
                                    the base selection a real change. */}
                                {missingFork ? (
                                    <option value={`stale:${marker}`} disabled>
                                        The selected build — no longer saved
                                    </option>
                                ) : null}
                                {[...new Set(ENCODER_CHOICES.map((entry) => entry.group))].map(
                                    (group) => (
                                        <optgroup key={group} label={group}>
                                            {ENCODER_CHOICES.filter(
                                                (entry) => entry.group === group,
                                            ).map((entry) => {
                                                const usable = (encoders ?? []).find(
                                                    (candidate) =>
                                                        !candidate.fork &&
                                                        (candidate.id === entry.base ||
                                                            candidate.base === entry.base),
                                                )?.available;
                                                return (
                                                    <option
                                                        key={entry.variant}
                                                        value={`base:${entry.variant}`}
                                                    >
                                                        {entry.label}
                                                        {usable === false ? " — not installed" : ""}
                                                    </option>
                                                );
                                            })}
                                        </optgroup>
                                    ),
                                )}
                                {forks.length === 0 ? null : (
                                    <optgroup label="Your builds">
                                        {forks.map((fork) => (
                                            <option key={fork.id} value={`fork:${fork.id}`}>
                                                {fork.label} — {fork.base}
                                                {fork.executable
                                                    ? fork.available
                                                        ? ""
                                                        : " — missing"
                                                    : " — not located"}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                            <ChevronDown
                                aria-hidden="true"
                                className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
                            />
                        </span>
                    </label>

                    {passable ? (
                        <label className="block w-[104px] shrink-0">
                            <span className="flex h-[16px] items-center text-[10.5px] font-medium text-ink-secondary">
                                Passes
                            </span>
                            <input
                                type="number"
                                min={1}
                                max={255}
                                step={1}
                                aria-label="Encoder passes"
                                value={passCount(body.pass)}
                                disabled={locked}
                                onChange={(event) =>
                                    onPasses(
                                        Math.min(
                                            255,
                                            Math.max(
                                                1,
                                                Math.trunc(Number(event.target.value) || 1),
                                            ),
                                        ),
                                    )
                                }
                                className={`${FIELD} mt-1 h-9 w-full`}
                            />
                        </label>
                    ) : null}

                    {workers === undefined ? null : (
                        <div className="min-w-0 flex-1 basis-72">{workers}</div>
                    )}
                </div>

                {forkWarning === null ? null : (
                    <div
                        role="alert"
                        className="mt-3 flex flex-wrap items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2"
                    >
                        <AlertTriangle
                            aria-hidden="true"
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                        />
                        <p className="m-0 min-w-0 flex-1 text-[10.5px] leading-relaxed text-ink-secondary">
                            <span className="font-medium text-ink">{forkWarning.title}</span>{" "}
                            {forkWarning.body}
                        </p>
                        <Link
                            to="/settings"
                            hash="encoders"
                            className="text-[10.5px] font-medium text-brand-text hover:underline"
                        >
                            Manage encoders
                        </Link>
                    </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px]">
                    <span className="font-mono text-[10px] text-ink-muted">
                        {descriptors?.version ?? "version unavailable"}
                        {executable === null ? " · on PATH" : ` · ${executable}`}
                    </span>
                    <span
                        className={`rounded-full border px-2 py-0.5 font-mono text-[8.5px] tracking-[0.1em] uppercase ${
                            available
                                ? "border-success/40 text-success"
                                : "border-warning/40 text-warning"
                        }`}
                    >
                        {available ? "Available" : "Missing"}
                    </span>
                </div>
                <p className="mt-2 mb-0 max-w-[64ch] text-[10px] leading-relaxed text-ink-muted">
                    {copy.foot}
                </p>
            </div>
        </section>
    );
}
