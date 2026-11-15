/**
 * The capture IDs the manual may reference.
 *
 * This is the website's copy of the gallery inventory. The docs check compares it with
 * `e2e/screenshots/catalog.ts`; a page may only point at one of these IDs, and the build
 * guard requires both theme variants on disk.
 */
export const DOCS_CAPTURES = [
    "home",
    "project",
    "project-general",
    "project-scene-detection",
    "video",
    "scenes",
    "video-general",
    "history",
    "video-scene-detection",
    "logs",
    "video-script",
    "project-script",
    "template-script",
    "template-section",
    "template",
    "settings-dependencies",
    "encoder-json",
    "settings-appearance",
    "settings-encoders",
    "settings-templates",
    "settings-storage",
    "settings-network",
    "settings-about",
    "quality-check",
    "target-quality",
    "encoding",
    "home-empty",
    "home-error",
    "project-empty-queue",
    "scenes-empty",
    "command-palette",
    "parameter-editor",
    "scene-encoder",
    "add-videos",
    "log-export",
    "home-create",
    "project-template-picker",
    "project-batch-selection",
    "project-noise-generation",
    "project-encoding",
    "project-target-quality",
    "project-concatenation",
    "project-quality-check",
    "video-noise-generation",
    "video-concatenation",
    "video-running",
    "video-failed",
    "video-blocked",
    "filter-composer",
    "scene-sources",
    "scene-context-menu",
    "scenes-multiselect",
    "scenes-invalid",
    "history-failed",
    "pairing-screen",
    "settings-dependencies-missing",
    "settings-network-disabled",
    "shortcuts-dialog",
    "encoder-build-form",
    "concat-track-sheet",
] as const;

export type DocsCapture = (typeof DOCS_CAPTURES)[number];

const CAPTURE_IDS: ReadonlySet<string> = new Set(DOCS_CAPTURES);

export function isDocsCapture(value: string): value is DocsCapture {
    return CAPTURE_IDS.has(value);
}
