import { useSequenceLive, useSettings } from "@av1ation/api";
import type { SceneView } from "@av1ation/contracts";

import { eta } from "../../shared/duration";
import { formatBytes } from "../../shared/format";
import { formatRate } from "../../shared/model/sequence-live";
import { stageLabel } from "../../shared/model/video-status";

function number(value: number | null | undefined, places: number): string {
    return value === null || value === undefined || !Number.isFinite(value)
        ? "—"
        : value.toFixed(places);
}

function frames(value: number): string {
    return value.toLocaleString();
}

/**
 * The scene and run facts drawn over the preview picture.
 *
 * The overlay is inert by design: it never intercepts a click or a drag, so zooming and
 * scrubbing still belong to the stage. The header is the scene at the playhead, which is the
 * one fact that is always true even when the scene has no measurements yet. A live row only
 * appears when this video's run is publishing ticks; the rest stay useful after the run ends.
 */
export function PreviewOverlay({
    projectId,
    videoId,
    scene,
}: {
    projectId: string;
    videoId: string;
    scene: SceneView | null;
}) {
    const settings = useSettings();
    const live = useSequenceLive(projectId, videoId);
    const overlay = settings.data?.preview_overlay;
    if (overlay === undefined || !overlay.enabled || scene === null) {
        return null;
    }

    const progress =
        live?.progress === null || live?.progress === undefined
            ? null
            : Math.max(0, Math.min(100, live.progress));
    const rate = live === null ? null : formatRate(live);
    const remaining = eta(live?.etaSeconds ?? null);
    const quantizer =
        scene.quantizer === null || scene.quantizer === undefined
            ? "—"
            : `Q${number(scene.quantizer, 0)}`;
    const chunk =
        scene.chunk_bytes === null || scene.chunk_bytes === undefined
            ? "No chunk"
            : formatBytes(scene.chunk_bytes);

    return (
        <aside
            aria-label="Preview overlay"
            className="pointer-events-none absolute top-2 right-2 left-2 z-20 max-w-[21rem] rounded-md border border-white/10 bg-black/65 px-2.5 py-2 text-[10.5px] leading-snug text-white/85 shadow-lg backdrop-blur-[2px]"
        >
            <p className="m-0 flex items-baseline gap-1.5 font-medium text-white">
                <span>Scene {String(scene.index + 1)}</span>
                <span className="font-mono text-[9.5px] font-normal text-white/60 tabular-nums">
                    {frames(scene.start_frame)}–
                    {frames(Math.max(scene.start_frame, scene.end_frame - 1))}
                </span>
            </p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                {overlay.target_quality ? (
                    <>
                        <dt className="text-white/50">Target quality</dt>
                        <dd className="m-0 font-mono tabular-nums">
                            {quantizer} · score {number(scene.score, 3)}
                        </dd>
                    </>
                ) : null}
                {overlay.quality_check ? (
                    <>
                        <dt className="text-white/50">Quality check</dt>
                        <dd className="m-0 font-mono tabular-nums">
                            {number(scene.quality_score, 1)}
                        </dd>
                    </>
                ) : null}
                {overlay.noise ? (
                    <>
                        <dt className="text-white/50">Noise</dt>
                        <dd className="m-0 font-mono tabular-nums">
                            {number(scene.noise, 2)}
                            {scene.noise_scaler === null || scene.noise_scaler === undefined
                                ? null
                                : ` · scale ${number(scene.noise_scaler, 2)}`}
                        </dd>
                    </>
                ) : null}
                {overlay.chunk ? (
                    <>
                        <dt className="text-white/50">Chunk</dt>
                        <dd className="m-0 font-mono tabular-nums">{chunk}</dd>
                    </>
                ) : null}
                {overlay.encoder ? (
                    <>
                        <dt className="text-white/50">Encoder</dt>
                        <dd className="m-0 truncate">{scene.encoder_label}</dd>
                    </>
                ) : null}
                {overlay.live_stage && live !== null ? (
                    <>
                        <dt className="text-white/50">Stage</dt>
                        <dd className="m-0 truncate">
                            {stageLabel(live.sequence)}
                            {live.phase === null ? "" : ` · ${live.phase}`}
                            {live.pass === null ? "" : ` · pass ${String(live.pass)}`}
                        </dd>
                    </>
                ) : null}
                {overlay.progress && live !== null ? (
                    <>
                        <dt className="text-white/50">Progress</dt>
                        <dd className="m-0 font-mono tabular-nums">
                            {progress === null ? "Starting" : `${String(Math.round(progress))}%`}
                        </dd>
                    </>
                ) : null}
                {overlay.fps_eta && live !== null ? (
                    <>
                        <dt className="text-white/50">Speed</dt>
                        <dd className="m-0 font-mono tabular-nums">
                            {rate ?? "—"}
                            {remaining === null ? "" : ` · ETA ${remaining}`}
                        </dd>
                    </>
                ) : null}
            </dl>
        </aside>
    );
}
