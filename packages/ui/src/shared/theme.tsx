import { useEffect, useState } from "react";

import { useSettings } from "@av1ation/api";

export type ResolvedTheme = "dark" | "light";

/** Resolves the stored preference against the OS, with dark as the application default. */
export function resolveTheme(preference: string): ResolvedTheme {
    if (preference === "light" || preference === "dark") {
        return preference;
    }
    return globalThis.matchMedia?.("(prefers-color-scheme: light)").matches === true
        ? "light"
        : "dark";
}

/**
 * The resolved theme, kept current while the preference is `system`.
 *
 * CSS follows the root attribute, but a surface that paints itself — Monaco and the toast
 * host — needs the value in JavaScript. Resolving it once at mount would leave a light
 * window with a dark editor after the OS switched, so the OS listener lives here.
 */
export function useResolvedTheme(): ResolvedTheme {
    const { data } = useSettings();
    const preference = data?.theme ?? "dark";
    const [systemLight, setSystemLight] = useState(() => resolveTheme("system") === "light");

    useEffect(() => {
        if (preference !== "system") {
            return;
        }
        const media = globalThis.matchMedia?.("(prefers-color-scheme: light)");
        if (media === undefined) {
            return;
        }
        const listener = () => setSystemLight(media.matches);
        media.addEventListener("change", listener);
        // The preference can switch to `system` after the OS already changed.
        setSystemLight(media.matches);
        return () => media.removeEventListener("change", listener);
    }, [preference]);

    if (preference === "system") {
        return systemLight ? "light" : "dark";
    }
    return resolveTheme(preference);
}

/**
 * Applies row density and the explicit reduced-motion preference. Both live on the root so
 * CSS owns the result and no component repaints for a layout preference.
 */
function applyChrome(rowDensity: string, reduceMotion: boolean): void {
    const root = document.documentElement;
    root.dataset.density = rowDensity === "compact" ? "compact" : "comfortable";
    if (reduceMotion) {
        root.dataset.motion = "reduce";
    } else {
        delete root.dataset.motion;
    }
}

/**
 * Applies the server's theme preference. Settings own the value, so a LAN browser and the
 * desktop window show the same theme, and `system` follows the OS without a reload.
 */
export function ThemeSync() {
    const { data } = useSettings();
    const density = data?.row_density ?? "comfortable";
    const reduceMotion = data?.reduce_motion ?? false;
    const theme = useResolvedTheme();

    useEffect(() => {
        applyChrome(density, reduceMotion);
    }, [density, reduceMotion]);

    useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = theme;
        root.style.colorScheme = theme;
    }, [theme]);

    return null;
}
