import { useEffect, useMemo, useRef, useState } from "react";

import {
    useSaveVideoGeneral,
    useSaveVideoOverrides,
    useMaterialiseScript,
    useScriptGuide,
    useValidateScript,
    useVideo,
    useVideoConfig,
    useVideoGeneral,
    useVideoOverrides,
} from "@av1ation/api";
import type { ScriptCheck } from "@av1ation/contracts";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { ScriptPage, scriptFileName, seedScriptText } from "./ScriptPage";
import { useUnsavedChanges, type GuardChange } from "../../shared/UnsavedChanges";
import { documentFromValues, getIn } from "../../shared/schema/config-schema";
import { inputFromValue, inputKindOf, inputValueOf } from "../../shared/model/input-model";
import { sectionLabel } from "../../shared/model/project-sections";

/** Write one nested input document into a sparse override map without touching siblings. */
function setAtPath(
    value: unknown,
    path: string[],
    next: Record<string, unknown>,
): Record<string, unknown> {
    const [head, ...rest] = path;
    if (head === undefined) {
        return next;
    }
    const source =
        typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
    return {
        ...source,
        [head]: rest.length === 0 ? next : setAtPath(source[head], rest, next),
    };
}

/**
 * The script page for one video's General input or one sequence override.
 *
 * It is the same page shape as the project's script editor, because a script is the same
 * program in both scopes. What differs is the document it writes: a video's General is its
 * own input and output; a sequence override is a sparse field inside the video overrides,
 * so writing it must preserve every other override the section owns.
 */
