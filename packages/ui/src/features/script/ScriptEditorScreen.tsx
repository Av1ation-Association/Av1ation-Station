import { useEffect, useMemo, useRef, useState } from "react";

import {
    useProject,
    useProjectConfig,
    useMaterialiseScript,
    useProjectVideos,
    useSaveProjectConfig,
    useScriptGuide,
    useUpdateGeneral,
    useValidateScript,
} from "@av1ation/api";
import type { GeneralDefaults, ScriptCheck } from "@av1ation/contracts";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import {
    generalDefaultsIncomplete,
    generalDefaultsPayload,
} from "../configuration/GeneralDefaultsEditor";
import { ScriptPage, scriptFileName, seedScriptText } from "./ScriptPage";
import { useUnsavedChanges, type GuardChange } from "../../shared/UnsavedChanges";
import { documentFromValues, getIn } from "../../shared/schema/config-schema";
import { inputFromValue, inputKindOf, inputValueOf } from "../../shared/model/input-model";
import { sectionLabel } from "../../shared/model/project-sections";

/**
 * Writes a script input back into the sequence path it came from.
 *
 * The path is `sequences.<part>.input` for a part, or the dotted field itself for
 * `target_quality.metric_input`; both are nested plain objects in the document.
 */
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
    return { ...source, [head]: rest.length === 0 ? next : setAtPath(source[head], rest, next) };
}

/**
 * The dedicated VapourSynth-script page for a project.
 *
 * It edits either General's own input or one sequence override named by `part`. The page
 * shell, the editor, and the guide are shared with the template's equivalent, so the two
 * documents cannot drift into different editors.
 */
