import type { VapourSynthPluginProblem } from "@av1ation/contracts";
import { TriangleAlert } from "lucide-react";

/**
 * The plugin references the scripts on this page cannot satisfy.
 *
 * The service returns every problem in a document by input context; `contexts` narrows them
 * to the inputs this page owns, so a broken Encoding script is reported on Encoding rather
 * than beside the Start button of every tab. `error` covers a scan that could not run, such
 * as an unreadable script file, which is not a missing namespace and is phrased separately.
 */
export function ScriptPluginNotice({
    problems,
    error,
    contexts,
}: {
    problems: readonly VapourSynthPluginProblem[];
    error?: string | null | undefined;
    /** The input section names this page owns, for example `General input`. */
    contexts?: readonly string[] | undefined;
}) {
    const relevant =
        contexts === undefined
            ? problems
            : problems.filter((problem) => contexts.includes(problem.context));
    // A scan error is one sentence for the whole document, but the engine names the input
    // whose script could not be read. Keep it on that page rather than repeating it beside
    // every input in the document.
    const relevantError =
        error != null &&
        error.trim() !== "" &&
        (contexts === undefined || contexts.some((context) => error.includes(context)))
            ? error
            : undefined;
    if (relevant.length === 0 && relevantError === undefined) {
        return null;
    }

    const namespaces = new Set(relevant.map((problem) => problem.namespace));
    const pluginMissing = relevant.every((problem) => problem.function === undefined);
    const namespaceList = [...namespaces].join(", ");
    const showContext = new Set(relevant.map((problem) => problem.context)).size > 1;
    // The API's detail and remediation are also read as plain error text, where backticks
    // mark code. The page already renders the namespace in its own column.
    const plain = (text: string) => text.replaceAll("`", "");
    return (
        <section
            aria-label="VapourSynth plugin notice"
            className="mb-4 rounded-md border border-warning/30 bg-warning-soft"
        >
            <div className="flex items-start gap-2.5 px-3 py-2.5">
                <TriangleAlert aria-hidden="true" className="mt-px h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0">
                    {relevant.length > 0 ? (
                        <p className="m-0 text-[12px] font-medium text-warning">
                            {pluginMissing
                                ? `Missing VapourSynth ${namespaces.size === 1 ? "plugin" : "plugins"}: ${namespaceList}`
                                : `VapourSynth plugin references need attention: ${namespaceList}`}
                        </p>
                    ) : null}
                    <ul className="m-0 mt-1 list-none space-y-1 p-0">
                        {relevant.map((problem) => {
                            const key = `${problem.context}\u0000${problem.namespace}\u0000${problem.function ?? ""}`;
                            return (
                                <li
                                    key={key}
                                    className="min-w-0 text-[11px] leading-relaxed text-warning/90"
                                >
                                    <span className="font-mono text-[10.5px] font-medium text-warning">
                                        {problem.function === undefined
                                            ? problem.namespace
                                            : `${problem.namespace}.${problem.function}`}
                                    </span>
                                    {showContext ? (
                                        <span className="text-ink-secondary">
                                            {" "}
                                            · {problem.context}:{" "}
                                        </span>
                                    ) : (
                                        <span className="text-ink-secondary">{" · "}</span>
                                    )}
                                    {plain(problem.detail)} {plain(problem.remediation)}
                                </li>
                            );
                        })}
                    </ul>
                    {relevantError === undefined ? null : (
                        <p className="m-0 mt-1 text-[11px] leading-relaxed text-warning/90">
                            {plain(relevantError)}
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}