export function VideoScriptEditorScreen() {
    const { projectId, videoId } = useParams({
        from: "/projects/$projectId/videos/$videoId/script",
    });
    const { section, part } = useSearch({
        from: "/projects/$projectId/videos/$videoId/script",
    });
    const video = useVideo(projectId, videoId);
    const general = useVideoGeneral(projectId, videoId);
    const config = useVideoConfig(projectId, videoId);
    const overrides = useVideoOverrides(projectId, videoId);
    const saveGeneral = useSaveVideoGeneral(projectId, videoId);
    const saveOverrides = useSaveVideoOverrides(projectId, videoId);
    const guide = useScriptGuide();
    const validate = useValidateScript();
    const materialise = useMaterialiseScript();
    const navigate = useNavigate();

    const override = part !== undefined && part !== "";
    const document = useMemo(
        () => (config.data === undefined ? null : documentFromValues(config.data.values)),
        [config.data],
    );
    const inputPath = useMemo(
        () =>
            part === undefined
                ? null
                : part.includes(".")
                  ? ["sequences", ...part.split(".")]
                  : ["sequences", part, "input"],
        [part],
    );
    const currentInput = useMemo(
        () =>
            override
                ? document !== null && inputPath !== null
                    ? getIn(document, inputPath)
                    : undefined
                : general.data?.input,
        [document, general.data?.input, inputPath, override],
    );
    const scriptInput = useMemo(() => inputValueOf(currentInput), [currentInput]);
    const scriptOverride = override && inputKindOf(currentInput) === "vapour_synth_script";

    const [mode, setMode] = useState<"file" | "text">("text");
    const [path, setPath] = useState("");
    const [text, setText] = useState("");
    const [initialized, setInitialized] = useState(false);
    const [check, setCheck] = useState<ScriptCheck | null>(null);
    const seeded = useRef(false);

    useEffect(() => {
        if (initialized) {
            return;
        }
        if (override) {
            if (document === null || inputPath === null) {
                return;
            }
            const value = inputValueOf(getIn(document, inputPath));
            setInitialized(true);
            setMode(value.scriptMode);
            setPath(value.script);
            setText(value.scriptText);
            return;
        }
        if (general.data === undefined) {
            return;
        }
        const value = inputValueOf(general.data.input);
        setInitialized(true);
        setMode(value.scriptMode);
        setPath(value.script);
        setText(value.scriptText);
    }, [inputPath, document, general.data, initialized, override]);

    useEffect(() => {
        if (seeded.current || guide.data === undefined || !initialized || mode !== "text") {
            return;
        }
        if (text.trim() === "") {
            seeded.current = true;
            setText(guide.data.template);
        }
    }, [guide.data, initialized, mode, text]);

    const ready = override ? document !== null : general.data !== undefined;
    const savedMode = scriptInput.scriptMode;
    const savedPath = scriptInput.script;
    const savedText = scriptInput.scriptText;
    const dirty =
        ready &&
        !(override && !scriptOverride) &&
        (mode !== savedMode || path !== savedPath || text !== savedText);

    const changes: GuardChange[] = useMemo(() => {
        if (!ready || (override && !scriptOverride)) {
            return [];
        }
        const list: GuardChange[] = [];
        if (mode !== savedMode) {
            list.push({
                label: "Script source",
                from: savedMode === "file" ? "A .vpy file" : "Stored in the app",
                to: mode === "file" ? "A .vpy file" : "Stored in the app",
            });
        }
        if (mode === "file" && path !== savedPath) {
            list.push({
                label: "Script file",
                from: savedPath || "—",
                to: path || "—",
            });
        }
        if (mode === "text" && text !== savedText) {
            list.push({
                label: "Script",
                from: `${String(savedText.length)} characters`,
                to: `${String(text.length)} characters`,
            });
        }
        return list;
    }, [mode, path, ready, savedMode, savedPath, savedText, scriptOverride, override, text]);

    const saveDraft = async (): Promise<boolean> => {
        if (!ready || saveGeneral.isPending || saveOverrides.isPending) {
            return false;
        }
        const nextValue = {
            ...scriptInput,
            scriptMode: mode,
            script: path.trim(),
            scriptText: text,
        };
        if (override) {
            if (document === null || inputPath === null || overrides.data === undefined) {
                return false;
            }
            try {
                const fields = setAtPath(
                    overrides.data.fields,
                    inputPath,
                    inputFromValue(nextValue, currentInput),
                );
                await saveOverrides.mutateAsync({ fields });
                toast.success("VapourSynth script saved");
                return true;
            } catch {
                return false;
            }
        }
        if (general.data === undefined) {
            return false;
        }
        try {
            await saveGeneral.mutateAsync({
                input: inputFromValue(nextValue, general.data.input),
                output: general.data.output,
                source_path: general.data.source_path,
            });
            toast.success("VapourSynth script saved");
            return true;
        } catch {
            return false;
        }
    };

    useUnsavedChanges({
        dirty,
        pending: saveGeneral.isPending || saveOverrides.isPending,
        label: "VapourSynth script",
        changes,
        save: saveDraft,
    });

    const filename = scriptFileName(mode === "file" ? path : "script.vpy");
    const videos = useMemo(() => (video.data === undefined ? [] : [video.data]), [video.data]);
    const videoPath = videos[0]?.input_path ?? general.data?.source_path ?? "";

    const runCheck = () => {
        if (text.trim() === "") {
            setCheck({
                status: "invalid",
                clip: null,
                detail: "The script is empty, so there is nothing to evaluate.",
            });
            return;
        }
        if (videoPath === "") {
            setCheck({
                status: "unavailable",
                clip: null,
                detail: "The video has no source path, so the script cannot be opened.",
            });
            return;
        }
        validate.mutate(
            { script: text, videoPath },
            {
                onSuccess: (result) => setCheck(result),
                onError: () =>
                    setCheck({
                        status: "unavailable",
                        clip: null,
                        detail: "The check did not reach the service.",
                    }),
            },
        );
    };

    const back = () =>
        void navigate({
            to: "/projects/$projectId/videos/$videoId/config/$section",
            params: {
                projectId,
                videoId,
                section: section ?? "general",
            },
        });

    const switchToScript = async () => {
        const template = guide.data?.template ?? "";
        if (
            document === null ||
            inputPath === null ||
            overrides.data === undefined ||
            template === ""
        ) {
            return;
        }
        const previous = getIn(document, inputPath);
        const next = inputFromValue(
            {
                ...inputValueOf(previous),
                kind: "vapour_synth_script",
                scriptMode: "text",
                scriptText: template,
            },
            previous,
        );
        try {
            await saveOverrides.mutateAsync({
                fields: setAtPath(overrides.data.fields, inputPath, next),
            });
            setMode("text");
            setPath("");
            setText(template);
            seeded.current = true;
            toast.success("This input now uses a custom script");
        } catch {
            // The mutation's error is rendered by the page's alert below.
        }
    };

    const loading = override ? config.isPending : general.isPending;
    const failed = override ? config.isError : general.isError;

    if (loading) {
        return (
            <main id="main" className="page py-6">
                <div className="h-[520px] animate-pulse rounded-lg border border-line bg-surface" />
            </main>
        );
    }

    if (failed || !ready) {
        return (
            <main id="main" className="mx-auto w-full max-w-[720px] px-6 py-16">
                <div className="rounded-lg border border-danger/30 bg-surface p-6" role="alert">
                    <h1 className="m-0 text-xl font-semibold text-ink">
                        The script could not be loaded
                    </h1>
                    <p className="mt-2 mb-4 text-[13px] leading-relaxed text-ink-secondary">
                        The video document did not arrive, so its input has no script to show.
                    </p>
                    <Button
                        variant="secondary"
                        onClick={() => void (override ? config.refetch() : general.refetch())}
                    >
                        Retry
                    </Button>
                </div>
            </main>
        );
    }

    if (override && !scriptOverride) {
        return (
            <main id="main" className="mx-auto w-full max-w-[720px] px-6 py-16">
                <div className="rounded-lg border border-line bg-surface p-6">
                    <h1 className="m-0 text-xl font-semibold text-ink">
                        This override does not use a script yet
                    </h1>
                    <p className="mt-2 mb-4 text-[13px] leading-relaxed text-ink-secondary">
                        The page edits the script of the input that owns this override. You can
                        switch that input to a custom script here, or go back to the section.
                    </p>
                    {saveOverrides.isError ? (
                        <p
                            role="alert"
                            className="mb-4 mt-0 text-[12px] leading-relaxed text-danger"
                        >
                            {saveOverrides.error instanceof Error
                                ? saveOverrides.error.message
                                : "The input could not be changed. Try again."}
                        </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                        <Button
                            onClick={() => void switchToScript()}
                            disabled={
                                saveOverrides.isPending || (guide.data?.template ?? "") === ""
                            }
                        >
                            {saveOverrides.isPending ? "Saving…" : "Use a custom script"}
                        </Button>
                        <Button variant="secondary" onClick={back}>
                            Back to the section
                        </Button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <ScriptPage
            locationLabel={override ? "Configuration → Input" : "General → Input"}
            scopeTitle={override ? "This sequence" : "This video"}
            scopeNote={
                override
                    ? "Only this sequence evaluates this script. Every other sequence keeps the input General configures."
                    : "This video's input is one graph for the whole file, including every scene. A sequence override replaces it for that sequence only."
            }
            storedNote="Storing a copy converts the input from a file path to stored text; the external file's folder is no longer on the import path."
            filename={filename}
            origin={
                mode === "file"
                    ? path || "No file located"
                    : override
                      ? "Stored in this sequence override"
                      : "Stored in this video"
            }
            mode={mode}
            text={text}
            dirty={dirty}
            pending={saveGeneral.isPending || saveOverrides.isPending}
            onSave={() => void saveDraft()}
            onDiscard={() => {
                setMode(savedMode);
                setPath(savedPath);
                setText(savedText);
                setCheck(null);
                seeded.current = true;
            }}
            onTextChange={(next) => {
                seeded.current = true;
                setText(next);
            }}
            onStoreCopy={() => {
                seeded.current = true;
                setMode("text");
                setText(seedScriptText(text, guide.data?.template ?? ""));
            }}
            onEditFile={() => {
                seeded.current = true;
                setMode("file");
            }}
            guide={guide.data}
            onMaterialise={(script) =>
                materialise.mutateAsync({
                    script,
                    video_path: videoPath === "" ? null : videoPath,
                    project_id: projectId,
                    video_id: videoId,
                    sequence_config: null,
                })
            }
            videoPath={videoPath}
            check={check}
            onValidate={runCheck}
            validating={validate.isPending}
            incomplete={null}
            backLabel={`Back to ${section === undefined ? "General" : sectionLabel(section)}`}
            onBack={back}
        />
    );
}
