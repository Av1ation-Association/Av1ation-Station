import { ClipboardCopy, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { downloadText } from "../../shared/download";
import { Sheet } from "../../shared/Sheet";
import { LogErrorPanel } from "./LogErrorPanel";

export function LogExportSheet({
    open,
    onClose,
    runId,
    data,
    isPending,
    isError,
    error,
    onRetry,
}: {
    open: boolean;
    onClose: () => void;
    runId: string;
    data: { text: string; replacements?: Record<string, string> } | undefined;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    onRetry: () => void;
}) {
    const previewLines = (data?.text ?? "").split("\n").filter(Boolean);
    const truncated = previewLines.length > 200;
    const replaced = Object.entries(data?.replacements ?? {});

    const copyExport = async () => {
        const text = data?.text;
        if (text === undefined) {
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            toast.success("The anonymised log was copied");
        } catch {
            toast.error("The clipboard is unavailable. Download the log instead.");
        }
    };

    return (
        <Sheet
            open={open}
            title="Export this run"
            eyebrow="Anonymised log"
            description="Paths, filenames, hostnames and addresses are replaced with stable placeholders. Review the redactions before saving."
            width="wide"
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => void copyExport()}
                        disabled={data === undefined}
                    >
                        <ClipboardCopy aria-hidden="true" className="h-3.5 w-3.5" />
                        Copy
                    </Button>
                    <Button
                        disabled={data === undefined}
                        onClick={() => {
                            if (data !== undefined) {
                                downloadText(
                                    data.text,
                                    `av1ation-${runId}.jsonl`,
                                    "application/x-ndjson",
                                );
                            }
                        }}
                    >
                        <Download aria-hidden="true" className="h-3.5 w-3.5" />
                        Download .jsonl
                    </Button>
                </>
            }
        >
            {isPending ? (
                <div className="flex items-center gap-2 text-[12px] text-ink-secondary">
                    <RefreshCw
                        aria-hidden="true"
                        className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                    />
                    Building the anonymised export…
                </div>
            ) : isError ? (
                <LogErrorPanel
                    message={
                        error instanceof Error ? error.message : "The export could not be built."
                    }
                    onRetry={onRetry}
                />
            ) : data === undefined ? null : (
                <>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-secondary">
                        <span>
                            {previewLines.length.toLocaleString()}{" "}
                            {previewLines.length === 1 ? "line" : "lines"}
                        </span>
                        <span>
                            {replaced.length === 0
                                ? "No values needed redacting"
                                : `${String(replaced.length)} ${
                                      replaced.length === 1 ? "value" : "values"
                                  } redacted`}
                        </span>
                        {truncated ? (
                            <span className="text-ink-muted">Previewing the first 200 lines</span>
                        ) : null}
                    </div>
                    {replaced.length === 0 ? null : (
                        <details className="mt-3 rounded-md border border-line bg-sunken px-3 py-2">
                            <summary className="cursor-pointer text-[11.5px] text-ink-secondary">
                                Review redactions
                            </summary>
                            <ul className="mt-2 mb-0 list-none space-y-1 p-0 font-mono text-[10.5px] text-ink-muted">
                                {replaced.map(([placeholder, original]) => (
                                    <li key={placeholder} className="min-w-0 break-all">
                                        <span className="text-ink-secondary">{placeholder}</span> →{" "}
                                        {original}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                    <pre className="mt-3 max-h-[52dvh] overflow-auto rounded-md border border-line bg-app px-3 py-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap break-all text-ink-secondary">
                        {previewLines.slice(0, 200).join("\n")}
                    </pre>
                </>
            )}
        </Sheet>
    );
}
