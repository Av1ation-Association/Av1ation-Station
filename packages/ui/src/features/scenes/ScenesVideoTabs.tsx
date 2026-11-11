import type { ReactNode } from "react";

import { PanelBottom, PanelLeft } from "lucide-react";

import type { SceneIssue } from "../../shared/model/scene-layout";
import { VideoTabs } from "../videos/VideoTabs";
import { SceneValidationMenu } from "./SceneValidationMenu";

export function ScenesVideoTabs({
    projectId,
    videoId,
    note,
    compact,
    detailsBelow,
    onToggleDetails,
    issues,
    onOpenIssue,
}: {
    projectId: string;
    videoId: string;
    note: ReactNode;
    compact: boolean;
    detailsBelow: boolean;
    onToggleDetails: () => void;
    issues: readonly SceneIssue[];
    onOpenIssue: (index: number) => void;
}) {
    return (
        <VideoTabs
            projectId={projectId}
            videoId={videoId}
            active="scenes"
            note={note}
            trailing={
                <div className="flex items-center gap-1">
                    {compact ? null : (
                        <button
                            type="button"
                            aria-pressed={detailsBelow}
                            aria-label={
                                detailsBelow
                                    ? "Move scene details beside the video"
                                    : "Move scene details below the timeline"
                            }
                            data-tip={
                                detailsBelow
                                    ? "Details beside the video"
                                    : "Details below the timeline"
                            }
                            data-tip-align="end"
                            onClick={onToggleDetails}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 hover:bg-hover hover:text-ink ${
                                detailsBelow ? "bg-hover text-ink" : "text-ink-muted"
                            }`}
                        >
                            {detailsBelow ? (
                                <PanelLeft
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                    strokeWidth={1.9}
                                />
                            ) : (
                                <PanelBottom
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                    strokeWidth={1.9}
                                />
                            )}
                        </button>
                    )}
                    <SceneValidationMenu issues={issues} onSelect={onOpenIssue} />
                </div>
            }
        />
    );
}
