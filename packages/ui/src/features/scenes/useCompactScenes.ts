import { useEffect, useState } from "react";

/**
 * Below `md` there is no height for a details column beside a video and a timeline: the
 * player would be squeezed out of the row. That width gets one scrolling column instead,
 * with the player at a fixed share of the viewport and the details under the timeline.
 */
const COMPACT_QUERY = "(max-width: 767px)";

export function useCompactScenes(): boolean {
    const [compact, setCompact] = useState(
        () =>
            typeof globalThis.matchMedia === "function" &&
            globalThis.matchMedia(COMPACT_QUERY).matches,
    );
    useEffect(() => {
        if (typeof globalThis.matchMedia !== "function") {
            return;
        }
        const media = globalThis.matchMedia(COMPACT_QUERY);
        const update = () => {
            setCompact(media.matches);
        };
        update();
        media.addEventListener("change", update);
        return () => {
            media.removeEventListener("change", update);
        };
    }, []);
    return compact;
}
