import { useEffect, useState, type RefObject } from "react";

function intersectsViewport(node: HTMLElement): boolean {
    const rect = node.getBoundingClientRect();
    return (
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth
    );
}

/**
 * Whether an embedded surface should run: it must be on screen and its tab visible.
 *
 * Starts active so a browser without `IntersectionObserver` never silently freezes the demo;
 * the observer's first entry corrects it as soon as the frame is measured.
 */
export function useEmbeddedDemoActive(ref: RefObject<HTMLElement | null>): boolean {
    const [inView, setInView] = useState(true);
    const [tabVisible, setTabVisible] = useState(
        () => typeof document === "undefined" || !document.hidden,
    );

    useEffect(() => {
        const node = ref.current;
        if (node === null || typeof IntersectionObserver === "undefined") {
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry !== undefined) {
                setInView(entry.isIntersecting);
            }
        });
        observer.observe(node);
        return () => {
            observer.disconnect();
        };
    }, [ref]);

    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }
        const update = () => {
            setTabVisible(!document.hidden);
            const node = ref.current;
            // IntersectionObserver can stay silent while the tab is hidden. Re-check the frame
            // when the tab becomes visible so returning to it resumes even after scrolling.
            if (!document.hidden && node !== null) {
                setInView(intersectsViewport(node));
            }
        };
        update();
        document.addEventListener("visibilitychange", update);
        return () => {
            document.removeEventListener("visibilitychange", update);
        };
    }, [ref]);

    return inView && tabVisible;
}
