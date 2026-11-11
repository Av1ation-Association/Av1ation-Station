import {
    useAddCustomTool,
    usePickExecutable,
    useRemoveCustomTool,
    useRestartApp,
    useSaveToolSource,
} from "@av1ation/api";
import type { PreflightCheck } from "@av1ation/contracts";

import { Button } from "../../shared/Button";
import { HostPathField } from "./HostPathField";
import { useHostPathField } from "./useHostPathField";

function CheckIcon() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none">
            <path
                d="m3.5 8.5 3 3 6-7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function ChevronIcon() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none">
            <path
                d="m4 6 4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function StatusChip({ available }: { available: boolean }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${
                available
                    ? "border-success/30 bg-success-soft text-success"
                    : "border-line-strong bg-raised text-ink-secondary"
            }`}
        >
            {available ? (
                <CheckIcon />
            ) : (
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
            )}
            {available ? "Available" : "Not installed"}
        </span>
    );
}

/** The engine family a dependency row can be pointed at, if it names one. */
function familyOf(check: PreflightCheck): string | null {
    const custom = /^custom:(.+?)(?::failed)?$/u.exec(check.id);
    if (custom !== null) {
        return custom[1] ?? null;
    }
    const encoder = /^encoder:(.+)$/u.exec(check.id);
    if (encoder !== null) {
        return encoder[1] ?? null;
    }
    // mkvmerge is a muxing executable, not an encoder, but it is locatable exactly like
    // FFmpeg and the encoder families are.
    return check.id === "ffmpeg" || check.id === "mkvmerge" ? check.id : null;
}

/**
 * The Bundled/System choice for a row whose capability has two providers.
 *
 * The saved choice and the source this process loaded both come from preflight, so the
 * screen never re-derives which settings key a row writes. VSScript and the native metric
 * libraries initialise once per process, so their write is immediate but the running
 * process keeps what it started with. Comparing the two is what turns that into a visible
 * restart instruction instead of a switch that appears to do nothing. Encoder, FFmpeg and
 * mkvmerge choices apply on the next use, so they never ask for a restart.
 */
function ToolSource({ check }: { check: PreflightCheck }) {
    const save = useSaveToolSource();
    const restartApp = useRestartApp();
    const configured = check.configured_source;
    const active = check.selected_source;
    const selected = configured ?? active ?? "system";
    const bundled = check.providers?.find((provider) => provider.source === "bundled");
    const system = check.providers?.find((provider) => provider.source === "system");
    const requiresRestart = check.id === "vapoursynth" || check.capability === "metric";
    // A missing provider entry means this target carries no bundled runtime at all, so it
    // must disable the choice just as an explicitly unchecked/unavailable one does.
    const bundledUnavailable = bundled === undefined || (bundled.checked && !bundled.available);
    // A saved Bundled choice whose library this target does not stage is already served by
    // the system installation; a restart cannot change that, so it must not ask for one.
    const missingBundled = selected === "bundled" && bundledUnavailable;
    const restart =
        requiresRestart &&
        configured !== undefined &&
        active !== undefined &&
        configured !== active &&
        !missingBundled;
    const disabled = save.isPending;
    const noun =
        check.id === "vapoursynth"
            ? "runtime"
            : check.capability === "metric"
              ? "metric libraries"
              : check.label;

    return (
        <div className="mb-3">
            <div
                role="radiogroup"
                aria-label={`${check.label} provider source`}
                className="grid gap-2 sm:grid-cols-2"
            >
                {(["bundled", "system"] as const).map((source) => {
                    const provider = source === "bundled" ? bundled : system;
                    const checked = selected === source;
                    const unavailable =
                        source === "bundled" && bundledUnavailable && active !== "bundled";
                    return (
                        <button
                            key={source}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            disabled={disabled || unavailable}
                            onClick={() => {
                                // Name the row, not the settings key. `metrics` is shared by
                                // every metric row, so only the row id lets the service reject
                                // a Bundled choice whose library is not staged.
                                save.mutate({ id: check.id, source });
                            }}
                            className={`min-w-0 rounded-md border px-3 py-2 text-left transition-colors duration-150 disabled:opacity-40 ${
                                checked
                                    ? "border-brand bg-brand-soft"
                                    : "border-line-strong bg-raised hover:border-brand"
                            }`}
                        >
                            <span className="flex items-center justify-between gap-2 text-[12px] font-medium text-ink">
                                {source === "bundled" ? "Bundled" : "System"}
                                {provider?.active ? (
                                    <span className="rounded-full border border-brand/40 bg-brand-soft px-1.5 py-0.5 text-[9px] font-medium text-brand-text">
                                        Active
                                    </span>
                                ) : null}
                            </span>
                            <span className="mt-0.5 block truncate text-[10.5px] leading-relaxed text-ink-muted">
                                {provider === undefined
                                    ? source === "bundled"
                                        ? "The release toolchain"
                                        : "This machine's installation"
                                    : provider.checked
                                      ? provider.detail
                                      : "Checked after a restart with this source selected"}
                            </span>
                        </button>
                    );
                })}
            </div>
            <p className="m-0 mt-1.5 text-[10.5px] leading-relaxed text-ink-muted">
                {restart
                    ? `Restart the application to use the ${selected} ${noun}.`
                    : missingBundled
                      ? `This install does not carry a bundled ${check.label} provider, so the system installation is used.`
                      : configured === undefined
                        ? active === "bundled"
                            ? check.id === "vapoursynth"
                                ? "Automatic: the bundled runtime is present and selected; the system installation is the fallback."
                                : `Automatic: the bundled ${noun} is selected; the system installation is the fallback.`
                            : bundled?.checked && bundled.available
                              ? `Automatic: the system installation is selected even though a bundled ${noun} is present.`
                              : `Automatic: no bundled ${noun} is available, so the system installation is used.`
                        : selected === "bundled"
                          ? `This process is using the bundled ${noun}.`
                          : "This process is using the system installation."}
                {bundledUnavailable && active !== "bundled" && !missingBundled
                    ? check.id === "vapoursynth"
                        ? " This install does not carry a bundled VapourSynth runtime."
                        : ` This install does not carry a bundled ${check.label} provider.`
                    : null}
            </p>
            {restart && restartApp !== null ? (
                <Button
                    variant="secondary"
                    className="mt-2 h-8 px-2.5 text-[11.5px]"
                    onClick={() => {
                        void restartApp();
                    }}
                >
                    Restart now
                </Button>
            ) : null}
            {save.isError ? (
                <p role="alert" className="mt-2 mb-0 text-[11.5px] leading-relaxed text-danger">
                    {save.error instanceof Error
                        ? `The ${check.label} source was not saved: ${save.error.message}`
                        : `The ${check.label} source was not saved. Try again.`}
                </p>
            ) : null}
        </div>
    );
}

/**
 * One dependency, expanded in place.
 *
 * The row is the whole editor: its provider path, the probe, and the way back to `PATH`.
 * A separate "add a custom executable" form asked the user to pick the same family twice
 * and made the accepted row appear somewhere else.
 */
export function DependencyRow({ check }: { check: PreflightCheck }) {
    const probe = useAddCustomTool();
    const remove = useRemoveCustomTool();
    const pickExecutable = usePickExecutable();
    const family = familyOf(check);
    // Locating probes and accepts immediately: the hook runs the same save operation, so
    // there is no second button that repeats the picker's intent.
    const field = useHostPathField({
        pick: pickExecutable,
        save: (path) => {
            if (family === null || path === null) {
                return Promise.reject(new Error("This dependency has no executable path."));
            }
            return probe.mutateAsync({ kind: family, path });
        },
        empty: { reject: "Choose the executable first." },
        describeSaveFailure: (error) =>
            error instanceof Error
                ? `The executable could not be probed: ${error.message}`
                : "The executable could not be probed. Check the path and try again.",
    });
    const custom = check.origin === "custom" && check.path !== undefined;
    // A row whose source is selectable must open even when it is healthy: the Bundled/System
    // choice lives in the expanded body, and an Available row has no remediation to reveal.
    const selectable = (check.providers?.length ?? 0) > 0;
    const expandable = family !== null || check.remediation !== undefined || selectable;

    const summary = (
        <>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{check.label}</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-secondary md:hidden">
                    {check.detail}
                </span>
            </span>
            <span className="hidden max-w-[34%] truncate font-mono text-[11px] text-ink-secondary md:block">
                {check.detail}
            </span>
            <StatusChip available={check.available} />
            {expandable ? (
                <span className="shrink-0 text-ink-muted transition-transform duration-150 group-open:rotate-180">
                    <ChevronIcon />
                </span>
            ) : (
                <span aria-hidden="true" className="w-4 shrink-0" />
            )}
        </>
    );

    if (!expandable) {
        return (
            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                {summary}
            </div>
        );
    }

    return (
        <details
            open={!check.available}
            className="group rounded-lg border border-line bg-surface open:border-line-strong"
        >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                {summary}
            </summary>
            <div className="border-t border-line px-4 py-3">
                {selectable ? <ToolSource check={check} /> : null}
                <p className="m-0 text-[12px] leading-relaxed text-ink-secondary">
                    {custom
                        ? `Using ${check.path ?? "a saved path"}.`
                        : family === null
                          ? (check.remediation ?? check.detail)
                          : check.available
                            ? "Resolved on PATH. Choose a build to use a different one."
                            : "Not found on PATH. Locate an executable to provide this capability."}
                </p>
                {check.remediation !== undefined && custom ? (
                    <p className="mt-1 mb-0 text-[11px] leading-relaxed text-ink-muted">
                        {check.remediation}
                    </p>
                ) : null}
                {family === null ? (
                    <p className="mt-2 mb-0 font-mono text-[10px] text-ink-muted">{check.id}</p>
                ) : (
                    <div className="mt-3">
                        <HostPathField
                            field={field}
                            label={`${check.label} executable`}
                            placeholder={
                                check.available
                                    ? "Another build · leave empty for PATH"
                                    : "Path to the executable"
                            }
                            showSave={false}
                            pickPendingLabel="Probing…"
                            buttonClassName="h-9 px-2.5 text-[12px]"
                            formClassName="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                            footer={
                                <>
                                    <p className="m-0 text-[10.5px] leading-relaxed text-ink-muted">
                                        Locate a build, or type its path and press Enter.
                                    </p>
                                    {custom ? (
                                        <Button
                                            variant="ghost"
                                            className="mt-2 h-8 px-2 text-[11.5px]"
                                            disabled={remove.isPending}
                                            onClick={() => remove.mutate(check.id)}
                                        >
                                            {remove.isPending
                                                ? "Reverting…"
                                                : `Use the ${check.label} on PATH`}
                                        </Button>
                                    ) : null}
                                </>
                            }
                            result={
                                field.result === null ? undefined : (
                                    <p
                                        role="status"
                                        className={`m-0 text-[11.5px] leading-relaxed ${
                                            field.result.available
                                                ? "text-ink-secondary"
                                                : "text-danger"
                                        }`}
                                    >
                                        {field.result.available
                                            ? `${field.result.label} is the provider now. ${field.result.detail}`
                                            : `${field.result.label} was rejected. ${field.result.detail}`}
                                    </p>
                                )
                            }
                        />
                    </div>
                )}
                {remove.isError ? (
                    <p role="alert" className="mt-2 mb-0 text-[11.5px] leading-relaxed text-danger">
                        {remove.error instanceof Error
                            ? `The custom executable could not be removed: ${remove.error.message}`
                            : "The custom executable could not be removed. Try again."}
                    </p>
                ) : null}
            </div>
        </details>
    );
}
