import { videoThumbnailPath } from "./api/paths";
import type { ThumbnailManifest } from "@av1ation/contracts";

/** The fields a frame-to-thumbnail lookup needs, so a test can state only those. */
type ThumbnailGrid = Pick<ThumbnailManifest, "state" | "interval_ms" | "available">;

/**
 * The cached thumbnail a scene's first frame belongs to, or `null` while there is none.
 *
 * The service extracts one keyframe per five-second bin from frame zero, so this is the
 * same arithmetic on both surfaces: a rail row and a timeline block cannot disagree about
 * which picture belongs to a scene. A build publishes files in index order, so an index at
 * or past `available` is pending rather than a request for a decoder; the caller draws a
 * placeholder and the next manifest poll fills it in. Once the grid is ready the last index
 * is valid for the tail, whose start can round past the final bin.
 */
export function thumbnailIndexForFrame(
    startFrame: number,
    frameRate: number | null,
    grid: ThumbnailGrid,
): number | null {
    if (grid.state === "unavailable" || grid.state === "failed") {
        return null;
    }
    if (
        frameRate === null ||
        !Number.isFinite(frameRate) ||
        frameRate <= 0 ||
        !Number.isFinite(startFrame) ||
        startFrame < 0 ||
        grid.interval_ms <= 0 ||
        grid.available <= 0
    ) {
        return null;
    }
    const index = Math.floor((startFrame * 1_000) / frameRate / grid.interval_ms);
    if (!Number.isFinite(index) || index < 0) {
        return null;
    }
    if (grid.state === "ready") {
        return Math.min(index, grid.available - 1);
    }
    return index < grid.available ? index : null;
}

/**
 * The image URL for one cached thumbnail.
 *
 * `revision` changes when the source, its timestamp, or the grid changes, so an image URL
 * is safe to cache forever and a re-pointed video cannot serve the previous source's frame.
 */
export function thumbnailPath(
    projectId: string,
    videoId: string,
    index: number,
    revision: string,
): string {
    return `${videoThumbnailPath(projectId, videoId, index)}?v=${encodeURIComponent(revision)}`;
}
