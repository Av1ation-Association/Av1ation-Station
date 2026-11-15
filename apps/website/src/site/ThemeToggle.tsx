import { useEffect, useState } from "react";

type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "av1ation-site-theme";
const LABELS: Record<ThemePreference, string> = {
    system: "System",
    light: "Light",
    dark: "Dark",
};

function readPreference(): ThemePreference {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === "light" || stored === "dark") {
            return stored;
        }
    } catch {
        // Storage can be unavailable in private browsing; system remains the default.
    }
    return "system";
}

function resolvedTheme(preference: ThemePreference, systemLight: boolean): "light" | "dark" {
    if (preference === "system") {
        return systemLight ? "light" : "dark";
    }
    return preference;
}

function applyTheme(theme: "light" | "dark"): void {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme === "light" ? "#f4f7fb" : "#0d1118");
}

function ThemeIcon({ preference }: { preference: ThemePreference }) {
    if (preference === "light") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
            </svg>
        );
    }
    if (preference === "dark") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8M12 17v4" />
        </svg>
    );
}

export function ThemeToggle() {
    const [preference, setPreference] = useState<ThemePreference>(readPreference);

    useEffect(() => {
        const media = globalThis.matchMedia?.("(prefers-color-scheme: light)");
        const apply = () => applyTheme(resolvedTheme(preference, media?.matches === true));
        apply();
        if (preference !== "system" || media === undefined) {
            return;
        }
        media.addEventListener("change", apply);
        return () => media.removeEventListener("change", apply);
    }, [preference]);

    const next: ThemePreference =
        preference === "system" ? "light" : preference === "light" ? "dark" : "system";
    const label = `Theme: ${LABELS[preference]}. Switch to ${LABELS[next].toLowerCase()}.`;

    return (
        <button
            className="site-theme"
            type="button"
            aria-label={label}
            title={label}
            onClick={() => {
                setPreference(next);
                try {
                    window.localStorage.setItem(STORAGE_KEY, next);
                } catch {
                    // The current page still switches even when the choice cannot persist.
                }
            }}
        >
            <ThemeIcon preference={preference} />
        </button>
    );
}