export function ScriptEditorScreen() {
    const { projectId } = useParams({ from: "/projects/$projectId/config/script" });
    const { section, part } = useSearch({ from: "/projects/$projectId/config/script" });
    const project = useProject(projectId);
    const videos = useProjectVideos(projectId);
    const config = useProjectConfig(projectId);
    const saveConfig = useSaveProjectConfig(projectId);
    const guide = useScriptGuide();
    const materialise = useMaterialiseScript();
    const update = useUpdateGeneral(projectId);
    const validate = useValidateScript();
    const navigate = useNavigate();

    const override = part !== undefined && part !== "";
    const document = useMemo(
        () => (config.data === undefined ? null : documentFromValues(config.data.values)),
        [config.data],
    );
    // A part without a dot names a whole sequence part, whose script sits in `input`; a
    // dotted part names the field itself (`target_quality.metric_input`).
    const inputPath = useMemo(
        () =>
            part === undefined
                ? null
                : part.includes(".")
                  ? ["sequences", ...part.split(".")]
                  : ["sequences", part, "input"],
        [part],
    );

    const saved = project.data?.general;
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
        if (saved === undefined) {
            return;
        }
        setInitialized(true);
        setMode(saved.script_mode ?? "file");
        setPath(saved.script ?? "");
        setText(saved.script_text ?? "");
    }, [initialized, saved, override, document, inputPath]);

    // A new stored script starts from the template the service generates, so the import and
    // the per-scene loop are visible from the first keystroke instead of remembered.
    useEffect(() => {
        if (seeded.current || guide.data === undefined || !initialized || mode !== "text") {
            return;
        }
        if (text.trim() === "") {
            seeded.current = true;
            setText(guide.data.template);
        }
    }, [guide.data, initialized, mode, text]);

    const currentInput =
        document !== null && inputPath !== null ? getIn(document, inputPath) : undefined;
    const scriptInput = inputValueOf(currentInput);
    const scriptOverride = override && inputKindOf(currentInput) === "vapour_synth_script";
    const ready = override ? document !== null : saved !== undefined;
    const savedMode = override ? scriptInput.scriptMode : (saved?.script_mode ?? "file");
    const savedPath = override ? scriptInput.script : (saved?.script ?? "");
    const savedText = override ? scriptInput.scriptText : (saved?.script_text ?? "");
    const dirty =
        ready &&
        (override ? scriptOverride : true) &&
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
            list.push({ label: "Script file", from: savedPath || "—", to: path || "—" });
        }
        if (mode === "text" && text !== savedText) {
            list.push({
                label: "Script",
                from: `${String(savedText.length)} characters`,
                to: `${String(text.length)} characters`,
            });
        }
        return list;
    }, [mode, path, savedMode, savedPath, savedText, text, override, ready, scriptOverride]);

    const saveDraft = async (): Promise<boolean> => {
        if (!ready || update.isPending || saveConfig.isPending) {
            return false;
        }
        if (override) {
            if (document === null || inputPath === null) {
                return false;
            }
            const previous = getIn(document, inputPath);
            const next = inputFromValue(
                {
                    ...inputValueOf(previous),
                    scriptMode: mode,
                    script: path.trim(),
                    scriptText: text,
                },
                previous,
            );
            try {
                await saveConfig.mutateAsync(setAtPath(document, inputPath, next));
                toast.success("VapourSynth script saved");
                return true;
            } catch {
                return false;
            }
        }
        if (saved === undefined) {
            return false;
        }
        try {
            const general: GeneralDefaults = generalDefaultsPayload({
                ...saved,
                script_mode: mode,
                ...(mode === "file" ? { script: path.trim() } : { script_text: text }),
            });
            await update.mutateAsync(general);
            toast.success("VapourSynth script saved");
            return true;
        } catch {
            return false;
        }
    };

    useUnsavedChanges({
        dirty,
        pending: update.isPending || saveConfig.isPending,
        label: "VapourSynth script",
        changes,
        save: saveDraft,
    });

    const filename = scriptFileName(mode === "file" ? path : "script.vpy");
    const incomplete =
        saved === undefined || override
            ? null
            : generalDefaultsIncomplete(
                  generalDefaultsPayload({
                      ...saved,
                      script_mode: mode,
                      ...(mode === "file" ? { script: path.trim() } : { script_text: text }),
                  }),
              );

    // A script that reads `cd.video_path` can only be checked against a real file. The page
    // names the first queued video; the check explains itself when the queue is empty.
    const videoPath = videos.data?.[0]?.input_path ?? "";

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
                detail: "Add a video to this project first: the script opens the queued file, so there is nothing to check yet.",
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
            to: "/projects/$projectId/config/$section",
            params: { projectId, section: section ?? "general" },
        });

    /**
     * Make the override the page was opened for into a script, without a detour.
     *
     * A route can outlive the draft that justified it: a discard, a reload, or a link all
     * arrive here while the stored input is still FFMS2. Offering the conversion is what
     * keeps that state a choice instead of a dead end.
     */
    const switchToScript = async () => {
        const template = guide.data?.template ?? "";
        if (document === null || inputPath === null || template === "") {
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
            await saveConfig.mutateAsync(setAtPath(document, inputPath, next));
            setMode("text");
            setPath("");
            setText(template);
            seeded.current = true;
            toast.success("This input now uses a custom script");
        } catch {
            // The mutation's error is rendered by the page's alert below.
        }
    };

    const loading = override ? config.isPending : project.isPending;
    const failed = override ? config.isError : project.isError;

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
                        The project document did not arrive, so its input has no script to show.
                    </p>
                    <Button
                        variant="secondary"
                        onClick={() => void (override ? config.refetch() : project.refetch())}
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
                        switch that input to a custom script here, or discard the idea and go back
                        to the section.
                    </p>
                    {saveConfig.isError ? (
                        <p
                            role="alert"
                            className="mb-4 mt-0 text-[12px] leading-relaxed text-danger"
                        >
                            {saveConfig.error instanceof Error
                                ? saveConfig.error.message
                                : "The input could not be changed. Try again."}
                        </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                        <Button
                            onClick={() => void switchToScript()}
                            disabled={saveConfig.isPending || (guide.data?.template ?? "") === ""}
                        >
                            {saveConfig.isPending ? "Saving…" : "Use a custom script"}
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
            scopeTitle={override ? "This sequence" : "This project"}
            scopeNote={
                override
                    ? "Only this sequence evaluates this script. Every other sequence keeps the input General configures."
                    : "Every sequence without its own input evaluates this script, and a sequence override replaces it for that sequence only."
            }
            storedNote="Storing a copy converts the input from a file path to stored text; the external file's folder is no longer on the import path."
            filename={filename}
            origin={
                mode === "file"
                    ? path || "No file located"
                    : override
                      ? "Stored in this sequence override"
                      : "Stored in this project"
            }
            mode={mode}
            text={text}
            dirty={dirty}
            pending={update.isPending || saveConfig.isPending}
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
                    project_id: null,
                    video_id: null,
                    sequence_config: null,
                })
            }
            videoPath={videoPath}
            check={check}
            onValidate={runCheck}
            validating={validate.isPending}
            incomplete={incomplete}
            backLabel={`Back to ${section === undefined ? "General" : sectionLabel(section)}`}
            onBack={back}
        />
    );
}
