import { useRefreshPreflight } from "@av1ation/api";
import type { PreflightCheck, PreflightReport } from "@av1ation/contracts";

import { Button } from "../../shared/Button";
import { DraftActions } from "../../shared/TopBarActions";
import { DependencyRow, type DependencyRowDraft } from "./DependencyRow";
import { PythonInterpreterGroup } from "./PythonInterpreterGroup";
import { SceneModelGroup } from "./SceneModelGroup";
import { sourceOf, useDependencyDraft } from "./useDependencyDraft";

const GROUPS = [
    { id: "decode", label: "Decode" },
    { id: "encode", label: "Encode" },
    { id: "muxing", label: "Muxing" },
    { id: "metric", label: "Metrics" },
] as const;

/**
 * Encode rows split by codec family.
 *
 * One "Encode" section is the tallest block in the inventory, so every column beside it
 * ended in a hole. The families are the engine's encoder list; an id that is missing here
 * still renders, under "Other encoding", rather than disappearing from the tab.
 */
const ENCODE_SECTIONS = [
    { label: "AV1 encoding", ids: ["encoder:aom", "encoder:svt-av1", "encoder:rav1e"] },
    { label: "VPX encoding", ids: ["encoder:vpx"] },
    { label: "AVC encoding", ids: ["encoder:x264"] },
    { label: "HEVC encoding", ids: ["encoder:x265"] },
    { label: "VVC encoding", ids: ["encoder:vvenc"] },
    { label: "AV2 encoding", ids: ["encoder:avm"] },
    { label: "FFmpeg encoding", ids: ["encoder:ffmpeg"] },
] as const;

/** The inventory sections in reading order; a section with no checks renders nothing. */
function dependencySections(checks: PreflightCheck[]) {
    return GROUPS.flatMap((group) => {
        if (group.id !== "encode") {
            return [
                {
                    key: group.id,
                    label: group.label,
                    checks: checks.filter((check) => check.capability === group.id),
                },
            ];
        }
        const encode = checks.filter((check) => check.capability === "encode");
        const claimed = new Set<string>(ENCODE_SECTIONS.flatMap((section) => [...section.ids]));
        return [
            ...ENCODE_SECTIONS.map((section) => ({
                key: `encode:${section.label}`,
                label: section.label,
                checks: encode.filter((check) =>
                    (section.ids as readonly string[]).includes(check.id),
                ),
            })),
            {
                key: "encode:other",
                label: "Other encoding",
                checks: encode.filter((check) => !claimed.has(check.id)),
            },
        ];
    });
}

function DependencyGroup({
    label,
    checks,
    rowDraft,
}: {
    label: string;
    checks: PreflightCheck[];
    rowDraft?: ((check: PreflightCheck) => DependencyRowDraft) | undefined;
}) {
    if (checks.length === 0) {
        return null;
    }
    // aria-labelledby splits on whitespace, so a label with a space cannot be the id.
    const headingId = `dependency-${label.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`;
    return (
        <section aria-labelledby={headingId} className="mb-5 break-inside-avoid">
            <h2
                id={headingId}
                className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted"
            >
                {label}
            </h2>
            <div className="space-y-2">
                {checks.map((check) => (
                    <DependencyRow
                        key={check.id}
                        check={check}
                        {...(rowDraft === undefined ? {} : { draft: rowDraft(check) })}
                    />
                ))}
            </div>
        </section>
    );
}

