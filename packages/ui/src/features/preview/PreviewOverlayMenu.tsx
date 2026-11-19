import { useCanPreview, useSettings, useUpdateSettings } from "@av1ation/api";
import type { PreviewOverlaySettings } from "@av1ation/contracts";
import { Eye } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "../../shared/Popover";
import { Switch } from "../../shared/Switch";

const FIELDS: readonly {
    key: keyof Omit<PreviewOverlaySettings, "enabled">;
    label: string;
}[] = [
    { key: "target_quality", label: "Target quality" },
    { key: "quality_check", label: "Quality check" },
    { key: "noise", label: "Noise" },
    { key: "chunk", label: "Chunk size" },
    { key: "encoder", label: "Encoder" },
    { key: "live_stage", label: "Live stage" },
    { key: "progress", label: "Progress" },
    { key: "fps_eta", label: "FPS + ETA" },
];

/**
 * The Scenes header's overlay control.
 *
 * The popover is a viewing preference, not a document editor, so each change saves at once
 * and there is no Save button. A host without a media surface keeps the control visible but
 * disabled: hiding it would make the same screen look different for a reason the user cannot
 * discover.
 */
export function PreviewOverlayMenu() {
    const canPreview = useCanPreview();
    const settings = useSettings();
    const update = useUpdateSettings();
    const overlay = settings.data?.preview_overlay;
    const unavailable = "Preview overlay needs the desktop preview surface";

    const save = (next: Partial<PreviewOverlaySettings>) => {
        if (overlay === undefined) {
            return;
        }
        update.mutate({ preview_overlay: { ...overlay, ...next } });
    };

    const button = (
        <button
            type="button"
            aria-label="Preview overlay"
            data-tip={canPreview ? "Preview overlay" : unavailable}
            data-tip-align="end"
            disabled={!canPreview}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 enabled:hover:bg-hover enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${
                overlay?.enabled === true ? "bg-hover text-ink" : "text-ink-muted"
            }`}
        >
            <Eye aria-hidden="true" className="h-4 w-4" strokeWidth={1.9} />
        </button>
    );

    if (!canPreview) {
        return (
            <span data-tip={unavailable} data-tip-align="end">
                {button}
            </span>
        );
    }

    return (
        <Popover>
            <PopoverTrigger asChild>{button}</PopoverTrigger>
            <PopoverContent align="end" className="w-[292px] p-0">
                {overlay === undefined ? (
                    <p
                        role={settings.isError ? "alert" : "status"}
                        className="m-0 px-3.5 py-3 text-[11px] leading-relaxed text-ink-secondary"
                    >
                        {settings.isError
                            ? "The overlay settings could not be loaded. Close this panel and try again."
                            : "Loading overlay settings…"}
                    </p>
                ) : (
                    <>
                        <div className="border-b border-line px-3.5 py-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="m-0 text-[12px] font-medium text-ink">
                                        Preview overlay
                                    </p>
                                    <p className="mt-1 mb-0 text-[10.5px] leading-relaxed text-ink-secondary">
                                        Scene facts at the playhead, plus this video's live run.
                                    </p>
                                </div>
                                <Switch
                                    checked={overlay.enabled}
                                    onChange={(enabled) => save({ enabled })}
                                    label="Show the preview overlay"
                                    disabled={update.isPending}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3.5 py-2.5">
                            {FIELDS.map((field) => (
                                <label
                                    key={field.key}
                                    className={`flex items-center gap-2 text-[11px] ${
                                        overlay.enabled && !update.isPending
                                            ? "text-ink-secondary"
                                            : "text-ink-muted"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={overlay[field.key]}
                                        onChange={(event) =>
                                            save({ [field.key]: event.currentTarget.checked })
                                        }
                                        disabled={!overlay.enabled || update.isPending}
                                        className="h-3.5 w-3.5 shrink-0 accent-brand"
                                    />
                                    <span className="truncate">{field.label}</span>
                                </label>
                            ))}
                        </div>
                        {update.isError ? (
                            <p
                                role="alert"
                                className="m-0 border-t border-line px-3.5 py-2 text-[10.5px] text-danger"
                            >
                                The overlay setting could not be saved.
                            </p>
                        ) : null}
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}
