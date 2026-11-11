import {
    useLanguageServer,
    usePickExecutable,
    usePythonInterpreters,
    useSavePythonInterpreter,
    useSettings,
} from "@av1ation/api";
import { FolderOpen } from "lucide-react";

import { Button } from "../../shared/Button";
import { HostPathAlerts, HostPathField } from "./HostPathField";
import { useHostPathField } from "./useHostPathField";

/**
 * The interpreter the script editor's language server analyses.
 *
 * Packages belong to an interpreter, so a venv or a second install is invisible to Pyright,
 * jedi-language-server, and pylsp until this names its `python`. The service validates the
 * file and reports the version it answered, which is the only way to tell a working venv
 * from a path to something else. With no setting the service still resolves the machine's
 * own interpreter and forwards it, so the row names that one instead of claiming a default
 * nobody can check.
 */
const INTERPRETER_ORIGIN: Record<string, string> = {
    path: "found on PATH",
    virtual_env: "from VIRTUAL_ENV",
    conda_prefix: "from CONDA_PREFIX",
    launcher: "from the Windows launcher",
    bundled: "from the bundled toolchain",
};

const INTERPRETER_SELECT_LABEL: Record<string, string> = {
    path: "PATH",
    virtual_env: "VIRTUAL_ENV",
    conda_prefix: "CONDA_PREFIX",
    launcher: "py launcher",
    setting: "saved",
    bundled: "bundled",
};

const SELECT =
    "h-9 w-full min-w-0 rounded-md border border-line-strong bg-raised px-2 text-[11px] text-ink focus:border-brand focus:outline-none disabled:opacity-50";

export function PythonInterpreterGroup() {
    const settings = useSettings();
    const languageServer = useLanguageServer();
    const interpreters = usePythonInterpreters();
    const saveInterpreter = useSavePythonInterpreter();
    const pickExecutable = usePickExecutable();
    const saved = settings.data?.python_interpreter ?? "";
    const field = useHostPathField({
        stored: saved,
        pick: pickExecutable,
        save: (path) => saveInterpreter.mutateAsync(path),
        empty: "clear",
        describeSaveFailure: (error) =>
            error instanceof Error
                ? `The interpreter was not saved: ${error.message}`
                : "The interpreter was not saved. Try again.",
    });
    const version = languageServer.data?.interpreter_version;
    // The provider is only named when there is a process to start; without one the editor's
    // bundled tables take over, and calling those a server would be a fiction.
    const serverLabel =
        languageServer.data?.available === true && typeof languageServer.data.label === "string"
            ? languageServer.data.label
            : null;
    // The row states the environment completion reads, so an automatic choice is named and
    // attributed rather than hidden behind "server default".
    const resolved = saved === "" ? languageServer.data?.interpreter : undefined;
    const origin =
        INTERPRETER_ORIGIN[languageServer.data?.interpreter_source ?? ""] ?? "the machine default";
    const listed = interpreters.data?.interpreters ?? [];
    // A saved path discovery did not find still belongs in the list, or the picker would
    // read "Automatic" while the server is analysing something else.
    const options =
        saved === "" || listed.some((entry) => entry.path === saved)
            ? listed
            : [{ path: saved, source: "setting", version }, ...listed];

    const helper = (
        <>
            <p className="m-0 text-[10.5px] leading-relaxed text-ink-muted">
                {saved !== "" ? (
                    "Packages installed in this environment complete in the script editor. Clearing the field returns to the automatic choice."
                ) : typeof resolved === "string" ? (
                    <>
                        Using{" "}
                        <span className="break-all font-mono text-ink-secondary">{resolved}</span>
                        {typeof version === "string" ? ` (Python ${version})` : ""} — {origin}.
                        Choose a venv&apos;s interpreter to complete the packages installed in it
                        instead.
                    </>
                ) : (
                    "No Python interpreter was found. Choose one above, install Python, or use a build with the bundled toolchain, so the editor can complete the packages installed in it."
                )}
            </p>
            {saved !== "" && typeof version !== "string" ? (
                <p className="m-0 mt-1.5 text-[10.5px] leading-relaxed text-ink-secondary">
                    The service could not read a version from this file. Check that it is the
                    environment&apos;s Python executable, not a launcher or a folder.
                </p>
            ) : null}
        </>
    );

    return (
        <section aria-labelledby="dependency-script-editor" className="mb-5 break-inside-avoid">
            <h2
                id="dependency-script-editor"
                className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted"
            >
                Script editor
            </h2>
            <div className="rounded-lg border border-line bg-surface">
                <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <span className="block text-[13px] text-ink">Python interpreter</span>
                        {serverLabel === null ? null : (
                            <span
                                className="mt-0.5 block truncate font-mono text-[10px] text-ink-muted"
                                data-tip={`Completion comes from ${serverLabel}`}
                            >
                                Completion · {serverLabel}
                            </span>
                        )}
                    </div>
                    <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${
                            typeof version === "string"
                                ? "border-success/30 bg-success-soft text-success"
                                : "border-line-strong bg-raised text-ink-secondary"
                        }`}
                    >
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                        {saved === ""
                            ? typeof version === "string"
                                ? `Default · Python ${version}`
                                : "No Python found"
                            : typeof version === "string"
                              ? `Python ${version}`
                              : "Not verified"}
                    </span>
                </div>
                <div className="px-4 py-3">
                    <div className="grid gap-2">
                        <select
                            aria-label="Python interpreter"
                            value={saved}
                            disabled={settings.data === undefined || field.pending}
                            onChange={(event) => field.submit(event.target.value)}
                            className={SELECT}
                        >
                            <option value="">
                                Automatic — the machine&apos;s or bundled Python
                            </option>
                            {options.map((entry) => (
                                <option key={`${entry.source}:${entry.path}`} value={entry.path}>
                                    {entry.source === "bundled"
                                        ? `Bundled · ${entry.version === undefined ? "Python" : `Python ${entry.version}`} — ${entry.path}`
                                        : `${entry.version === undefined ? "Python" : `Python ${entry.version}`} — ${entry.path} (${INTERPRETER_SELECT_LABEL[entry.source] ?? entry.source})`}
                                </option>
                            ))}
                        </select>
                        {field.canPick ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="h-8 px-2.5 text-[11.5px]"
                                    disabled={settings.data === undefined || field.pending}
                                    onClick={() => field.locate(saved)}
                                    data-tip="Opens at the interpreter in the field"
                                >
                                    <FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />
                                    Locate…
                                </Button>
                            </div>
                        ) : (
                            <HostPathField
                                field={field}
                                label="Python interpreter path"
                                placeholder="Path to python.exe inside a venv"
                                disabled={settings.data === undefined}
                                footer={helper}
                            />
                        )}
                    </div>
                    {field.canPick ? (
                        <>
                            <div className="mt-1.5">{helper}</div>
                            <HostPathAlerts
                                fieldError={field.fieldError}
                                saveError={field.saveError}
                            />
                        </>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
