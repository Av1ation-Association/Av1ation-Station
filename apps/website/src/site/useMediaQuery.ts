import { useEffect, useState } from "react";

/** A media query kept current as the viewport or its capabilities change. */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(
        () => typeof globalThis.matchMedia === "function" && globalThis.matchMedia(query).matches,
    );

    useEffect(() => {
        if (typeof globalThis.matchMedia !== "function") {
            return;
        }
        const media = globalThis.matchMedia(query);
        const update = () => setMatches(media.matches);
        update();
        media.addEventListener("change", update);
        // Some embedded browsers update the viewport without delivering the media event.
        // Re-reading the query on resize keeps the 900px gate deterministic there too.
        globalThis.addEventListener("resize", update);
        return () => {
            media.removeEventListener("change", update);
            globalThis.removeEventListener("resize", update);
        };
    }, [query]);

    return matches;
}
