import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
    useDeleteVideoChunks,
    usePickDirectory,
    usePickSaveFile,
    usePickVideoFile,
    useProbeVideo,
    useProject,
    useOpenPath,
    useSaveVideoGeneral,
    useSaveVideoStorage,
    useVideo,
    useVideoGeneral,
    useVideoState,
    useVideoStorage,
    useVideoValidation,
} from "@av1ation/api";
import type { VideoGeneral } from "@av1ation/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { FolderOpen, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { InlineError } from "../../shared/InlineError";
import { ClipDetailsSheet, ClipStrip } from "../../shared/video/ClipDetails";
import { InputEditor } from "../configuration/InputEditor";
import { SequenceFailureRail } from "../configuration/SequenceFailureRail";
import { inputFromValue, inputValueOf, type InputValue } from "../../shared/model/input-model";
import { ScriptPluginNotice } from "../../shared/ScriptPluginNotice";
import { VideoRunActions } from "./VideoRunActions";
import { VideoTabs } from "./VideoTabs";
import { DraftActions } from "../../shared/TopBarActions";
import { useAllowNavigation } from "../../shared/UnsavedChanges";
import { useDraftSession } from "../../shared/useDraftSession";
import { deriveOutputPath, formatBytes, parentPath } from "../../shared/format";
import {
    failureOwnerForSequence,
    GENERAL_PLUGIN_CONTEXTS,
} from "../../shared/model/video-sections";

const FIELD =
    "h-8 w-full min-w-0 rounded-md border border-line-strong bg-app px-2.5 font-mono text-[11px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:opacity-50";

interface GeneralDraft {
    input: InputValue;
    sourcePath: string;
    outputPath: string;
}

function generalDraftOf(value: VideoGeneral): GeneralDraft {
    const output = value.output;
    return {
        input: inputValueOf(value.input),
        sourcePath: value.source_path,
        outputPath:
            typeof output === "object" && output !== null
                ? String((output as Record<string, unknown>).path ?? "")
                : "",
    };
}

function Card({
    title,
    badge,
    action,
    children,
}: {
    title: string;
    badge?: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="rounded-lg border border-line bg-surface px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="m-0 text-sm font-semibold text-ink">{title}</h2>
                {badge === undefined ? null : (
                    <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[8.5px] tracking-[0.12em] text-ink-muted uppercase">
                        {badge}
                    </span>
                )}
                {action === undefined ? null : <div className="ml-auto">{action}</div>}
            </div>
            {children}
        </section>
    );
}

/**
 * The source, output, scratch directory, and clip facts one video owns.
 *
 * These are not configuration leaves: a second video would collide with both paths, and the
 * scratch directory belongs to the chunks this video writes. The input half is the shared
 * `InputEditor` in its concrete mode. The clip strip lives inside the input card because it
 * describes that decode graph; its sheet carries the full probe.
 */
