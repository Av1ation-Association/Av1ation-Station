import type { VideoProbe } from "@av1ation/contracts";
import { RefreshCw } from "lucide-react";

import { clipDuration } from "../duration";
import { formatBytes } from "../format";
import { Button } from "../Button";
import { Sheet } from "../Sheet";

function number(value: number, digits = 0): string {
    return value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] items-baseline gap-3 border-b border-line-subtle py-2 last:border-b-0">
            <dt className="text-[10px] tracking-[0.08em] text-ink-muted uppercase">{label}</dt>
            <dd className="m-0 min-w-0 font-mono text-[11px] break-words text-ink-secondary">
                {value}
            </dd>
        </div>
    );
}

/** The part of the probe query these two surfaces read. */
export interface ProbeView {
    data: VideoProbe | undefined;
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    error: unknown;
    refetch: () => void;
}

/**
 * The one-line clip facts, inside the input they describe.
 *
 * Geometry and colour belong to the decode graph the input configures, so they are shown
 * with it rather than in a separate destination. The sheet carries the rest; the strip is
 * deliberately six values a user can scan without opening anything.
 */
export function ClipStrip({ probe, onOpen }: { probe: ProbeView; onOpen: () => void }) {
    const clip = probe.data?.clip ?? null;
    if (clip === null) {
        return (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-line-subtle bg-sunken px-3 py-2">
                <p className="m-0 min-w-0 flex-1 text-[10.5px] leading-relaxed text-ink-muted">
                    {probe.isPending
                        ? "Probing the source…"
                        : probe.isError
                          ? "The probe request failed. The input still saves."
                          : (probe.data?.detail ?? "The source has not been probed.")}
                </p>
                <Button
                    variant="ghost"
                    className="h-7 px-2 text-[10.5px]"
                    disabled={probe.isFetching}
                    onClick={() => void probe.refetch()}
                >
                    <RefreshCw
                        aria-hidden="true"
                        className={`h-3 w-3 ${probe.isFetching ? "animate-spin" : ""}`}
                    />
                    {probe.isFetching ? "Probing…" : "Probe"}
                </Button>
            </div>
        );
    }
    return (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-line-subtle bg-sunken px-3 py-2">
            <span className="font-mono text-[10.5px] text-ink-secondary tabular-nums">
                {number(clip.width)}×{number(clip.height)}
            </span>
            <span className="font-mono text-[10.5px] text-ink-secondary tabular-nums">
                {number(clip.frame_rate, 3)} fps
            </span>
            <span className="font-mono text-[10.5px] text-ink-secondary tabular-nums">
                {number(clip.frame_count)} frames
            </span>
            <span className="font-mono text-[10.5px] text-ink-secondary tabular-nums">
                {clipDuration(clip.duration_seconds)}
            </span>
            <span className="font-mono text-[10.5px] text-ink-secondary">{clip.pixel_format}</span>
            <Button variant="ghost" className="ml-auto h-7 px-2 text-[10.5px]" onClick={onOpen}>
                All details
            </Button>
        </div>
    );
}

/** Every value the decoder reported, for the sheet the strip's button opens. */
export function ClipDetailsSheet({
    open,
    onClose,
    probe,
    sourcePath,
    outputPath,
    retainedBytes,
}: {
    open: boolean;
    onClose: () => void;
    probe: ProbeView;
    sourcePath: string;
    /** Absent for a sequence override: it decodes, it does not choose the output file. */
    outputPath?: string | undefined;
    /** Absent for a sequence override, where retention belongs to the video. */
    retainedBytes?: number | undefined;
}) {
    const clip = probe.data?.clip ?? null;
    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Clip details"
            eyebrow="Video"
            description="What the decoder reports about this source. Probing builds the FFMS2 index the first run reuses."
            footer={
                <Button variant="secondary" onClick={onClose}>
                    Close
                </Button>
            }
        >
            {probe.isPending ? (
                <div className="space-y-2 py-4" aria-busy="true">
                    {[0, 1, 2, 3, 4, 5].map((row) => (
                        <div key={row} className="flex gap-4">
                            <div className="h-3 w-28 animate-pulse rounded-sm bg-raised" />
                            <div className="h-3 w-48 animate-pulse rounded-sm bg-raised" />
                        </div>
                    ))}
                </div>
            ) : null}

            {probe.isError ? (
                <div
                    role="alert"
                    className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5"
                >
                    <p className="m-0 text-[11.5px] font-medium text-danger">
                        The probe request failed
                    </p>
                    <p className="mt-1 mb-0 text-[10.5px] leading-relaxed text-ink-secondary">
                        {probe.error instanceof Error
                            ? probe.error.message
                            : "The local service did not answer the probe."}
                    </p>
                </div>
            ) : null}

            {probe.data !== undefined && clip === null ? (
                <div
                    role="alert"
                    className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5"
                >
                    <p className="m-0 text-[11.5px] font-medium text-danger">
                        The source could not be probed
                    </p>
                    <p className="mt-1 mb-0 text-[10.5px] leading-relaxed text-ink-secondary">
                        {probe.data.detail}
                    </p>
                </div>
            ) : null}

            {clip === null ? null : (
                <dl className="m-0 py-1">
                    <Row
                        label="Resolution"
                        value={`${number(clip.width)} × ${number(clip.height)}`}
                    />
                    <Row label="Frame rate" value={`${number(clip.frame_rate, 3)} fps`} />
                    <Row label="Frames" value={number(clip.frame_count)} />
                    <Row label="Duration" value={clipDuration(clip.duration_seconds)} />
                    <Row label="Pixel format" value={clip.pixel_format} />
                    <Row
                        label="Bit depth"
                        value={
                            clip.bit_depth === null || clip.bit_depth === undefined
                                ? "Not signalled"
                                : `${String(clip.bit_depth)}-bit`
                        }
                    />
                    <Row label="Primaries" value={clip.color_primaries ?? "Not signalled"} />
                    <Row label="Transfer" value={clip.color_transfer ?? "Not signalled"} />
                    <Row label="Matrix" value={clip.color_matrix ?? "Not signalled"} />
                    <Row label="Range" value={clip.color_range ?? "Not signalled"} />
                    <Row label="Chroma location" value={clip.chroma_location ?? "Not signalled"} />
                    <Row
                        label="Source"
                        value={sourcePath === "" ? "Supplied by the run" : sourcePath}
                    />
                    {outputPath === undefined ? null : <Row label="Output" value={outputPath} />}
                    {retainedBytes === undefined ? null : (
                        <Row
                            label="Retained"
                            value={retainedBytes <= 0 ? "None" : formatBytes(retainedBytes)}
                        />
                    )}
                </dl>
            )}

            {probe.data !== undefined && clip !== null ? (
                <p className="mt-3 mb-0 text-[10px] leading-relaxed text-ink-muted">
                    {probe.data.detail}
                </p>
            ) : null}
        </Sheet>
    );
}
