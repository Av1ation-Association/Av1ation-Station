import { useEffect, useMemo, useRef, useState } from "react";

import {
    useMaterialiseScript,
    useSaveTemplateDefaults,
    useSaveTemplateGeneral,
    useScriptGuide,
    useTemplateDefaults,
    useTemplateGeneral,
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

/** Writes a nested value back into the template document, cloning the path only. */
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
 * The VapourSynth-script page for the project template.
 *
 * The template is a different document from a project's General, and an existing project
 * must never change when it is edited. It therefore gets its own route and its own two
 * save calls, while the page, editor, and guide are the same components a project uses.
 */
export function DefaultsScriptScreen() {
    const { templateId } = useParams({
        from: "/settings/templates/$templateId/script",
    });
    const { section, part } = useSearch({
        from: "/settings/templates/$templateId/script",
    });
    const defaults = useTemplateDefaults(templateId);
    const generalDefaults = useTemplateGeneral(templateId);
    const save = useSaveTemplateDefaults(templateId);
    const saveGeneral = useSaveTemplateGeneral(templateId);
    const guide = useScriptGuide();
    const materialise = useMaterialiseScript();
    const navigate = useNavigate();

    const override = part !== undefined && part !== "";
    const document = useMemo(
        () => (defaults.data === undefined ? null : documentFromValues(defaults.data.values)),
        [defaults.data],
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

    const saved = generalDefaults.data;
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
        if (!ready || save.isPending || saveGeneral.isPending) {
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
                await save.mutateAsync(setAtPath(document, inputPath, next));
                toast.success("Default script saved for new projects");
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
            await saveGeneral.mutateAsync(general);
            toast.success("Default script saved for new projects");
            return true;
        } catch {
            return false;
        }
    };

    useUnsavedChanges({
        dirty,
        pending: save.isPending || saveGeneral.isPending,
        label: "Default VapourSynth script",
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

    const runCheck = () => {
        if (text.trim() === "") {
            setCheck({
                status: "invalid",
                clip: null,
                detail: "The script is empty, so there is nothing to evaluate.",
            });
            return;
        }
        // The template is not attached to a video, and the template script opens the
        // queued file, so a full evaluation needs a project. Say that instead of running
        // the script against an empty path and reporting a decode error.
        setCheck({
            status: "unavailable",
            clip: null,
            detail: "A project template has no video to open. Add the script to a project with a queued video to check it there.",
        });
    };

    // The page was opened from one section's input, so back returns to that section rather
    // than to the template overview. A link with no section belongs to General.
    const owner = section ?? "general";
    const back = () =>
        void navigate({
            to: "/settings/templates/$templateId/$section",
            params: { templateId, section: owner },
        });

    /** Turn the override this page was opened for into a stored custom script. */
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
            await save.mutateAsync(setAtPath(document, inputPath, next));
            setMode("text");
            setPath("");
            setText(template);
            seeded.current = true;
            toast.success("This input now uses a custom script");
        } catch {
            // The mutation's error is rendered by the page's alert below.
        }
    };

    const loading = override ? defaults.isPending : generalDefaults.isPending;
    const failed = override ? defaults.isError : generalDefaults.isError;

    if (loading) {
        return (
            <main id="main" aria-busy="true" className="page py-6">
                <div className="h-[520px] animate-pulse rounded-lg border border-line bg-surface" />
            </main>
        );
    }

    if (failed || !ready) {
        return (
            <main id="main" className="mx-auto w-full max-w-[720px] px-6 py-16">
                <div className="rounded-lg border border-danger/30 bg-surface p-6" role="alert">
                    <h1 className="m-0 text-xl font-semibold text-ink">
                        The default script could not be loaded
                    </h1>
                    <p className="mt-2 mb-4 text-[13px] leading-relaxed text-ink-secondary">
                        The project template did not arrive, so it has no script to show.
                    </p>
                    <Button
                        variant="secondary"
                        onClick={() =>
                            void (override ? defaults.refetch() : generalDefaults.refetch())
                        }
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
                        This default override does not use a script yet
                    </h1>
                    <p className="mt-2 mb-4 text-[13px] leading-relaxed text-ink-secondary">
                        The page edits the script of the input that owns this override. You can
                        switch that input to a custom script here, or go back to Project Template
                        and discard the idea.
                    </p>
                    {save.isError ? (
                        <p
                            role="alert"
                            className="mb-4 mt-0 text-[12px] leading-relaxed text-danger"
                        >
                            {save.error instanceof Error
                                ? save.error.message
                                : "The template could not be changed. Try again."}
                        </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                        <Button
                            onClick={() => void switchToScript()}
                            disabled={save.isPending || (guide.data?.template ?? "") === ""}
                        >
                            {save.isPending ? "Saving…" : "Use a custom script"}
                        </Button>
                        <Button variant="secondary" onClick={back}>
                            Back to {sectionLabel(owner)}
                        </Button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <ScriptPage
            locationLabel={override ? "Defaults → Input" : "Defaults → General → Input"}
            scopeTitle={override ? "This default override" : "New projects"}
            scopeNote={
                override
                    ? "Every new project copies this override for that sequence. Existing projects keep the input they already have."
                    : "Every new project copies this script into its General input. Existing projects keep the script they already have."
            }
            storedNote="Storing a copy converts the template's input from a file path to stored text; the project copies the text, not a path on this machine."
            filename={filename}
            origin={
                mode === "file"
                    ? path || "No file located"
                    : override
                      ? "Stored in this default override"
                      : "Stored in the project template"
            }
            mode={mode}
            text={text}
            dirty={dirty}
            pending={save.isPending || saveGeneral.isPending}
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
                    video_path: null,
                    project_id: null,
                    video_id: null,
                    sequence_config: null,
                })
            }
            videoPath=""
            check={check}
            onValidate={runCheck}
            validating={false}
            incomplete={incomplete}
            backLabel={`Back to ${sectionLabel(owner)}`}
            onBack={back}
        />
    );
}
