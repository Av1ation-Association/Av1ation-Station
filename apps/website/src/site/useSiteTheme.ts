import { useEffect, useState } from "react";

type SiteTheme = "dark" | "light";

function readTheme(): SiteTheme {
    if (typeof document === "undefined") {
        return "dark";
    }
    const selected = document.documentElement.dataset.theme;
    if (selected === "dark" || selected === "light") {
        return selected;
    }
    return globalThis.matchMedia?.("(prefers-color-scheme: light)").matches === true
        ? "light"
        : "dark";
}

/** The theme the site has applied to the root, so captures can follow an explicit choice. */
export function useSiteTheme(): SiteTheme {
    const [theme, setTheme] = useState<SiteTheme>(readTheme);

    useEffect(() => {
        const root = document.documentElement;
        const update = () => setTheme(readTheme());
        update();
        const observer = new MutationObserver(update);
        observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    return theme;
}