export function DependencyInventory({
    report,
    compact = false,
}: {
    report: PreflightReport;
    /** The docs example shows the capability rows without the host-only model and Python fields. */
    compact?: boolean;
}) {
    const known = new Set<string>(GROUPS.map((group) => group.id));
    // The scene model is its own row above every capability group; listing it again under
    // "Other" would ask the user to reason about the same file twice.
    const other = report.checks.filter(
        (check) => !known.has(check.capability) && check.id !== "scene-model",
    );
    const draft = useDependencyDraft(report, !compact);
    const rowDraft = (check: PreflightCheck): DependencyRowDraft => ({
        source: draft.value.sources[check.id] ?? sourceOf(check),
        onSource: (source) => draft.setSource(check.id, source),
        candidate: draft.value.candidates[check.id],
        onCandidate: (path, result) => draft.setCandidate(check.id, path, result),
        removal: draft.value.removals[check.id] === true,
        onRemove: () => draft.requestRemoval(check.id),
    });

    return (
        <div className="min-w-0">
            {compact ? null : (
                <DraftActions
                    dirty={draft.actions.dirty}
                    pending={draft.actions.pending}
                    onSave={draft.actions.onSave}
                    onDiscard={draft.actions.onDiscard}
                    canSave={draft.canSave}
                    canUndo={draft.actions.canUndo}
                    canRedo={draft.actions.canRedo}
                    onUndo={draft.actions.onUndo}
                    onRedo={draft.actions.onRedo}
                />
            )}
            {draft.error === null ? null : (
                <p role="alert" className="mb-3 mt-0 text-[11.5px] leading-relaxed text-danger">
                    {draft.error}
                </p>
            )}
            {/* A masonry flow, not a grid: capability groups have very different heights,
                and a grid pins every section in a row to the tallest one, leaving holes
                under the short sections. Columns pack them, and each section opts out of
                being split across two columns. */}
            <div className="columns-1 gap-5 md:columns-2 3xl:columns-3">
                {compact ? null : <SceneModelGroup />}
                {compact ? null : <PythonInterpreterGroup />}
                {report.checks.length === 0 ? null : (
                    <>
                        {dependencySections(report.checks).map((section) => (
                            <DependencyGroup
                                key={section.key}
                                label={section.label}
                                checks={section.checks}
                                rowDraft={compact ? undefined : rowDraft}
                            />
                        ))}
                        <DependencyGroup
                            label="Other"
                            checks={other}
                            rowDraft={compact ? undefined : rowDraft}
                        />
                    </>
                )}
            </div>
            {report.checks.length === 0 ? (
                <div className="mt-1 rounded-lg border border-line bg-surface px-5 py-8 text-center">
                    <p className="m-0 text-sm text-ink">No executable probes were reported.</p>
                    <p className="m-0 mt-1 text-[12px] text-ink-muted">
                        Run preflight again to probe this machine.
                    </p>
                </div>
            ) : null}
        </div>
    );
}

/**
 * The preflight count and its one action.
 *
 * It lives here rather than above the inventory because running a probe is a diagnostic
 * operation, and the tab strip above kept moving between tabs whose headers differed.
 * Version identity is the About tab's job; repeating it here is what made the two tabs
 * disagree about which one owned the same three facts.
 */
export function Diagnostics({ report }: { report: PreflightReport }) {
    const refresh = useRefreshPreflight();
    const percent =
        report.total_count === 0
            ? 0
            : Math.round((report.available_count / report.total_count) * 100);

    return (
        <section
            className="rounded-lg border border-line bg-surface p-5"
            aria-labelledby="diagnostics-heading"
        >
            <h2 id="diagnostics-heading" className="m-0 text-sm font-semibold text-ink">
                Diagnostics
            </h2>
            <p className="mt-1 mb-0 text-[11.5px] leading-relaxed text-ink-secondary">
                Probes this machine for every executable the pipeline can use.
            </p>
            <div className="mt-4 flex items-center justify-between gap-3">
                <p className="m-0 text-[12px] text-ink-secondary">
                    <span className="font-medium text-ink">
                        {report.available_count} of {report.total_count}
                    </span>{" "}
                    available
                </p>
                <span className="font-mono text-[10px] text-ink-muted">{percent}%</span>
            </div>
            <div
                role="progressbar"
                aria-label="Available dependencies"
                aria-valuemin={0}
                aria-valuemax={report.total_count}
                aria-valuenow={report.available_count}
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-raised"
            >
                <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
            </div>
            <Button
                variant="secondary"
                className="mt-4 h-8 w-full px-2.5 text-[12px]"
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
            >
                {refresh.isPending ? "Running…" : "Run preflight"}
            </Button>
            {refresh.isError ? (
                <p role="alert" className="mt-2 mb-0 text-[11.5px] leading-relaxed text-danger">
                    {refresh.error instanceof Error
                        ? `Preflight could not run: ${refresh.error.message}`
                        : "Preflight could not run. Try again."}
                </p>
            ) : null}
        </section>
    );
}

export function LoadingSettings() {
    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]" aria-busy="true">
            <div className="space-y-2">
                {[88, 72, 64, 80, 58].map((width) => (
                    <div
                        key={width}
                        className="h-12 animate-pulse rounded-lg border border-line bg-surface"
                        style={{ width: `${width}%` }}
                    />
                ))}
            </div>
            <div className="space-y-6">
                <div className="h-56 animate-pulse rounded-lg border border-line bg-surface" />
                <div className="h-48 animate-pulse rounded-lg border border-line bg-surface" />
            </div>
        </div>
    );
}
