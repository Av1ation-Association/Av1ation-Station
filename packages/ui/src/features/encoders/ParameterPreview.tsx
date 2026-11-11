import { ExternalLink, Info } from "lucide-react";

import type { ParameterDraft } from "./useParameterDraft";

/** The live descriptor preview, including the documentation panel and numeric range. */
export function ParameterPreview({ draft }: { draft: ParameterDraft }) {
    return (
        <div className="rounded-lg border border-line bg-raised px-3.5 py-3">
            <p className="m-0 font-mono text-[9px] tracking-[0.14em] text-ink-muted uppercase">
                Preview
            </p>
            <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate text-[12px] font-medium text-ink">
                        {draft.label.trim() === "" ? "Label" : draft.label}
                    </span>
                    <button
                        ref={draft.infoButton}
                        type="button"
                        aria-label="Parameter info"
                        aria-expanded={draft.infoOpen}
                        onClick={() => draft.setInfoOpen((previous) => !previous)}
                        className="shrink-0 rounded p-0.5 text-ink-secondary transition-colors duration-150 hover:bg-hover hover:text-ink"
                    >
                        <Info aria-hidden="true" className="h-4 w-4" />
                    </button>
                </span>
                <span className="shrink-0 font-mono text-[11.5px] text-ink-secondary">
                    {draft.preview}
                </span>
            </div>
            {draft.infoOpen ? (
                <div className="mt-2 rounded-md border border-line-strong bg-app px-3 py-2.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="rounded border border-line-subtle bg-sunken px-1.5 py-0.5 font-mono text-[10.5px] text-ink-secondary">
                            {draft.canonical === "" ? "--key" : draft.canonical}
                        </span>
                        <span className="font-mono text-[9px] tracking-[0.12em] text-ink-muted uppercase">
                            CLI key
                        </span>
                    </div>
                    <p className="mt-2 mb-0 text-[11px] leading-relaxed text-ink-secondary">
                        {draft.description.trim() === ""
                            ? "No description yet. The row still carries its key and documentation link."
                            : draft.description}
                    </p>
                    <div className="mt-2 border-t border-line-subtle pt-1.5">
                        {draft.docLink.trim() === "" ? (
                            <span className="text-[10.5px] text-ink-muted">
                                No documentation link yet.
                            </span>
                        ) : (
                            <a
                                href={draft.docLink.trim()}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10.5px] text-link hover:underline"
                            >
                                Documentation
                                <ExternalLink aria-hidden="true" className="h-3 w-3" />
                            </a>
                        )}
                    </div>
                </div>
            ) : null}
            {(draft.kind === "Number" || draft.kind === "Decimal") &&
            (draft.min.trim() !== "" || draft.max.trim() !== "") ? (
                <div className="mt-2">
                    <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-sunken">
                        <div className="h-full w-1/3 rounded-full bg-brand" />
                    </div>
                    <div className="mt-1 flex justify-between font-mono text-[9px] text-ink-muted">
                        <span>{draft.min.trim() === "" ? "—" : draft.min}</span>
                        <span>{draft.max.trim() === "" ? "—" : draft.max}</span>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
