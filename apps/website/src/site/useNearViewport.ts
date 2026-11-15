import { useCallback, useEffect, useState } from "react";

/** True once the observed element is within `rootMargin` of the viewport. */
export function useNearViewport<T extends HTMLElement>(rootMargin = "600px 0px") {
    const [node, setNode] = useState<T | null>(null);
    const [near, setNear] = useState(false);
    const ref = useCallback((next: T | null) => setNode(next), []);

    useEffect(() => {
        if (node === null) {
            return;
        }
        if (typeof IntersectionObserver === "undefined") {
            setNear(true);
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setNear(true);
                    observer.disconnect();
                }
            },
            { rootMargin },
        );
        observer.observe(node);
        return () => {
            observer.disconnect();
        };
    }, [node, rootMargin]);

    return { ref, near };
}
