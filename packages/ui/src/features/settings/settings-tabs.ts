/**
 * The Settings tab list, its URL spelling, and the tab a hash names.
 *
 * The strip, the palette, and a link from another screen all name the same eight tabs. One
 * list keeps them from drifting apart: adding a tab is one entry here plus its panel.
 */
export const SETTINGS_TABS = [
    "Appearance",
    "Notifications",
    "Dependencies",
    "Encoders",
    "Project Templates",
    "Storage",
    "Network",
    "About",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const SETTINGS_TAB_SLUGS: Record<SettingsTab, string> = {
    Appearance: "appearance",
    Notifications: "notifications",
    Dependencies: "dependencies",
    Encoders: "encoders",
    "Project Templates": "project-templates",
    Storage: "storage",
    Network: "network",
    About: "about",
};

const BY_SLUG = new Map<string, SettingsTab>(
    SETTINGS_TABS.map((tab) => [SETTINGS_TAB_SLUGS[tab], tab]),
);

/**
 * The tab a hash names.
 *
 * A panel may append its own section after the tab (`#project-defaults/scene-detection`),
 * so only the first segment names the tab, and an unknown or empty hash falls back to the
 * inventory every build can show.
 */
export function settingsTabFromHash(hash: string): SettingsTab {
    const slug = hash.replace(/^#/u, "").split("/")[0] ?? "";
    // The tab was called `Project Template` before it held more than one; a saved link
    // from that build still names the tab it means.
    return (
        BY_SLUG.get(slug) ?? (slug === "project-defaults" ? "Project Templates" : "Dependencies")
    );
}
