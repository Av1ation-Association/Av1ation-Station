import { type CSSProperties } from "react";

import { useSettings, useUpdateSettings } from "@av1ation/api";
import type { AppSettingsUpdate } from "@av1ation/contracts";

import { Button } from "../../shared/Button";
import { resolveTheme } from "../../shared/theme";

const THEME_OPTIONS = [
    { id: "system", label: "System", detail: "Follows the OS." },
    { id: "dark", label: "Dark", detail: "The application default." },
    { id: "light", label: "Light", detail: "For a bright room." },
] as const;

const DENSITY_OPTIONS = [
    {
        id: "comfortable",
        label: "Comfortable",
        detail: "64 px rows, with room for two lines of metadata.",
    },
    { id: "compact", label: "Compact", detail: "48 px rows, for a queue that fills the window." },
] as const;

/**
 * The token values a miniature needs, so a card can show a theme it is not painted in.
 *
 * The previews are the one place in the application where two themes exist at once; the
 * document root owns the live set, so a preview sets its own on the frame it draws.
 */
const PREVIEW_THEME_VARS: Record<"dark" | "light", Record<string, string>> = {
    dark: {
        "--bg-base": "#0d1118",
        "--bg-surface": "#12161e",
        "--bg-raised": "#1a202b",
        "--border-default": "#232b38",
        "--border-strong": "#2e3846",
        "--text-primary": "#e8edf5",
        "--brand-default": "#38bdf8",
    },
    light: {
        "--bg-base": "#f4f7fb",
        "--bg-surface": "#ffffff",
        "--bg-raised": "#ffffff",
        "--border-default": "#c7d0de",
        "--border-strong": "#77869c",
        "--text-primary": "#12161e",
        "--brand-default": "#0284c7",
    },
};

/** A miniature of the window, painted in the theme the card offers. */
function ThemePreview({ theme }: { theme: "dark" | "light" }) {
    return (
        <div
            aria-hidden="true"
            style={PREVIEW_THEME_VARS[theme] as CSSProperties}
            className="h-[92px] overflow-hidden rounded-md border border-line bg-app"
        >
            <div className="flex h-4 items-center gap-1.5 border-b border-line bg-surface px-1.5">
                <span className="h-1.5 w-1.5 rounded-[1px] bg-ink" />
                <span className="h-1 w-7 rounded-full bg-line-strong" />
                <span className="ml-auto h-1 w-2 rounded-full bg-line-strong" />
                <span className="h-1 w-2 rounded-full bg-line-strong" />
            </div>
            <div className="flex h-[76px]">
                <div className="w-5 border-r border-line bg-surface p-1">
                    <span className="block h-1 rounded-full bg-line-strong" />
                    <span className="mt-1 block h-1 rounded-full bg-line" />
                    <span className="mt-1 block h-1 rounded-full bg-line" />
                </div>
                <div className="min-w-0 flex-1 p-1.5">
                    <span className="block h-1.5 w-12 rounded-sm bg-ink" />
                    <span className="mt-1 block h-1 w-20 rounded-sm bg-line-strong" />
                    <div className="mt-1.5 rounded-sm border border-line bg-surface p-1">
                        <span className="block h-3 rounded-[2px] bg-raised" />
                    </div>
                    <span className="mt-1.5 block h-2.5 w-9 rounded-sm bg-brand" />
                </div>
            </div>
        </div>
    );
}

/** Three queue rows at the height the density chooses. */
function DensityPreview({ density }: { density: "compact" | "comfortable" }) {
    const bar = density === "compact" ? "h-2" : "h-3";
    return (
        <div
            aria-hidden="true"
            className="flex w-14 shrink-0 flex-col justify-center gap-1 rounded-md border border-line bg-sunken p-1.5"
        >
            {[0, 1, 2].map((row) => (
                <span key={row} className="flex items-center gap-1">
                    <span className="h-1 w-1 shrink-0 rounded-[1px] bg-line-strong" />
                    <span className={`${bar} min-w-0 flex-1 rounded-[2px] bg-raised`} />
                </span>
            ))}
        </div>
    );
}

