import { useActiveRun, useProject, useVideo } from "@av1ation/api";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { eta } from "../shared/duration";
import { stageLabel } from "../shared/model/video-status";

/** One running sequence, kept in the bar so another screen cannot hide it. */
function LiveRunChip({ run }: { run: NonNullable<ReturnType<typeof useActiveRun>> }) {
    const project = useProject(run.projectId);
    const video = useVideo(run.projectId, run.videoId);
    const projectName = project.data?.name ?? "Project";
    const videoName = video.data?.name ?? "Video";
    const stage = stageLabel(run.live.sequence);
    const progress = run.live.progress;
    const progressText = progress === null ? "Starting" : `${String(Math.round(progress))}%`;
    const etaText = eta(run.live.etaSeconds);
    const details = [
        projectName,
        videoName,
        stage,
        progressText,
        etaText === null ? null : `ETA ${etaText}`,
    ]
        .filter((part): part is string => part !== null)
        .join(" · ");
    const percent = progress === null ? null : Math.max(0, Math.min(100, progress));

    return (
        <Link
            to="/projects/$projectId/videos/$videoId"
            params={{ projectId: run.projectId, videoId: run.videoId }}
            aria-label={`Encoding ${videoName} ${progressText} in ${projectName}: ${stage}. ${details}. Open the video for controls.`}
            className="relative flex h-8 min-w-0 max-w-[9rem] shrink items-center gap-1.5 rounded-full border border-brand/25 bg-brand-soft/45 px-2 text-[10.5px] text-ink-secondary transition-colors duration-150 hover:border-brand/45 hover:bg-brand-soft/70 hover:text-ink sm:max-w-[14rem] lg:max-w-[18rem]"
        >
            <span aria-hidden="true" className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand/60 motion-reduce:hidden" />
                <span className="relative h-2 w-2 rounded-full bg-brand" />
            </span>
            <span className="hidden shrink-0 font-medium text-brand-text lg:inline">Encoding</span>{" "}
            <span className="min-w-0 truncate font-medium text-ink">{videoName}</span>{" "}
            <span className="shrink-0 font-mono text-[9.5px] text-ink-secondary tabular-nums">
                {progressText}
            </span>
            <ChevronRight
                aria-hidden="true"
                className="h-3 w-3 shrink-0 text-ink-muted"
                strokeWidth={1.8}
            />
            {percent === null ? null : (
                <span
                    aria-hidden="true"
                    className="absolute inset-x-2 bottom-0 h-px overflow-hidden rounded-full"
                >
                    <span
                        className="block h-full w-full origin-left bg-brand/80"
                        style={{ transform: `scaleX(${String(percent / 100)})` }}
                    />
                </span>
            )}
        </Link>
    );
}

/**
 * The process-wide run chip.
 *
 * It lives in the top bar rather than below it, because navigation is allowed while an
 * encode runs. The chip is a status and navigation control; Stop stays on the video's own
 * surfaces, where it cannot duplicate a control already on the page.
 */
export function RunChip() {
    const run = useActiveRun();
    return run === null ? null : <LiveRunChip run={run} />;
}
