import { useEffect, useState } from "react";

import { Info } from "lucide-react";

import { Button } from "../../shared/Button";
import { DialogFrame } from "../../shared/DialogFrame";
import { formatBytes } from "../../shared/format";

/** The encoded scenes whose retained chunks a save invalidates. */
export interface ChunkScene {
    index: number;
    chunk_bytes?: number | null | undefined;
}

/** What a save changed about the scenes whose chunks it invalidates. */
export type ChunkReason = "encoder" | "input";

/**
 * The guard's copy for one save.
 *
 * A project save names the video span instead of a single scene number; otherwise the count
 * decides singular or plural. One sentence covers both surfaces so the two guards cannot
 * describe the same invalidation differently.
 */
function guardCopy({
    reason,
    count,
    sceneNumber,
    videos,
}: {
    reason: ChunkReason;
    count: number;
    sceneNumber: number | null;
    videos: number | undefined;
}) {
    const input = reason === "input";
    const plural = count !== 1;
    const sceneWord = plural ? "scenes" : "scene";
    const videoSpan = videos ?? 0;
    const videoWord = videoSpan === 1 ? "video" : "videos";
    const acrossVideos = videoSpan > 0;
    const subject = acrossVideos
        ? `${String(count)} encoded ${sceneWord} across ${String(videoSpan)} ${videoWord}`
        : sceneNumber !== null
          ? `Scene ${String(sceneNumber)}`
          : `${String(count)} encoded ${sceneWord}`;
    const title = input
        ? sceneNumber !== null
            ? `${subject} was built from the old input`
            : `${subject} ${plural ? "were" : "was"} built from the old input`
        : sceneNumber !== null
          ? `${subject} is encoded with the old encoder`
          : `${subject} ${plural ? "use" : "uses"} the old encoder`;
    const encoded = input ? "from the previous input" : "with the previous settings";
    const counted = acrossVideos
        ? `${String(count)} ${sceneWord} in ${String(videoSpan)} ${videoWord}`
        : `${String(count)} ${sceneWord}`;
    const body = `${sceneNumber !== null ? subject : counted} already ${plural ? "have" : "has"} a retained chunk encoded ${encoded}. Parallel Encoder skips a scene that already has one.`;
    const target = input ? "from the new input" : "with the new encoder";
    const chunks = plural ? `the ${String(count)} chunks` : "the chunk";
    const kept = plural
        ? "the chunks stay and these scenes keep"
        : "the chunk stays and this scene keeps";
    const tip = `Recommended off. Saving deletes ${chunks}, and the next run encodes ${plural ? "these scenes" : "this scene"} ${target}. On, ${kept} the old encode until you reset ${plural ? "them" : "it"}.`;
    return { title, body, tip };
}

/**
 * The guard between an encoder save and the chunks that save invalidates.
 *
 * The checkbox is the whole choice: off deletes the chunks so the next run encodes these
 * scenes with the encoder being saved, on keeps the old encodes. The recommendation lives in
 * the tooltip rather than the body, because the body only has to state what already exists.
 */
export function SceneEncoderChunkGuard({
    open,
    scenes,
    onCancel,
    onSave,
    saving,
    eyebrow = "Scene encoder",
    reason = "encoder",
    videos,
}: {
    open: boolean;
    /** The encoded scenes whose retained chunks the save invalidates. */
    scenes: readonly ChunkScene[];
    onCancel: () => void;
    onSave: (keep: boolean) => void;
    saving: boolean;
    /** The surface that opened the guard, named in the modal's eyebrow. */
    eyebrow?: string;
    /** What the save changed; a changed input invalidates every chunk it reaches. */
    reason?: ChunkReason;
    /** How many videos the scenes span; a project-level save sets it and names no scene. */
    videos?: number | undefined;
}) {
    const [keep, setKeep] = useState(false);

    useEffect(() => {
        if (open) {
            setKeep(false);
        }
    }, [open]);

    const count = scenes.length;
    // A project save spans videos, so no single scene number can name it. The count and the
    // video span are the only honest description of what the save reaches.
    const acrossVideos = videos !== undefined && videos > 0;
    const singleScene = !acrossVideos && count === 1 ? (scenes[0]?.index ?? null) : null;
    const totalBytes = scenes.reduce((total, scene) => total + (scene.chunk_bytes ?? 0), 0);
    const copy = guardCopy({
        reason,
        count,
        sceneNumber: singleScene === null ? null : singleScene + 1,
        videos,
    });
    const label =
        count === 1 ? "Keep the existing chunk" : `Keep the ${String(count)} existing chunks`;

    return (
        <DialogFrame
            open={open}
            onDismiss={onCancel}
            dismissible={!saving}
            labelledBy="scene-encoder-chunks-title"
            describedBy="scene-encoder-chunks-body"
            className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
        >
            <div className="border-b border-line px-5 py-4">
                <p className="m-0 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                    {eyebrow}
                </p>
                <h2 id="scene-encoder-chunks-title" className="m-0 mt-1 text-base font-semibold">
                    {copy.title}
                </h2>
            </div>
            <div className="px-5 py-4">
                <p
                    id="scene-encoder-chunks-body"
                    className="m-0 text-[13px] leading-relaxed text-ink-secondary"
                >
                    {copy.body}
                </p>
                <div className="mt-3 flex items-center gap-2 rounded-md border border-line-strong bg-app px-3 py-2">
                    <label className="flex min-w-0 cursor-pointer items-center gap-2 text-[12px] text-ink">
                        <input
                            type="checkbox"
                            checked={keep}
                            disabled={saving}
                            onChange={(event) => setKeep(event.target.checked)}
                            className="h-3.5 w-3.5 shrink-0 accent-brand"
                        />
                        {label}
                    </label>
                    <button
                        type="button"
                        aria-label="Why keeping the chunks is not recommended"
                        data-tip={copy.tip}
                        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 hover:text-ink focus-visible:text-ink"
                    >
                        <Info aria-hidden="true" className="h-3 w-3" strokeWidth={1.8} />
                    </button>
                    {totalBytes > 0 ? (
                        <span className="ml-auto shrink-0 text-[10.5px] text-ink-muted">
                            {formatBytes(totalBytes)}
                        </span>
                    ) : null}
                </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                <Button variant="secondary" onClick={onCancel} disabled={saving}>
                    Cancel
                </Button>
                <Button onClick={() => onSave(keep)} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                </Button>
            </div>
        </DialogFrame>
    );
}
