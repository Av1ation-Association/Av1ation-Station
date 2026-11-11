/**
 * How far an encoded preview may prepare picture ahead of the playhead.
 *
 * A scene chunk is appended to the MediaSource as a whole file, and the append effect runs
 * again as soon as one lands. With the element paused — when a paused read is allowed to
 * finish — that turned into an unbounded chain: every following scene was buffered, and a
 * two-minute lead was not unusual. A minute is enough to cross several normal cuts and
 * bounds what the element retains and what the cache is asked to hold.
 */
export const MAX_PREVIEW_LEAD_SECONDS = 60;

/**
 * Whether `frame` is close enough to the playhead to prepare now.
 *
 * A playhead with no frame rate cannot be measured, and the source probe failing must not
 * disable Encoded, so that case is allowed. Callers choose whether the frame they pass is
 * a scene's first frame (building, which does not buffer) or its last (appending, which
 * does): a chunk is indivisible, and a single scene longer than the cap still has to be
 * available at its own cut.
 */
export function withinPreviewLead(
    nextStart: number,
    playhead: number,
    frameRate: number | null,
): boolean {
    if (frameRate === null || frameRate <= 0) {
        return true;
    }
    return (nextStart - playhead) / frameRate <= MAX_PREVIEW_LEAD_SECONDS;
}

/**
 * Whether the encoded scene `next` may be prepared for a playhead in `played`.
 *
 * Two rules, both learned from watching a paused element chain through a whole video:
 * only one scene beyond the playhead's own may be prepared, and the picture that would
 * become buffered (`through`) must stay inside the lead. A short scene therefore appends
 * as a pre-buffer; a scene longer than the lead is built but not appended until its own
 * cut, where opening it is a cache read.
 */
export function mayPrepareScene({
    next,
    played,
    through,
    playhead,
    frameRate,
}: {
    next: number;
    played: number | null;
    through: number;
    playhead: number;
    frameRate: number | null;
}): boolean {
    if (played !== null && next > played + 1) {
        return false;
    }
    return withinPreviewLead(through, playhead, frameRate);
}
