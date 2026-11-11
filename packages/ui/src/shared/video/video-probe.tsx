import { createContext } from "react";

/** The video whose decode graphs a section page can open. */
export interface VideoProbeScope {
    projectId: string;
    videoId: string;
    /**
     * The source General decodes, used to seed a sequence override. Empty when General is a
     * script: the script names no file of its own, so an override starts from an empty path.
     */
    sourcePath: string;
}

/**
 * The video a section editor belongs to.
 *
 * A project document has no video, so its input override cannot show clip details: the
 * source is supplied by whichever video the run opens. The provider is therefore mounted by
 * the video section page only, and its absence is the project case rather than a second
 * prop threaded through every editor.
 */
export const VideoProbeContext = createContext<VideoProbeScope | null>(null);
