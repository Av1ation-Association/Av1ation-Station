import { useEffect, useId, useState } from "react";

import {
    useConfigSchemas,
    useSaveVideoOverrides,
    useSceneEncoder,
    useSetSceneEncoders,
    useVideoConfig,
    useVideoOverrides,
} from "@av1ation/api";
import type { SceneView } from "@av1ation/contracts";
import { Info } from "lucide-react";
import { toast } from "sonner";

import { documentFromValues, type JsonSchema } from "../../shared/schema/config-schema";
import { encoderWrite, type SceneEncoderScope } from "./scene-encoder";
import { Button } from "../../shared/Button";
import { EncoderEditor } from "../encoders/EncoderEditor";
import { SceneEncoderChunkGuard } from "../../shared/SceneEncoderChunkGuard";
import { Sheet } from "../../shared/Sheet";

function variantOf(document: unknown): string | null {
    return typeof document === "object" && document !== null && !Array.isArray(document)
        ? (Object.keys(document)[0] ?? null)
        : null;
}

/**
 * The scene encoder sheet, where the bulk scope is chosen.
 *
 * The scope is deliberately unset on every open. Writing 500 per-scene overrides because a
 * slider moved is irreversible in practice, so the user must say whether the encoder belongs
 * to the video or to the selected scenes before Save exists.
 */
