import { useLanguageServer, useLanguageServerChannel, useSaveTextFile } from "@av1ation/api";
import type { ScriptCheck, ScriptGuide, ScriptMaterialised } from "@av1ation/contracts";
import {
    Check,
    CircleAlert,
    CircleDashed,
    Copy,
    Download,
    FileCode2,
    Lock,
    RefreshCw,
} from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { downloadText } from "../../shared/download";
import { Button } from "../../shared/Button";
import { parseStub } from "./python-stub";
import { ScriptEditor } from "./ScriptEditor";
import { DraftActions } from "../../shared/TopBarActions";

/** The file name a path ends with, or the placeholder for stored text. */
export function scriptFileName(path: string): string {
    const name = path
        .split(/[\\/]/u)
        .filter((part) => part !== "")
        .pop();
    return name === undefined || name === "" ? "script.vpy" : name;
}

function validationChip(check: ScriptCheck | null) {
    if (check === null) {
        return {
            icon: CircleDashed,
            label: "Not checked yet",
            tone: "text-ink-muted border-line",
        };
    }
    switch (check.status) {
        case "valid":
            return {
                icon: Check,
                label: "Validated",
                tone: "text-success border-success/40 bg-success-soft",
            };
        case "invalid":
            return {
                icon: CircleAlert,
                label: "The script failed",
                tone: "text-danger border-danger/40 bg-danger-soft",
            };
        case "unavailable":
        default:
            return {
                icon: CircleAlert,
                label: "Cannot check here",
                tone: "text-warning border-warning/40 bg-warning-soft",
            };
    }
}

/**
 * The one VapourSynth script page, shown for a project, a sequence override, or the global
 * template.
 *
 * A script is a program, not a form field: it needs indentation, completion against the
 * generated data module, and an evaluation before it is trusted. That is why it is a page
 * while the input section only chooses how the script is supplied. The page itself is
 * shared, so all three documents offer the same editor, check, and injected-data card.
 */
