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
    reason?: "encoder" | "input";
}) {
    const [keep, setKeep] = useState(false);

    useEffect(() => {
        if (open) {
            setKeep(false);
        }
    }, [open]);

    const count = scenes.length;
    const singleScene = count === 1 ? (scenes[0]?.index ?? null) : null;
    const totalBytes = scenes.reduce((total, scene) => total + (scene.chunk_bytes ?? 0), 0);
    const sceneNumber = singleScene === null ? 0 : singleScene + 1;
    const copy =
        reason === "input"
            ? {
                  title:
                      singleScene === null
                          ? `${String(count)} encoded scenes were built from the old input`
                          : `Scene ${String(sceneNumber)} was built from the old input`,
                  body:
                      singleScene === null
                          ? `${String(count)} scenes already have a retained chunk encoded from the previous input. Parallel Encoder skips a scene that already has one.`
                          : `Scene ${String(sceneNumber)} already has a retained chunk encoded from the previous input. Parallel Encoder skips a scene that already has one.`,
                  tip:
                      singleScene === null
                          ? `Recommended off. Saving deletes the ${String(count)} chunks, and the next run encodes these scenes from the new input. On, the chunks stay and these scenes keep the old encode until you reset them.`
                          : "Recommended off. Saving deletes the chunk, and the next run encodes this scene from the new input. On, the chunk stays and the scene keeps the old encode until you reset it.",
              }
            : {
                  title:
                      singleScene === null
                          ? `${String(count)} encoded scenes use the old encoder`
                          : `Scene ${String(sceneNumber)} is encoded with the old encoder`,
                  body:
                      singleScene === null
                          ? `${String(count)} scenes already have a retained chunk encoded with the previous settings. Parallel Encoder skips a scene that already has one.`
                          : `Scene ${String(sceneNumber)} already has a retained chunk encoded with the previous settings. Parallel Encoder skips a scene that already has one.`,
                  tip:
                      singleScene === null
                          ? `Recommended off. Saving deletes the ${String(count)} chunks, and the next run encodes these scenes with the new encoder. On, the chunks stay and these scenes keep the old encode until you reset them.`
                          : "Recommended off. Saving deletes the chunk, and the next run encodes this scene with the new encoder. On, the chunk stays and the scene keeps the old encode until you reset it.",
              };
    const label =
        singleScene === null
            ? `Keep the ${String(count)} existing chunks`
            : "Keep the existing chunk";

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