export function SceneEncoderSheet({
    open,
    onClose,
    onSaved,
    projectId,
    videoId,
    scenes,
    allScenes,
    locked,
}: {
    open: boolean;
    onClose: () => void;
    /** Runs after a selection write, so the Scenes screen can offer its one undo entry. */
    onSaved: () => void;
    projectId: string;
    videoId: string;
    scenes: readonly SceneView[];
    /** The whole table, so a video-scope save can count every scene that inherits. */
    allScenes: readonly SceneView[];
    locked: boolean;
}) {
    const schemas = useConfigSchemas();
    const config = useVideoConfig(projectId, videoId);
    const overrides = useVideoOverrides(projectId, videoId);
    const singleIndex = scenes.length === 1 ? (scenes[0]?.index ?? null) : null;
    const sceneEncoder = useSceneEncoder(projectId, videoId, open ? singleIndex : null, open);
    const saveVideo = useSaveVideoOverrides(projectId, videoId);
    const saveScenes = useSetSceneEncoders(projectId, videoId);
    const scopeName = useId();

    const [draft, setDraft] = useState<unknown>(null);
    const [scope, setScope] = useState<SceneEncoderScope | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [guardOpen, setGuardOpen] = useState(false);

    const effectiveEncoder =
        config.data === undefined ? undefined : documentFromValues(config.data.values).encoder;
    const sourceReady =
        singleIndex === null
            ? effectiveEncoder !== undefined && effectiveEncoder !== null
            : sceneEncoder.data !== undefined;
    const source = singleIndex === null ? effectiveEncoder : sceneEncoder.data?.encoder;

    useEffect(() => {
        if (!open) {
            setDraft(null);
            setScope(null);
            setError(null);
            setGuardOpen(false);
            return;
        }
        if (draft !== null || !sourceReady || source === undefined) {
            return;
        }
        setDraft(source);
    }, [open, draft, source, sourceReady]);

    const saving = saveVideo.isPending || saveScenes.isPending;
    const customCount = scenes.filter((scene) => scene.encoder_custom).length;
    const selectionLabel =
        scenes.length === 1 ? "This scene" : `These ${String(scenes.length)} scenes`;
    const scopeReady = scope === "scenes" || (scope === "video" && overrides.data !== undefined);
    const canSave =
        draft !== null &&
        variantOf(draft) !== null &&
        scopeReady &&
        !locked &&
        !saving &&
        scenes.length > 0;

    // A video-scope write replaces the document of every scene that still inherits the
    // encoder. A scene-scope write replaces one document per selected scene, so it only
    // touches the rows whose own document differs from the draft: a row that already carries
    // the draft is a no-op and keeps its chunk. One selected scene is the document the sheet
    // loaded; with several, a row's provenance says whether it still inherits the video's
    // encoder, and a custom row differs from that encoder even when the draft does not.
    const changedScenes =
        scope !== "scenes" || draft === null
            ? []
            : scenes.filter((scene) =>
                  singleIndex === null
                      ? scene.encoder_custom ||
                        JSON.stringify(draft) !== JSON.stringify(effectiveEncoder)
                      : JSON.stringify(draft) !== JSON.stringify(source),
              );
    const affectedScenes =
        scope === "video" ? allScenes.filter((scene) => !scene.encoder_custom) : changedScenes;
    const encodedScenes = affectedScenes.filter((scene) => scene.encoded);
    // An unchanged encoder invalidates nothing, so saving it must not offer to delete a
    // chunk. The video scope compares against the video's encoder; the scene scope is
    // whatever its selected documents differ from.
    const changes =
        scope === "video"
            ? effectiveEncoder !== undefined &&
              JSON.stringify(draft) !== JSON.stringify(effectiveEncoder)
            : changedScenes.length > 0;

    const commit = (keep: boolean) => {
        if (scope === null || draft === null) {
            return;
        }
        setError(null);
        const write = encoderWrite(
            scope,
            scope === "scenes" ? changedScenes : scenes,
            draft,
            overrides.data?.fields ?? {},
            !keep,
        );
        if (write.kind === "scenes" && write.body.scenes.length === 0) {
            toast.success(
                scenes.length === 1
                    ? "This scene already uses this encoder."
                    : "The selected scenes already use this encoder.",
            );
            onClose();
            return;
        }
        if (write.kind === "video") {
            saveVideo.mutate(write.body, {
                onSuccess: () => {
                    toast.success("The video encoder was updated.");
                    onClose();
                },
                onError: (cause: Error) => {
                    setGuardOpen(false);
                    setError(cause.message);
                },
            });
            return;
        }
        saveScenes.mutate(write.body, {
            onSuccess: () => {
                onSaved();
                toast.success(
                    scenes.length === 1
                        ? "The scene encoder was updated."
                        : `The encoder was written to ${String(scenes.length)} scenes.`,
                );
                onClose();
            },
            onError: (cause: Error) => {
                setGuardOpen(false);
                setError(cause.message);
            },
        });
    };

    const save = () => {
        if (scope === null || draft === null) {
            return;
        }
        setError(null);
        if (changes && encodedScenes.length > 0) {
            setGuardOpen(true);
            return;
        }
        commit(!changes);
    };

    return (
        <>
            <Sheet
                open={open}
                width="wide"
                title="Scene encoder"
                eyebrow="Scenes"
                description={
                    locked
                        ? "An encode is running. Its configuration is read-only until the run ends."
                        : "Choose where this encoder applies, then edit its parameters. The choice is required: the same document can replace the video's encoder or write one override per selected scene."
                }
                onClose={onClose}
                footer={
                    <>
                        <span className="mr-auto self-center text-[10px] text-ink-muted">
                            {locked
                                ? "An encode is running."
                                : scope === null
                                  ? "Choose an application scope to continue."
                                  : scope === "video" && overrides.isError
                                    ? "The video's overrides could not be read."
                                    : !scopeReady
                                      ? "Loading the video's overrides…"
                                      : scope === "video"
                                        ? "Writes the video's encoder override."
                                        : `Writes ${String(scenes.length)} scene override${scenes.length === 1 ? "" : "s"}.`}
                        </span>
                        <Button variant="secondary" onClick={onClose} disabled={saving}>
                            Cancel
                        </Button>
                        <Button disabled={!canSave} onClick={save}>
                            {saving
                                ? "Saving…"
                                : scope === "video"
                                  ? "Save for video"
                                  : "Save for scenes"}
                        </Button>
                    </>
                }
            >
                <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className="mb-2 p-0 text-[11px] font-medium text-ink">Apply to</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <label
                            className={`flex cursor-pointer gap-2.5 rounded-md border px-3 py-2.5 transition-colors ${
                                scope === "video"
                                    ? "border-brand bg-brand/5"
                                    : "border-line-strong bg-app hover:border-line-strong hover:bg-hover"
                            } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                            <input
                                type="radio"
                                name={scopeName}
                                value="video"
                                checked={scope === "video"}
                                disabled={locked}
                                onChange={() => setScope("video")}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-brand"
                            />
                            <span className="min-w-0">
                                <span className="block text-[12px] font-medium text-ink">
                                    This video
                                </span>
                                <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-muted">
                                    Replaces the encoder every inheriting scene uses. Scenes with
                                    their own encoder keep it.
                                </span>
                            </span>
                        </label>
                        <label
                            className={`flex cursor-pointer gap-2.5 rounded-md border px-3 py-2.5 transition-colors ${
                                scope === "scenes"
                                    ? "border-brand bg-brand/5"
                                    : "border-line-strong bg-app hover:border-line-strong hover:bg-hover"
                            } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                            <input
                                type="radio"
                                name={scopeName}
                                value="scenes"
                                checked={scope === "scenes"}
                                disabled={locked}
                                onChange={() => setScope("scenes")}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-brand"
                            />
                            <span className="min-w-0">
                                <span className="block text-[12px] font-medium text-ink">
                                    {selectionLabel}
                                </span>
                                <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-muted">
                                    Writes one scene encoder override for each of the{" "}
                                    {String(scenes.length)} selected scene
                                    {scenes.length === 1 ? "" : "s"}.
                                </span>
                            </span>
                        </label>
                    </div>
                </fieldset>

                {scope === "scenes" && customCount > 0 ? (
                    <p className="mt-2 mb-0 flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-[10.5px] leading-relaxed text-warning">
                        <Info
                            aria-hidden="true"
                            className="mt-px h-3 w-3 shrink-0"
                            strokeWidth={1.8}
                        />
                        {customCount === scenes.length
                            ? "Every selected scene already has its own encoder; saving replaces all of them."
                            : `${String(customCount)} of ${String(scenes.length)} selected scenes already have their own encoder; saving replaces those too.`}
                    </p>
                ) : null}

                {scope === "video" && customCount > 0 ? (
                    <p className="mt-2 mb-0 flex items-start gap-1.5 rounded-md border border-line bg-sunken px-3 py-2 text-[10.5px] leading-relaxed text-ink-muted">
                        <Info
                            aria-hidden="true"
                            className="mt-px h-3 w-3 shrink-0"
                            strokeWidth={1.6}
                        />
                        The {String(customCount)} selected scene
                        {customCount === 1 ? "" : "s"} with a custom encoder will keep that encoder
                        after this save.
                    </p>
                ) : null}

                <div className="mt-4 border-t border-line pt-4">
                    {!sourceReady || draft === null || schemas.data === undefined ? (
                        <div className="space-y-2" aria-busy="true">
                            {sceneEncoder.isError || config.isError || schemas.isError ? (
                                <p
                                    role="alert"
                                    className="m-0 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[11px] leading-relaxed text-danger"
                                >
                                    {sceneEncoder.error instanceof Error
                                        ? sceneEncoder.error.message
                                        : config.error instanceof Error
                                          ? config.error.message
                                          : schemas.error instanceof Error
                                            ? schemas.error.message
                                            : "The current encoder could not be loaded."}
                                </p>
                            ) : (
                                <>
                                    <div className="h-9 animate-pulse rounded-md bg-raised" />
                                    <div className="h-9 animate-pulse rounded-md bg-raised" />
                                    <div className="h-24 animate-pulse rounded-md bg-raised" />
                                </>
                            )}
                        </div>
                    ) : (
                        <EncoderEditor
                            root={schemas.data.encoder as JsonSchema}
                            node={schemas.data.encoder as JsonSchema}
                            value={draft}
                            onChange={(next) => {
                                setDraft(next);
                                setError(null);
                            }}
                            locked={locked || saving}
                            scope="scene"
                        />
                    )}
                </div>

                {error === null ? null : (
                    <p
                        role="alert"
                        className="mt-3 mb-0 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[11px] leading-relaxed text-danger"
                    >
                        {error}
                    </p>
                )}
            </Sheet>
            <SceneEncoderChunkGuard
                open={guardOpen}
                scenes={encodedScenes}
                onCancel={() => setGuardOpen(false)}
                onSave={commit}
                saving={saving}
            />
        </>
    );
}