export function ScriptPage({
    locationLabel,
    scopeTitle,
    scopeNote,
    storedNote,
    filename,
    origin,
    mode,
    text,
    dirty,
    pending,
    onSave,
    onDiscard,
    onTextChange,
    onStoreCopy,
    onEditFile,
    onMaterialise,
    guide,
    videoPath,
    check,
    onValidate,
    validating,
    incomplete,
    backLabel,
    onBack,
}: {
    /** Where the script lives, for example `General → Input`. */
    locationLabel: string;
    /** The side card's title, for example `This input`. */
    scopeTitle: string;
    /** What the stored script belongs to. */
    scopeNote: string;
    /** The smaller note under the mode buttons. */
    storedNote: string;
    filename: string;
    /** The path line under the title: a located file or where the draft is stored. */
    origin: string;
    mode: "file" | "text";
    text: string;
    dirty: boolean;
    pending: boolean;
    onSave: () => void;
    onDiscard: () => void;
    onTextChange: (text: string) => void;
    /** Switch to stored text, seeded from the template when the draft is empty. */
    onStoreCopy: () => void;
    /** Switch back to a script that stays in its own file. */
    onEditFile: () => void;
    /** Build a standalone `.vpy` from the draft, when this page has a video to describe. */
    onMaterialise?: ((script: string) => Promise<ScriptMaterialised>) | undefined;
    guide: ScriptGuide | undefined;
    /** The file a check opens; empty when the page has no queued video to evaluate. */
    videoPath: string;
    check: ScriptCheck | null;
    onValidate: () => void;
    validating: boolean;
    /** A summary the document requires before it can be saved, or `null`. */
    incomplete: string | null;
    backLabel: string;
    onBack: () => void;
}) {
    const [tab, setTab] = useState<"script" | "stub" | "materialised">("script");
    const [formatting, setFormatting] = useState(false);
    const [materialised, setMaterialised] = useState<ScriptMaterialised | null>(null);
    const [materialising, setMaterialising] = useState(false);
    const [materialiseError, setMaterialiseError] = useState<string | null>(null);
    const saveText = useSaveTextFile();
    const languageServer = useLanguageServer();
    const openLanguageServer = useLanguageServerChannel();
    const workspace =
        languageServer.data?.available === true && typeof languageServer.data.workspace === "string"
            ? languageServer.data.workspace
            : undefined;
    const chip = validationChip(check);
    const ChipIcon = chip.icon;
    const stub = guide?.stub ?? "";
    const variables = guide?.variables ?? [];
    const module = parseStub(stub);
    // The generated document classes are the types those values carry, not data: the list
    // states what a script can read, and the tree lives in the stub tab.
    const data = module.members.filter((member) => member.kind !== "class");

    const runCheck = () => {
        if (text.trim() === "") {
            return;
        }
        onValidate();
    };

    // The export is built from the draft on a user action, never on an effect: a script page
    // is a text editor, and fetching a full materialisation on every keystroke would rebuild
    // a thousand-line module while the user is still typing.
    const loadMaterialised = async () => {
        if (onMaterialise === undefined) {
            return;
        }
        setTab("materialised");
        setMaterialising(true);
        setMaterialiseError(null);
        try {
            setMaterialised(await onMaterialise(text));
        } catch (error) {
            setMaterialiseError(
                error instanceof Error
                    ? error.message
                    : "The materialised script could not be built.",
            );
        } finally {
            setMaterialising(false);
        }
    };

    /** The tab keys in strip order, so the arrow keys cannot land on an absent tab. */
    const tabKeys: readonly ("script" | "stub" | "materialised")[] =
        onMaterialise === undefined ? ["script", "stub"] : ["script", "stub", "materialised"];

    const activateTab = (key: "script" | "stub" | "materialised") => {
        // Returning to a built export must not rebuild it: the Rebuild button owns that,
        // and the arrow keys would otherwise start a build on every press.
        if (key === "materialised" && materialised === null) {
            void loadMaterialised();
            return;
        }
        setTab(key);
    };

    // A tab strip is one tab stop; the arrow keys move within it (ARIA APG). Activation is
    // automatic, which is right for three local panels and matches the strip's click.
    const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
        const step =
            event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : 0;
        const at = tabKeys.indexOf(tab);
        const next =
            event.key === "Home"
                ? tabKeys[0]
                : event.key === "End"
                  ? tabKeys[tabKeys.length - 1]
                  : step === 0
                    ? undefined
                    : tabKeys[(at + step + tabKeys.length) % tabKeys.length];
        if (next === undefined) {
            return;
        }
        event.preventDefault();
        activateTab(next);
        document.getElementById(`script-tab-${next}`)?.focus();
    };

    const copyMaterialised = () => {
        if (materialised === null) {
            return;
        }
        void navigator.clipboard
            .writeText(materialised.source)
            .then(() => toast.success(`${materialised.filename} copied`))
            .catch(() => toast.error("The clipboard is not available."));
    };

    /**
     * Write the export where the host lets the user choose.
     *
     * A browser host owns its downloads, so naming the file is all it can do; the desktop
     * host opens its save dialog first, which is the only way the user learns where the
     * file went. The saved path stays in the toast so it is visible after the dialog closes.
     */
    const exportMaterialised = async () => {
        if (materialised === null) {
            return;
        }
        const { filename, source } = materialised;
        if (saveText === null) {
            downloadText(source, filename, "text/x-python;charset=utf-8");
            toast.success(`Saved ${filename} to your downloads`);
            return;
        }
        try {
            const path = await saveText(filename, source, {
                title: "Export VapourSynth script",
                extensions: ["vpy"],
            });
            if (path === null) {
                return;
            }
            toast.success("The script was exported", { description: path });
        } catch (cause) {
            toast.error(
                cause instanceof Error
                    ? `The script could not be written: ${cause.message}`
                    : "The script could not be written.",
            );
        }
    };

    // Ruff is a WASM formatter, so it runs without a Python install and without sending the
    // script anywhere. The import is reached only from this button, which keeps the runtime
    // out of both the initial bundle and the script page's first paint.
    const formatScript = async () => {
        if (text.trim() === "") {
            return;
        }
        setFormatting(true);
        try {
            const { default: init, format } = await import("@wasm-fmt/ruff_fmt/vite");
            await init();
            const next = format(text, filename, { line_width: 100, quote_style: "preserve" });
            if (next !== text) {
                onTextChange(next);
                toast.success("Formatted with Ruff");
            }
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? `Ruff could not format the script: ${error.message}`
                    : "Ruff could not format the script.",
            );
        } finally {
            setFormatting(false);
        }
    };

    return (
        <main id="main" className="page py-6">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_306px]">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="m-0 min-w-0 text-lg font-semibold tracking-tight text-ink">
                            {filename}
                        </h1>
                        <p className="m-0 min-w-0 flex-1 truncate font-mono text-[11px] text-ink-muted">
                            {origin}
                        </p>
                        <Button
                            variant="secondary"
                            className="h-8 shrink-0 px-3 text-[12px]"
                            disabled={mode !== "text" || formatting || text.trim() === ""}
                            onClick={() => void formatScript()}
                            data-tip="Format the stored script with Ruff"
                        >
                            {formatting ? "Formatting…" : "Format"}
                        </Button>
                        <Button
                            variant="secondary"
                            className="h-8 shrink-0 px-3 text-[12px]"
                            disabled={mode !== "text" || validating || text.trim() === ""}
                            onClick={runCheck}
                        >
                            {validating ? "Checking…" : "Validate"}
                        </Button>
                    </div>

                    {mode === "file" ? (
                        <section className="mt-4 rounded-lg border border-line bg-surface">
                            <div className="flex flex-col items-start gap-3 px-5 py-8">
                                <span className="inline-flex items-center gap-2 rounded-md border border-line bg-sunken px-2 py-1 text-[11px] text-ink-secondary">
                                    <FileCode2
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5"
                                        strokeWidth={1.6}
                                    />
                                    External script
                                </span>
                                <p className="m-0 max-w-[62ch] text-[12.5px] leading-relaxed text-ink-secondary">
                                    This input evaluates the file as written. The application never
                                    rewrites an external script, so its text is only editable there.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <Button className="h-8 px-3 text-[12px]" onClick={onStoreCopy}>
                                        Store a script in the app
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        className="h-8 px-3 text-[12px]"
                                        onClick={onBack}
                                    >
                                        {backLabel}
                                    </Button>
                                </div>
                                <p className="m-0 max-w-[62ch] text-[11px] leading-relaxed text-ink-muted">
                                    Storing starts from the template, not from the file: reading a
                                    host file is a host capability, and the LAN browser may not
                                    share this machine&rsquo;s filesystem.
                                </p>
                            </div>
                        </section>
                    ) : (
                        <section className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
                            <div
                                role="tablist"
                                aria-label="Script files"
                                onKeyDown={onTabKey}
                                className="flex items-center gap-1 border-b border-line px-2"
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    id="script-tab-script"
                                    aria-controls="script-panel-script"
                                    aria-selected={tab === "script"}
                                    tabIndex={tab === "script" ? 0 : -1}
                                    onClick={() => setTab("script")}
                                    className={`-mb-px border-b-2 px-3 py-2.5 text-[11.5px] transition-colors duration-150 ${
                                        tab === "script"
                                            ? "border-brand text-ink"
                                            : "border-transparent text-ink-muted hover:text-ink-secondary"
                                    }`}
                                >
                                    {filename}
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    id="script-tab-stub"
                                    aria-controls="script-panel-stub"
                                    aria-selected={tab === "stub"}
                                    tabIndex={tab === "stub" ? 0 : -1}
                                    onClick={() => setTab("stub")}
                                    className={`-mb-px border-b-2 px-3 py-2.5 font-mono text-[11px] transition-colors duration-150 ${
                                        tab === "stub"
                                            ? "border-brand text-ink"
                                            : "border-transparent text-ink-muted hover:text-ink-secondary"
                                    }`}
                                >
                                    {guide?.module_file.replace(/\.py$/u, ".pyi") ??
                                        "condor_data.pyi"}
                                </button>
                                {onMaterialise === undefined ? null : (
                                    <button
                                        type="button"
                                        role="tab"
                                        id="script-tab-materialised"
                                        aria-controls="script-panel-materialised"
                                        aria-selected={tab === "materialised"}
                                        tabIndex={tab === "materialised" ? 0 : -1}
                                        onClick={() => void loadMaterialised()}
                                        className={`-mb-px border-b-2 px-3 py-2.5 text-[11px] transition-colors duration-150 ${
                                            tab === "materialised"
                                                ? "border-brand text-ink"
                                                : "border-transparent text-ink-muted hover:text-ink-secondary"
                                        }`}
                                        data-tip="The exact script a run evaluates, with the generated data module and injected values"
                                    >
                                        Materialised .vpy
                                    </button>
                                )}
                                <span className="ml-1 rounded border border-line px-1.5 py-0.5 text-[9.5px] tracking-[0.08em] text-ink-muted uppercase">
                                    read-only
                                </span>
                            </div>

                            <div
                                role="tabpanel"
                                id={`script-panel-${tab}`}
                                aria-labelledby={`script-tab-${tab}`}
                                className="h-[440px] bg-surface sm:h-[520px]"
                            >
                                {tab === "script" ? (
                                    <ScriptEditor
                                        value={text}
                                        onChange={onTextChange}
                                        stub={stub}
                                        variables={variables}
                                        ariaLabel="Custom VapourSynth script"
                                        path="script.vpy"
                                        openLanguageServer={
                                            workspace === undefined ? undefined : openLanguageServer
                                        }
                                        languageServerWorkspace={workspace}
                                        languageServerKind={
                                            languageServer.data?.available === true &&
                                            typeof languageServer.data.kind === "string"
                                                ? languageServer.data.kind
                                                : undefined
                                        }
                                        languageServerInterpreter={
                                            typeof languageServer.data?.interpreter === "string"
                                                ? languageServer.data.interpreter
                                                : undefined
                                        }
                                    />
                                ) : tab === "stub" ? (
                                    <ScriptEditor
                                        value={stub}
                                        stub={stub}
                                        variables={variables}
                                        readOnly
                                        ariaLabel="Generated condor_data stub"
                                        path="condor_data.pyi"
                                    />
                                ) : (
                                    <div className="flex h-full min-h-0 flex-col">
                                        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                                            <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink">
                                                {materialised?.filename ?? "script.vpy"}
                                            </span>
                                            <Button
                                                variant="secondary"
                                                className="h-7 px-2 text-[10.5px]"
                                                disabled={materialising}
                                                onClick={() => void loadMaterialised()}
                                            >
                                                <RefreshCw
                                                    aria-hidden="true"
                                                    className="h-3 w-3"
                                                    strokeWidth={1.8}
                                                />
                                                {materialising ? "Building…" : "Rebuild"}
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                className="h-7 px-2 text-[10.5px]"
                                                disabled={materialised === null}
                                                onClick={copyMaterialised}
                                            >
                                                <Copy
                                                    aria-hidden="true"
                                                    className="h-3 w-3"
                                                    strokeWidth={1.8}
                                                />
                                                Copy
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                className="h-7 px-2 text-[10.5px]"
                                                disabled={materialised === null}
                                                onClick={() => void exportMaterialised()}
                                            >
                                                <Download
                                                    aria-hidden="true"
                                                    className="h-3 w-3"
                                                    strokeWidth={1.8}
                                                />
                                                Export .vpy
                                            </Button>
                                        </div>
                                        {materialiseError === null ? null : (
                                            <p
                                                role="alert"
                                                className="m-0 border-b border-line bg-danger-soft px-3 py-2 text-[11px] leading-relaxed text-danger"
                                            >
                                                {materialiseError}
                                            </p>
                                        )}
                                        <div className="grid min-h-0 flex-1 md:grid-cols-[280px_minmax(0,1fr)]">
                                            <aside className="min-h-0 overflow-y-auto border-b border-line p-3 md:border-r md:border-b-0">
                                                <p className="m-0 text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                                                    Injected values
                                                </p>
                                                {(materialised?.variables ?? []).map((variable) => (
                                                    <div
                                                        key={variable.key}
                                                        className="border-b border-line-subtle py-2 last:border-0"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <code className="truncate font-mono text-[10.5px] text-ink">
                                                                {variable.key}
                                                            </code>
                                                            <span className="shrink-0 rounded border border-line px-1 text-[8.5px] tracking-[0.06em] text-ink-muted uppercase">
                                                                {variable.format}
                                                            </span>
                                                        </div>
                                                        <p
                                                            className="m-0 mt-1 line-clamp-3 break-all font-mono text-[9.5px] text-ink-muted"
                                                            title={variable.value}
                                                        >
                                                            {variable.value === ""
                                                                ? "(empty)"
                                                                : variable.value}
                                                        </p>
                                                        <p className="m-0 mt-1 text-[9.5px] leading-snug text-ink-muted">
                                                            {variable.description}
                                                        </p>
                                                    </div>
                                                ))}
                                                {materialised === null && materialising ? (
                                                    <p className="m-0 mt-2 text-[11px] text-ink-muted">
                                                        Building the module and values…
                                                    </p>
                                                ) : null}
                                            </aside>
                                            <div className="min-h-0 overflow-auto bg-sunken">
                                                <pre className="m-0 p-3 font-mono text-[10.5px] leading-relaxed whitespace-pre text-ink-secondary">
                                                    {materialised?.source ??
                                                        "Choose Rebuild to build the materialised script."}
                                                </pre>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-line px-4 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] ${chip.tone}`}
                                    >
                                        <ChipIcon
                                            aria-hidden="true"
                                            className="h-3 w-3"
                                            strokeWidth={2}
                                        />
                                        {chip.label}
                                    </span>
                                    <p className="m-0 min-w-0 flex-1 text-[11px] leading-relaxed break-words text-ink-muted">
                                        {check === null
                                            ? "Validate runs the script and asks the clip it returns; a check never saves."
                                            : check.detail}
                                    </p>
                                </div>
                                <p className="mt-2 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                                    {languageServer.data?.available === true
                                        ? typeof languageServer.data.interpreter !== "string"
                                            ? `${languageServer.data.label} supplies completion and hover from this machine's Python environment. `
                                            : `${languageServer.data.label} supplies completion and hover from ${languageServer.data.interpreter}${
                                                  typeof languageServer.data.interpreter_version ===
                                                  "string"
                                                      ? ` (Python ${languageServer.data.interpreter_version})`
                                                      : ", which did not report a version"
                                              }. `
                                        : "Completion covers Python's builtins, the VapourSynth API, core plugin functions, and the generated condor_data module. It is bundled with the application: a sandboxed window cannot load your local Python environment or a language server. "}
                                    The stub is never editable, and the script is one input for the
                                    whole video — per-scene behaviour is the loop above, not one
                                    script per scene.
                                </p>
                            </div>
                        </section>
                    )}

                    {incomplete === null ? null : (
                        <p role="alert" className="mt-3 mb-0 text-[11.5px] text-danger">
                            {incomplete}
                        </p>
                    )}
                </div>

                <aside className="min-w-0 space-y-4">
                    <section className="rounded-lg border border-line bg-surface p-4">
                        <h2 className="m-0 text-[13px] font-semibold text-ink">{scopeTitle}</h2>
                        <p className="mt-1 mb-0 font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase">
                            {locationLabel}
                        </p>
                        <p className="mt-2 mb-0 text-[11px] leading-relaxed text-ink-secondary">
                            {scopeNote}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                                variant="secondary"
                                className="h-7 px-2.5 text-[11px]"
                                onClick={onEditFile}
                            >
                                Edit file
                            </Button>
                            {mode === "file" ? (
                                <Button className="h-7 px-2.5 text-[11px]" onClick={onStoreCopy}>
                                    Store a copy
                                </Button>
                            ) : null}
                        </div>
                        <p className="mt-2 mb-0 text-[10px] leading-relaxed text-ink-muted">
                            {mode === "file" ? storedNote : "The draft is stored with its owner."}
                        </p>
                    </section>

                    <section className="rounded-lg border border-line bg-surface p-4">
                        <h2 className="m-0 text-[13px] font-semibold text-ink">
                            Data a script can read
                        </h2>
                        <p className="mt-1 mb-0 font-mono text-[10px] text-ink-muted">
                            import condor_data as cd
                        </p>
                        {data.length === 0 ? (
                            <p className="mt-2 mb-0 text-[11px] text-ink-muted">
                                The guide has not loaded yet.
                            </p>
                        ) : (
                            <ul className="mt-2 mb-0 list-none space-y-2 p-0">
                                {data.map((member) => (
                                    <li key={member.name} className="text-[11px]">
                                        <div className="flex items-baseline gap-2">
                                            <code className="min-w-0 font-mono break-all text-brand-text">
                                                cd.{member.name}
                                            </code>
                                        </div>
                                        <p className="m-0 text-[10px] leading-relaxed text-ink-muted">
                                            {member.doc === "" ? member.detail : member.doc}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="mt-2 mb-0 text-[10px] leading-relaxed text-ink-secondary">
                            {videoPath === ""
                                ? "This context has no video, so cd.video_path is empty. A project run fills it with the queued file."
                                : `cd.video_path is ${videoPath} for this check.`}
                        </p>

                        {variables.length === 0 ? null : (
                            <details className="mt-3 border-t border-line pt-2">
                                <summary className="cursor-pointer text-[10.5px] text-ink-muted select-none">
                                    Raw values, available without the import
                                </summary>
                                <p className="mt-1 mb-0 text-[10px] leading-relaxed text-ink-muted">
                                    The runner sets these globals as bytes on every open, so a
                                    script can read them without any import. condor_data decodes
                                    that same data into the typed names above; it is a convenience,
                                    not the only way in.
                                </p>
                                <ul className="mt-2 mb-0 list-none space-y-2 p-0">
                                    {variables.map((variable) => (
                                        <li key={variable.key} className="min-w-0">
                                            <div className="flex flex-wrap items-baseline gap-x-2">
                                                <code className="min-w-0 font-mono break-all text-[10.5px] text-ink-secondary">
                                                    {variable.key}
                                                </code>
                                                <span className="ml-auto shrink-0 font-mono text-[9.5px] text-ink-muted">
                                                    {variable.format === "json"
                                                        ? "bytes · JSON"
                                                        : `bytes · ${variable.format}`}
                                                </span>
                                            </div>
                                            {/* The description is the point of the list: a
                                                key alone asks the user to guess what the
                                                bytes contain. */}
                                            <p className="m-0 mt-0.5 text-[10px] leading-relaxed text-ink-muted">
                                                {variable.description}
                                            </p>
                                            <p className="m-0 text-[9.5px] leading-relaxed text-ink-muted">
                                                From {variable.source}.
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </section>

                    <section className="rounded-lg border border-line bg-surface p-4">
                        <h2 className="m-0 text-[13px] font-semibold text-ink">Preview</h2>
                        <Button
                            variant="secondary"
                            className="mt-2 h-8 w-full justify-center px-2.5 text-[11px]"
                            disabled
                        >
                            Preview input
                        </Button>
                        <p className="mt-2 mb-0 text-[10px] leading-relaxed text-ink-muted">
                            Choose a video to preview. This screen has no file picker, and an empty
                            queue has nothing to choose.
                        </p>
                    </section>

                    <section className="rounded-lg border border-line bg-surface p-4">
                        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                            <Lock aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.6} />
                            Draft and save
                        </h2>
                        <p className="mt-2 mb-0 text-[10px] leading-relaxed text-ink-secondary">
                            Edits stay on this page until Save. Cancel restores the last saved
                            script, and leaving with a draft asks first.
                        </p>
                    </section>
                </aside>
            </div>

            <DraftActions dirty={dirty} pending={pending} onSave={onSave} onDiscard={onDiscard} />
        </main>
    );
}

/** The script editor starts from the template, not an empty buffer. */
export function seedScriptText(current: string, template: string): string {
    return current.trim() === "" ? template : current;
}