export function VideoGeneralScreen() {
    const { projectId, videoId } = useParams({
        from: "/projects/$projectId/videos/$videoId/config/general",
    });
    const project = useProject(projectId);
    const video = useVideo(projectId, videoId);
    const general = useVideoGeneral(projectId, videoId);
    const storage = useVideoStorage(projectId, videoId);
    const state = useVideoState(projectId, videoId);
    const save = useSaveVideoGeneral(projectId, videoId);
    const saveStorage = useSaveVideoStorage(projectId, videoId);
    const removeChunks = useDeleteVideoChunks(projectId, videoId);
    const pickVideo = usePickVideoFile();
    const pickDirectory = usePickDirectory();
    const pickSave = usePickSaveFile();
    const open = useOpenPath();
    const probe = useProbeVideo(projectId, videoId, video.data !== undefined);
    const validation = useVideoValidation(projectId, videoId);
    const failure = state.data?.failure ?? null;
    const generalFailure =
        failureOwnerForSequence(failure?.sequence ?? null) === "general" ? failure : null;
    const navigate = useNavigate();
    const allowNavigation = useAllowNavigation();
    const [outputError, setOutputError] = useState<string | null>(null);
    const [clipOpen, setClipOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const deleteDialog = useRef<HTMLDialogElement>(null);

    const locked = state.data?.active === true;

    useEffect(() => {
        const dialog = deleteDialog.current;
        if (dialog === null) {
            return;
        }
        if (confirmDelete && !dialog.open) {
            dialog.showModal();
        }
        if (!confirmDelete && dialog.open) {
            dialog.close();
        }
    }, [confirmDelete]);

    const complete = (value: GeneralDraft): string | null => {
        if (value.input.kind !== "vapour_synth_script" && value.input.path.trim() === "") {
            return "Choose the source file this video decodes.";
        }
        if (
            value.input.kind === "vapour_synth_script" &&
            value.input.scriptMode === "file" &&
            value.input.script.trim() === ""
        ) {
            return "Choose the VapourSynth script this video evaluates.";
        }
        if (
            value.input.kind === "vapour_synth_script" &&
            value.input.scriptMode === "text" &&
            value.input.scriptText.trim() === ""
        ) {
            return "Write the VapourSynth script this video evaluates.";
        }
        if (value.outputPath.trim() === "") {
            return "Choose the exact file this video writes.";
        }
        return null;
    };

    const session = useDraftSession<GeneralDraft, VideoGeneral>({
        identity: `${projectId}/${videoId}/general`,
        label: "Video General",
        snapshot: general.data,
        toDraft: generalDraftOf,
        save: async (draft, server) => {
            const problem = complete(draft);
            if (problem !== null) {
                setOutputError(problem);
                toast.error(problem);
                return false;
            }
            try {
                await save.mutateAsync({
                    input: inputFromValue(draft.input, server.input),
                    output: {
                        ...(typeof server.output === "object" && server.output !== null
                            ? (server.output as Record<string, unknown>)
                            : {}),
                        path: draft.outputPath.trim(),
                    },
                    ...(draft.input.kind === "vapour_synth_script" && draft.sourcePath.trim() !== ""
                        ? { source_path: draft.sourcePath.trim() }
                        : {}),
                });
                setOutputError(null);
                toast.success("Video General saved");
                return true;
            } catch {
                return false;
            }
        },
        pending: save.isPending,
    });
    const draft = session.value;

    const derivedOutput = useMemo(() => {
        if (project.data === undefined || draft === null) {
            return "";
        }
        const source =
            draft.input.kind === "vapour_synth_script" ? draft.sourcePath : draft.input.path;
        return source.trim() === "" ? "" : deriveOutputPath(project.data.general, source.trim());
    }, [draft, project.data]);

    const outputFolder = draft === null ? "" : parentPath(draft.outputPath.trim());

    const discard = () => {
        session.discard();
        setOutputError(null);
    };
    const openScript = async () => {
        if (session.dirty) {
            const saved = await session.save();
            if (!saved) {
                return;
            }
        }
        allowNavigation();
        void navigate({
            to: "/projects/$projectId/videos/$videoId/script",
            params: { projectId, videoId },
            search: { section: "general" },
        });
    };

    // An error settles with no draft; it must reach the error branch rather than looking
    // like a skeleton that never finishes.
    if (
        !video.isError &&
        !general.isError &&
        (video.isPending || general.isPending || draft === null)
    ) {
        return (
            <main id="main" aria-busy="true" className="flex min-h-[60vh] flex-col">
                <div className="h-11 border-b border-line" />
                <div className="page py-6">
                    <div className="h-40 animate-pulse rounded-lg border border-line bg-surface" />
                    <div className="mt-4 h-64 animate-pulse rounded-lg border border-line bg-surface" />
                </div>
            </main>
        );
    }

    if (video.isError || general.isError) {
        return (
            <main id="main" className="mx-auto w-full max-w-[720px] px-6 py-16">
                <div className="rounded-lg border border-danger/30 bg-surface p-6" role="alert">
                    <h1 className="m-0 text-xl font-semibold text-ink">
                        This video's General document could not be loaded
                    </h1>
                    <p className="mt-2 mb-4 text-[13px] leading-relaxed text-ink-secondary">
                        {general.error instanceof Error
                            ? general.error.message
                            : "The service did not respond."}
                    </p>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            void video.refetch();
                            void general.refetch();
                        }}
                    >
                        Retry
                    </Button>
                </div>
            </main>
        );
    }

    // The two branches above return for every way the draft can be absent; this guard
    // narrows the value for the editor below.
    if (draft === null) {
        return null;
    }

    const retained = storage.data?.retained_bytes ?? 0;
    const directory = storage.data?.directory ?? "";
    const inheritedDirectory = storage.data?.inherited_directory ?? "";
    const storageError = saveStorage.error instanceof Error ? saveStorage.error.message : null;
    const changeDirectory = () => {
        if (pickDirectory === null) {
            toast.error("This host cannot show a folder picker.");
            return;
        }
        void pickDirectory()
            .then((picked) => {
                if (picked !== null) {
                    saveStorage.mutate(picked, {
                        onError: (error) => toast.error(error.message),
                        onSuccess: () => toast.success("Scratch directory updated"),
                    });
                }
            })
            .catch(() => toast.error("The folder picker could not open."));
    };

    return (
        <main id="main" className="flex min-h-[calc(100dvh-56px)] flex-col">
            <VideoTabs
                projectId={projectId}
                videoId={videoId}
                active="configuration"
                note={`General · ${formatBytes(retained)} retained`}
            />
            <VideoRunActions projectId={projectId} videoId={videoId} state={state.data} />

            <div className="page flex-1 py-5">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="m-0 text-xl font-semibold tracking-tight text-ink">
                            General
                        </h1>
                        <p className="mt-1 mb-0 max-w-[80ch] text-[11.5px] leading-relaxed text-ink-secondary">
                            The source this video decodes, the exact file it writes, and the
                            directory its chunks live in. All three belong to this queue entry, not
                            to the project.
                        </p>
                    </div>
                    {saveStorage.isPending ? (
                        <span className="text-[10.5px] text-ink-muted">Saving directory…</span>
                    ) : null}
                </div>

                {generalFailure === null ? null : (
                    <div className="mb-4 overflow-hidden rounded-lg border border-danger/40">
                        <SequenceFailureRail
                            sequence="General"
                            message={generalFailure.message}
                            wide
                        />
                    </div>
                )}

                <ScriptPluginNotice
                    problems={validation.data?.plugin_problems ?? []}
                    contexts={GENERAL_PLUGIN_CONTEXTS}
                />

                {save.isError ? (
                    <InlineError className="mb-4">
                        {save.error instanceof Error
                            ? `The General document could not be saved: ${save.error.message}`
                            : "The General document could not be saved."}
                    </InlineError>
                ) : null}

                <div className="space-y-4">
                    <Card title="Input" badge="Video">
                        <InputEditor
                            value={draft.input}
                            onChange={(input) => session.setValue({ ...draft, input })}
                            disabled={locked}
                            idPrefix="video-general"
                            mode="input"
                            scriptStorageLabel="Stored in this video's document"
                            onEditScript={() => void openScript()}
                        />
                        <ClipStrip probe={probe} onOpen={() => setClipOpen(true)} />

                        {draft.input.kind === "vapour_synth_script" ? (
                            <div className="mt-4">
                                <label
                                    htmlFor="video-source-path"
                                    className="text-[12px] font-medium text-ink"
                                >
                                    Source file
                                </label>
                                <p className="mt-0.5 mb-2 text-[10.5px] leading-relaxed text-ink-muted">
                                    The script does not name a file of its own. This is the path its
                                    injected <span className="font-mono">video_path</span> names, so
                                    a script that opens the queued video still finds it.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <input
                                        id="video-source-path"
                                        aria-label="Source file"
                                        value={draft.sourcePath}
                                        disabled={locked}
                                        onChange={(event) =>
                                            session.setValue({
                                                ...draft,
                                                sourcePath: event.target.value,
                                            })
                                        }
                                        placeholder="C:/media/clip.mkv"
                                        spellCheck={false}
                                        className={`${FIELD} flex-1 basis-64`}
                                    />
                                    {pickVideo === null ? null : (
                                        <Button
                                            variant="secondary"
                                            className="h-8 px-2.5 text-[10.5px]"
                                            disabled={locked}
                                            onClick={() => {
                                                void pickVideo()
                                                    .then((picked) => {
                                                        if (picked !== null) {
                                                            session.setValue({
                                                                ...draft,
                                                                sourcePath: picked,
                                                            });
                                                        }
                                                    })
                                                    .catch(() =>
                                                        toast.error(
                                                            "The video picker could not open.",
                                                        ),
                                                    );
                                            }}
                                        >
                                            <FolderOpen
                                                aria-hidden="true"
                                                className="h-3 w-3"
                                                strokeWidth={1.6}
                                            />
                                            Locate…
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </Card>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card
                            title="Output"
                            badge="Video"
                            action={
                                <Button
                                    variant="ghost"
                                    className="h-7 px-2 text-[10.5px]"
                                    disabled={locked || open === null || outputFolder === ""}
                                    title={
                                        open === null
                                            ? "This host cannot open a folder."
                                            : "Open the folder that contains this video's output file."
                                    }
                                    onClick={() => {
                                        if (open === null || outputFolder === "") {
                                            return;
                                        }
                                        void open(outputFolder).catch(() =>
                                            toast.error("The folder could not be opened."),
                                        );
                                    }}
                                >
                                    Open
                                </Button>
                            }
                        >
                            <p className="mt-1 mb-2 text-[10.5px] leading-relaxed text-ink-muted">
                                The concatenated file this video writes. Changing it moves the
                                finished file; a file already at the new path is never overwritten.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <input
                                    id="video-output-path"
                                    aria-label="Output file"
                                    value={draft.outputPath}
                                    disabled={locked}
                                    onChange={(event) => {
                                        setOutputError(null);
                                        session.setValue({
                                            ...draft,
                                            outputPath: event.target.value,
                                        });
                                    }}
                                    placeholder={
                                        derivedOutput === ""
                                            ? "D:/Media/AV1/clip.av1.mkv"
                                            : derivedOutput
                                    }
                                    spellCheck={false}
                                    className={`${FIELD} flex-1 basis-64`}
                                />
                                <Button
                                    variant="secondary"
                                    className="h-8 px-2.5 text-[10.5px]"
                                    disabled={locked || pickSave === null}
                                    title={
                                        pickSave === null
                                            ? "This host cannot show a save dialog."
                                            : "Choose the exact file this video writes."
                                    }
                                    onClick={() => {
                                        if (pickSave === null) {
                                            return;
                                        }
                                        const current =
                                            draft.outputPath || derivedOutput || "output.mkv";
                                        void pickSave({
                                            title: "Choose the output file",
                                            defaultPath: current,
                                            extensions: ["mkv"],
                                        })
                                            .then((picked) => {
                                                if (picked !== null) {
                                                    setOutputError(null);
                                                    session.setValue({
                                                        ...draft,
                                                        outputPath: picked,
                                                    });
                                                }
                                            })
                                            .catch(() =>
                                                toast.error("The save dialog could not open."),
                                            );
                                    }}
                                >
                                    <Save
                                        aria-hidden="true"
                                        className="h-3 w-3"
                                        strokeWidth={1.6}
                                    />
                                    Save to…
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="h-8 px-2 text-[10.5px]"
                                    disabled={
                                        locked ||
                                        derivedOutput === "" ||
                                        draft.outputPath === derivedOutput
                                    }
                                    title="Reset to the file name the project policy derives."
                                    onClick={() => {
                                        setOutputError(null);
                                        session.setValue({
                                            ...draft,
                                            outputPath: derivedOutput,
                                        });
                                    }}
                                >
                                    <RotateCcw aria-hidden="true" className="h-3 w-3" />
                                    Project default
                                </Button>
                            </div>
                            <p className="mt-1.5 mb-0 text-[10px] leading-relaxed text-ink-muted">
                                {derivedOutput === "" ? (
                                    "The project's General policy needs a source before it can derive a file name."
                                ) : (
                                    <>
                                        Project policy derives{" "}
                                        <span className="font-mono text-ink-secondary">
                                            {derivedOutput}
                                        </span>
                                    </>
                                )}
                            </p>
                            {outputError === null ? null : (
                                <p role="alert" className="mt-2 mb-0 text-[11px] text-danger">
                                    {outputError}
                                </p>
                            )}
                        </Card>

                        <Card
                            title="Temporary directory"
                            badge={storage.data?.custom === true ? "Video" : "Inherited"}
                            action={
                                <Button
                                    variant="ghost"
                                    className="h-7 px-2 text-[10.5px]"
                                    disabled={locked || directory === "" || open === null}
                                    title={
                                        open === null
                                            ? "This host cannot open a folder."
                                            : "Open this video's scratch directory."
                                    }
                                    onClick={() => {
                                        if (open === null) {
                                            return;
                                        }
                                        void open(directory).catch(() =>
                                            toast.error("The folder could not be opened."),
                                        );
                                    }}
                                >
                                    Open
                                </Button>
                            }
                        >
                            <p className="mt-1 mb-2 text-[10.5px] leading-relaxed text-ink-muted">
                                Chunks, scene checkpoints, and the encoder&apos;s sidecars. They
                                stay after a successful run unless retention is turned off.
                            </p>
                            <input
                                aria-label="Temporary directory"
                                value={directory}
                                readOnly
                                spellCheck={false}
                                className={FIELD}
                            />
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Button
                                    variant="secondary"
                                    className="h-8 px-2.5 text-[10.5px]"
                                    disabled={locked || retained > 0 || pickDirectory === null}
                                    title={
                                        retained > 0
                                            ? "Delete the retained chunks before moving the directory. Their paths are recorded in the encoder's sidecars."
                                            : pickDirectory === null
                                              ? "This host cannot show a folder picker."
                                              : undefined
                                    }
                                    onClick={changeDirectory}
                                >
                                    Change…
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="h-8 px-2 text-[10.5px]"
                                    disabled={
                                        locked || storage.data?.custom !== true || retained > 0
                                    }
                                    title={
                                        retained > 0
                                            ? "Delete the retained chunks first."
                                            : undefined
                                    }
                                    onClick={() =>
                                        saveStorage.mutate(null, {
                                            onError: (error) => toast.error(error.message),
                                            onSuccess: () =>
                                                toast.success(
                                                    "Scratch work follows the project again",
                                                ),
                                        })
                                    }
                                >
                                    <RotateCcw aria-hidden="true" className="h-3 w-3" />
                                    Project default
                                </Button>
                                {retained > 0 ? (
                                    <Button
                                        variant="dangerGhost"
                                        className="h-8 px-2 text-[10.5px]"
                                        disabled={locked}
                                        onClick={() => setConfirmDelete(true)}
                                    >
                                        <Trash2 aria-hidden="true" className="h-3 w-3" />
                                        Delete retained
                                    </Button>
                                ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full border border-line-strong bg-raised px-2 py-0.5 text-[9.5px] text-ink-secondary">
                                    {retained <= 0
                                        ? "No retained work"
                                        : `${formatBytes(retained)} retained`}
                                </span>
                                <span className="rounded-full border border-line-strong bg-raised px-2 py-0.5 text-[9.5px] text-ink-secondary">
                                    {storage.data?.free_bytes === null ||
                                    storage.data?.free_bytes === undefined
                                        ? "Free space unknown"
                                        : `${formatBytes(storage.data.free_bytes)} free`}
                                </span>
                                {storage.data?.custom === true && inheritedDirectory !== "" ? (
                                    <span
                                        className="truncate font-mono text-[9.5px] text-ink-muted"
                                        title={inheritedDirectory}
                                    >
                                        Project root: {inheritedDirectory}
                                    </span>
                                ) : null}
                            </div>
                            {retained > 0 ? (
                                <p className="mt-2 mb-0 text-[10px] leading-relaxed text-warning">
                                    This video&apos;s chunks pin their own directory. Delete them
                                    before choosing another folder; existing work is never moved
                                    silently.
                                </p>
                            ) : null}
                            {storageError === null ? null : (
                                <p role="alert" className="mt-2 mb-0 text-[11px] text-danger">
                                    {storageError}
                                </p>
                            )}
                        </Card>
                    </div>
                </div>

                <ClipDetailsSheet
                    open={clipOpen}
                    onClose={() => setClipOpen(false)}
                    probe={probe}
                    sourcePath={video.data?.input_path ?? ""}
                    outputPath={video.data?.output_path ?? ""}
                    retainedBytes={retained}
                />

                <dialog
                    ref={deleteDialog}
                    aria-labelledby="delete-chunks-title"
                    onClose={() => setConfirmDelete(false)}
                    onClick={(event) => {
                        if (event.target === event.currentTarget && !removeChunks.isPending) {
                            setConfirmDelete(false);
                        }
                    }}
                    className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
                >
                    <div className="border-b border-line px-5 py-4">
                        <h2 id="delete-chunks-title" className="m-0 text-base font-semibold">
                            Delete retained work?
                        </h2>
                    </div>
                    <div className="px-5 py-4">
                        <p className="m-0 text-[13px] leading-relaxed text-ink-secondary">
                            This deletes {formatBytes(retained)} of encoded chunks and sidecars. The
                            scene list, the checkpoint, and the finished output stay; a later
                            Quality Check or a re-encode of edited scenes has to run again.
                        </p>
                        {removeChunks.isError ? (
                            <p role="alert" className="mt-3 mb-0 text-[12px] text-danger">
                                {removeChunks.error instanceof Error
                                    ? removeChunks.error.message
                                    : "The chunks could not be deleted."}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                        <Button
                            variant="secondary"
                            onClick={() => setConfirmDelete(false)}
                            disabled={removeChunks.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            disabled={removeChunks.isPending}
                            onClick={() =>
                                removeChunks.mutate(undefined, {
                                    onSuccess: () => {
                                        setConfirmDelete(false);
                                        toast.success("Retained work deleted");
                                    },
                                })
                            }
                        >
                            {removeChunks.isPending ? "Deleting…" : "Delete chunks"}
                        </Button>
                    </div>
                </dialog>
            </div>

            <DraftActions
                {...session.actions}
                onDiscard={discard}
                locked={locked}
                lockedLabel={
                    video.data === undefined
                        ? "Locked while an encode runs"
                        : `${video.data.name} is encoding`
                }
            />
        </main>
    );
}