/** Theme is server-held, so every host renders the same appearance. */
export function AppearancePanel() {
    const { data, error, isPending, isError, refetch } = useSettings();
    const update = useUpdateSettings();

    const write = (changes: Partial<AppSettingsUpdate>) => {
        update.mutate(changes);
    };

    return (
        <section className="@container mt-8" aria-labelledby="appearance-theme">
            {isPending ? (
                <div className="mt-6 space-y-2" aria-busy="true">
                    {[0, 1, 2].map((row) => (
                        <div
                            key={row}
                            className="h-16 animate-pulse rounded-lg border border-line bg-surface"
                        />
                    ))}
                </div>
            ) : null}

            {isError ? (
                <div
                    className="mt-6 rounded-lg border border-danger/30 bg-surface px-5 py-5"
                    role="alert"
                >
                    <p className="m-0 text-sm font-medium text-ink">
                        The theme could not be loaded
                    </p>
                    <p className="mt-1 mb-4 text-[12px] leading-relaxed text-ink-secondary">
                        {error instanceof Error
                            ? error.message
                            : "The local service did not respond."}
                    </p>
                    <Button variant="secondary" onClick={() => void refetch()}>
                        Retry connection
                    </Button>
                </div>
            ) : null}

            <div className="mt-6 grid items-start gap-6 @5xl:grid-cols-2 @7xl:grid-cols-3">
                {data ? (
                    <div>
                        <h2 id="appearance-theme" className="m-0 text-sm font-semibold text-ink">
                            Theme
                        </h2>
                        <div
                            role="radiogroup"
                            aria-label="Theme"
                            className="mt-3 grid gap-3 sm:grid-cols-3"
                        >
                            {THEME_OPTIONS.map((option) => {
                                const selected = data.theme === option.id;
                                const shown =
                                    option.id === "system" ? resolveTheme("system") : option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        disabled={update.isPending}
                                        onClick={() => write({ theme: option.id })}
                                        className={`min-w-0 rounded-lg border p-2 text-left transition-colors duration-150 disabled:opacity-40 ${
                                            selected
                                                ? "border-brand bg-raised"
                                                : "border-line bg-surface hover:border-line-strong"
                                        }`}
                                    >
                                        <ThemePreview theme={shown} />
                                        <span className="mt-2 flex items-start justify-between gap-2 px-1 pb-0.5">
                                            <span className="min-w-0">
                                                <span className="block text-[12.5px] font-medium text-ink">
                                                    {option.label}
                                                </span>
                                                <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-muted">
                                                    {option.detail}
                                                </span>
                                            </span>
                                            <span
                                                aria-hidden="true"
                                                className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                                                    selected
                                                        ? "bg-brand"
                                                        : "border border-line-strong"
                                                }`}
                                            />
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                {data ? (
                    <div>
                        <h2 className="m-0 text-sm font-semibold text-ink">Row density</h2>
                        <p className="mt-0.5 mb-3 text-[12px] leading-relaxed text-ink-muted">
                            Applies to the video queue in every project.
                        </p>
                        <div
                            role="radiogroup"
                            aria-label="Row density"
                            className="mt-3 grid gap-3 sm:grid-cols-2"
                        >
                            {DENSITY_OPTIONS.map((option) => {
                                const selected = data.row_density === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        disabled={update.isPending}
                                        onClick={() => write({ row_density: option.id })}
                                        className={`flex min-w-0 items-center gap-3 rounded-lg border p-2.5 text-left transition-colors duration-150 disabled:opacity-40 ${
                                            selected
                                                ? "border-brand bg-raised"
                                                : "border-line bg-surface hover:border-line-strong"
                                        }`}
                                    >
                                        <DensityPreview density={option.id} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[12.5px] font-medium text-ink">
                                                {option.label}
                                            </span>
                                            <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-muted">
                                                {option.detail}
                                            </span>
                                        </span>
                                        <span
                                            aria-hidden="true"
                                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                                selected ? "bg-brand" : "border border-line-strong"
                                            }`}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                {data ? (
                    <div className="rounded-lg border border-line bg-surface px-5 py-4">
                        <div className="flex items-start gap-3">
                            <input
                                id="reduce-motion"
                                type="checkbox"
                                checked={data.reduce_motion}
                                disabled={update.isPending}
                                onChange={(event) => write({ reduce_motion: event.target.checked })}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-default)]"
                            />
                            <label htmlFor="reduce-motion" className="min-w-0">
                                <span className="block text-[12px] font-medium text-ink">
                                    Reduce motion
                                </span>
                                <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-muted">
                                    Animation is already suppressed when the operating system asks
                                    for less movement. This adds it everywhere, and never removes an
                                    OS preference.
                                </span>
                            </label>
                        </div>
                    </div>
                ) : null}
            </div>

            {update.isError ? (
                <p role="alert" className="mt-4 mb-0 text-[12px] leading-relaxed text-danger">
                    {update.error instanceof Error
                        ? `Appearance could not be saved: ${update.error.message}`
                        : "Appearance could not be saved. Try again."}
                </p>
            ) : null}
        </section>
    );
}
