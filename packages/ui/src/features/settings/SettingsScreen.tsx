import { useHealth } from "@av1ation/api";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { Button } from "../../shared/Button";
import { useDraftDirty } from "../../shared/UnsavedChanges";
import { EncodersPanel } from "../encoders/EncodersPanel";
import { ProjectTemplatesManager } from "../projects/ProjectTemplatesManager";
import { AboutPanel } from "./AboutPanel";
import { AppearancePanel } from "./AppearancePanel";
import { DependencyInventory, Diagnostics, LoadingSettings } from "./DependencyInventory";
import { NetworkPanel, StoragePanel } from "./settings-panels";
import {
    SETTINGS_TAB_SLUGS,
    SETTINGS_TABS,
    type SettingsTab,
    settingsTabFromHash,
} from "./settings-tabs";

/**
 * Every Settings tab has a panel, and the hash names the one on screen.
 *
 * The tab is read from the route rather than held beside it: a strip click, a link from
 * another screen, and a palette jump then all mean the same thing, and a panel's unsaved
 * draft is guarded by the router's own blocker instead of a second path.
 */
export function SettingsScreen() {
    const { data, error, isPending, isError, isFetching, refetch } = useHealth();
    const navigate = useNavigate();
    const hash = useRouterState({ select: (state) => state.location.hash });
    const tab = settingsTabFromHash(hash);
    const draftDirty = useDraftDirty();

    const selectTab = (value: SettingsTab) => {
        if (value === tab) {
            return;
        }
        void navigate({ to: "/settings", hash: SETTINGS_TAB_SLUGS[value], replace: true });
    };

    return (
        <main id="main" className="page pt-0 pb-8">
            {/* The tab strip names the destination; the page itself needs a title so every
                panel's level-two heading has a level-one parent. */}
            <h1 className="sr-only">Settings</h1>
            <div className="border-b border-line">
                <div
                    role="tablist"
                    aria-label="Settings sections"
                    className="flex flex-wrap gap-x-1 gap-y-0"
                >
                    {SETTINGS_TABS.map((value) => {
                        const active = tab === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                aria-current={active ? "page" : undefined}
                                onClick={() => selectTab(value)}
                                className={`-mb-px h-11 shrink-0 border-b-2 px-3 text-[12.5px] whitespace-nowrap transition-colors duration-150 ${
                                    active
                                        ? "border-brand font-semibold text-ink"
                                        : "border-transparent text-ink-muted hover:text-ink"
                                }`}
                            >
                                {value}
                                {(value === "Encoders" || value === "Dependencies") &&
                                draftDirty ? (
                                    <span
                                        data-tip="Changes unsaved"
                                        className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warning align-middle"
                                    />
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </div>

            {tab === "Appearance" ? <AppearancePanel /> : null}

            {tab === "Encoders" ? <EncodersPanel /> : null}

            {tab === "Project Templates" ? <ProjectTemplatesManager /> : null}

            {tab === "Storage" ? <StoragePanel /> : null}

            {tab === "Network" ? <NetworkPanel /> : null}

            {tab === "About" ? <AboutPanel /> : null}

            {tab === "Dependencies" ? (
                <>
                    <header className="mt-6">
                        <p className="m-0 max-w-[72ch] text-[13px] leading-relaxed text-ink-secondary">
                            Every executable the pipeline can use, grouped by the capability it
                            provides.
                        </p>
                    </header>

                    <div className="mt-6">
                        {isPending ? <LoadingSettings /> : null}
                        {isError ? (
                            <div
                                className="rounded-lg border border-danger/30 bg-surface px-5 py-5"
                                role="alert"
                            >
                                <p className="m-0 text-sm font-medium text-ink">
                                    The dependency inventory could not be loaded
                                </p>
                                <p className="mt-1 mb-4 text-[12px] leading-relaxed text-ink-secondary">
                                    {error instanceof Error
                                        ? error.message
                                        : "The local service did not respond."}
                                </p>
                                <Button
                                    variant="secondary"
                                    onClick={() => void refetch()}
                                    disabled={isFetching}
                                >
                                    {isFetching ? "Retrying…" : "Retry connection"}
                                </Button>
                            </div>
                        ) : null}
                        {data ? (
                            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] 3xl:grid-cols-[minmax(0,1fr)_360px]">
                                <DependencyInventory report={data.preflight} />
                                <aside className="min-w-0 self-start xl:sticky xl:top-4">
                                    <Diagnostics report={data.preflight} />
                                </aside>
                            </div>
                        ) : null}
                    </div>
                </>
            ) : null}
        </main>
    );
}
