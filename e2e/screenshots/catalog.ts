import type { Page } from "@playwright/test";

/** The eight curated groups a guide or marketing page can select from. */
export const FEATURE_GROUPS = [
    "Scenes",
    "Quality",
    "Pipeline",
    "Runs and logs",
    "Scripting",
    "Templates",
    "Encoder tuning",
    "App and settings",
] as const;

export type FeatureGroup = (typeof FEATURE_GROUPS)[number];

export type GalleryMode =
    | "populated"
    | "empty"
    | "empty-queue"
    | "empty-scenes"
    | "failing"
    | "running"
    | "failed"
    | "blocked"
    | "missing-dependency"
    | "lan-off"
    | "invalid-scenes"
    | "concat-inventory";

/** One catalog entry, captured once per theme from the same page and data state. */
export interface GalleryCase {
    readonly id: string;
    readonly title: string;
    readonly caption: string;
    readonly alt: string;
    readonly path: string;
    readonly mode?: GalleryMode;
    /** A capture-only host route that has no place in the demo's public navigation. */
    readonly capture?: "pairing";
    readonly ready: string;
    readonly group: FeatureGroup;
    /** A viewport shot for fixed panes and overlays; a document shot for scrolling pages. */
    readonly frame: "document" | "viewport";
    /** Wait for Monaco after the route's own content is ready. */
    readonly editor?: boolean;
    /** Open a tab, dialog, or sheet that the route does not open by itself. */
    readonly prepare?: (page: Page) => Promise<void>;
}

const PROJECT = "/projects/demo-project";
const VIDEO = `${PROJECT}/videos/demo-video`;

const commandPalette = async (page: Page): Promise<void> => {
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Command palette" }).waitFor();
};

const parameterEditor = async (page: Page): Promise<void> => {
    await page.getByRole("button", { name: /x265/u }).first().click();
    const edit = page.getByRole("button", { name: /CRF.*Edit/u }).first();
    await edit.click();
    await page.getByRole("dialog", { name: "Edit parameter" }).waitFor();
};

const sceneEncoder = async (page: Page): Promise<void> => {
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "Change" }).click();
    await page.getByRole("dialog", { name: "Scene encoder" }).waitFor();
};

const addVideos = async (page: Page): Promise<void> => {
    // The demo host opens a browser file chooser before showing the sheet. Supplying files
    // through Playwright keeps the capture deterministic and avoids a native picker.
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add videos" }).first().click();
    await (await chooser).setFiles([
        {
            name: "aurora-iceland.mkv",
            mimeType: "video/x-matroska",
            buffer: Buffer.from("gallery"),
        },
        {
            name: "aurora-highlands.mkv",
            mimeType: "video/x-matroska",
            buffer: Buffer.from("gallery"),
        },
    ]);
    await page.getByRole("dialog", { name: "Add videos" }).waitFor();
};

const logExport = async (page: Page): Promise<void> => {
    await page.getByRole("button", { name: "Export" }).first().click();
    await page.getByRole("dialog", { name: "Export this run" }).waitFor();
};

const newProject = async (page: Page): Promise<void> => {
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").waitFor();
};

const applyTemplate = async (page: Page): Promise<void> => {
    await page.getByRole("button", { name: /Apply Template/u }).click();
    await page.getByPlaceholder("Search templates").waitFor();
};

const selectTwo = async (page: Page): Promise<void> => {
    await page.getByRole("checkbox", { name: "Select Aurora — Coastline" }).click();
    await page
        .getByRole("checkbox", { name: "Select Aurora — Nightfall" })
        .click({ modifiers: ["Shift"] });
    await page.getByText("2 selected").waitFor();
};

const addFilter = async (page: Page): Promise<void> => {
    await page.getByRole("button", { name: "Add filter" }).first().click();
    await page.getByRole("dialog", { name: "Add filter" }).waitFor();
};

const previewSources = async (page: Page): Promise<void> => {
    await page.getByRole("button", { name: /Preview source:/u }).click();
    await page.getByRole("menu", { name: "Preview source" }).waitFor();
};

const sceneActions = async (page: Page): Promise<void> => {
    await page
        .getByRole("group", { name: /^Scene timeline:/u })
        .click({ button: "right", position: { x: 120, y: 24 } });
    await page.getByRole("menu", { name: "Scene actions" }).waitFor();
};

const selectTwoScenes = async (page: Page): Promise<void> => {
    await page.getByRole("option").first().click();
    await page.getByRole("option").nth(1).click({ modifiers: ["Shift"] });
    await page.getByRole("heading", { name: "2 scenes" }).waitFor();
};

const sceneBoundaryIssues = async (page: Page): Promise<void> => {
    await page.getByRole("button", { name: "1 scene boundary issue" }).click();
    await page.getByText("Scene 2 overlaps scene 1").first().waitFor();
};

const keyboardShortcuts = async (page: Page): Promise<void> => {
    await commandPalette(page);
    await page.getByRole("option", { name: "Keyboard Shortcuts" }).click();
    await page.getByRole("dialog", { name: "Keyboard Shortcuts" }).waitFor();
};

const addBuild = async (page: Page): Promise<void> => {
    await page.getByRole("button", { name: "Add build" }).click();
    await page.getByText("Add a build").waitFor();
};

const trackOptions = async (page: Page): Promise<void> => {
    await page.getByRole("button", { name: "Options for English 5.1" }).click();
    await page.getByText("English 5.1 options").waitFor();
};

/**
 * Every surface a guide, documentation page, or marketing page can show.
 *
 * The first seventeen entries cover each registered route family once. The rest are the
 * settings tabs that a route alone does not name, the three configuration screens that
 * carry the visual feature story, the three product empty states, Home's error state, and
 * the five overlays a static route capture would miss. Both themes are captured from this
 * one list.
 */
export const GALLERY_CASES: readonly GalleryCase[] = [
    {
        id: "home",
        title: "Home",
        caption:
            "Recent projects and the entry point to every queue, with the project menu and the command palette one keystroke away.",
        alt: "Home screen showing the Aurora Documentary project card and the recent-work list.",
        path: "/",
        ready: "Aurora Documentary",
        group: "App and settings",
        frame: "document",
    },
    {
        id: "project",
        title: "Project workspace",
        caption:
            "Configuration sections and the queue share one workspace; inherited settings and per-video state stay visibly distinct.",
        alt: "Project workspace with the compact configuration sidebar and three queued Aurora videos.",
        path: PROJECT,
        ready: "Aurora — Opening",
        group: "Pipeline",
        frame: "document",
    },
    {
        id: "project-general",
        title: "Project General",
        caption:
            "The source, output derivation, and shared VapourSynth document every video in this project inherits.",
        alt: "Project General form with a stored VapourSynth script, output mode, and project-level filters.",
        path: `${PROJECT}/config/general`,
        ready: "Applies to every video added to the queue",
        group: "Pipeline",
        frame: "document",
    },
    {
        id: "project-scene-detection",
        title: "Scene detection",
        caption:
            "One generated section form, with the detector and its bounds resolved from the engine schema rather than a hand-written profile.",
        alt: "Scene detection configuration with the AVSceneChange detector and minimum and maximum scene lengths.",
        path: `${PROJECT}/config/scene-detection`,
        ready: "The detector and its bounds",
        group: "Scenes",
        frame: "document",
    },
    {
        id: "video",
        title: "Video pipeline",
        caption:
            "Every sequence in order, its derived state, and the next runnable action; completed work is not a persisted status field.",
        alt: "Video pipeline showing scene detection through concatenation, all completed, and the output available.",
        path: VIDEO,
        ready: "Pipeline",
        group: "Pipeline",
        frame: "document",
    },
    {
        id: "scenes",
        title: "Scenes",
        caption:
            "The virtualized scene rail, proportional timeline, preview, and details panel share one selection.",
        alt: "Scenes screen with a thumbnail rail, a fourteen-scene timeline, a preview, and the selected scene details.",
        path: `${VIDEO}/scenes`,
        ready: "Virtualized · 14 total",
        group: "Scenes",
        frame: "viewport",
    },
    {
        id: "video-general",
        title: "Video General",
        caption:
            "The source, index, and exact output belong to this video alone, never to the shared project document.",
        alt: "Video General form showing the stored VapourSynth script, the queued source path, and the output file.",
        path: `${VIDEO}/config/general`,
        ready: "The source this video decodes",
        group: "Pipeline",
        frame: "document",
    },
    {
        id: "history",
        title: "Run history",
        caption:
            "Every attempt is recorded with its duration, frame count, and outcome, so a slow stage is explainable after the run.",
        alt: "Run history table with scene detection, parallel encoding, concatenation, and the completed quality check from one real encode.",
        path: `${VIDEO}/history`,
        ready: "8a4f146b-a1dc-4cae-a8f7-b89d247daaef",
        group: "Runs and logs",
        frame: "document",
    },
    {
        id: "video-scene-detection",
        title: "Video override",
        caption:
            "A video's section editor starts from the project and writes a whole-part override only when the user changes it.",
        alt: "Video scene detection section showing the inherited project values and the override count.",
        path: `${VIDEO}/config/scene-detection`,
        ready: "A part with no override is read from the project",
        group: "Scenes",
        frame: "document",
    },
    {
        id: "logs",
        title: "Logs",
        caption:
            "The service's event view of a run, filterable and sortable without leaving the video, with export one action away.",
        alt: "Logs screen with the real run's scene detector, encoder, concatenator, and quality-check lines, level filters, and search.",
        path: `${VIDEO}/logs`,
        ready: "17 matching lines",
        group: "Runs and logs",
        frame: "document",
    },
    {
        id: "video-script",
        title: "Video script",
        caption:
            "The per-video VapourSynth program and the values the runner injects into its generated data module.",
        alt: "VapourSynth script editor for one video, with Monaco, the script guide, and the injected-variable table.",
        path: `${VIDEO}/script`,
        ready: "This video",
        group: "Scripting",
        frame: "document",
        editor: true,
    },
    {
        id: "project-script",
        title: "Project script",
        caption:
            "The shared script document, editable with completion generated from the same module the runner writes.",
        alt: "Project-level VapourSynth script editor with the generated completion and injected values.",
        path: `${PROJECT}/config/script`,
        ready: "This project",
        group: "Scripting",
        frame: "document",
        editor: true,
    },
    {
        id: "template-script",
        title: "Template script",
        caption:
            "A project template's default script, inherited by every project that applies the template.",
        alt: "Template VapourSynth script editor showing the default script and its generated data guide.",
        path: "/settings/templates/default/script",
        ready: "New projects",
        group: "Scripting",
        frame: "document",
        editor: true,
    },
    {
        id: "template-section",
        title: "Template section",
        caption:
            "Template defaults are edited with the same generated section grid as a project, so the two cannot drift.",
        alt: "Template scene detection section with the same detector and bounds fields as a project.",
        path: "/settings/templates/default/scene-detection",
        ready: "The detector and its bounds",
        group: "Templates",
        frame: "document",
    },
    {
        id: "template",
        title: "Template overview",
        caption:
            "A saved configuration and General document, with the projects that can inherit it listed beside it.",
        alt: "Project template overview for the Documentary template with its sections and inherited projects.",
        path: "/settings/templates/default",
        ready: "New projects copy this template",
        group: "Templates",
        frame: "document",
    },
    {
        id: "settings-dependencies",
        title: "Dependencies",
        caption:
            "Every capability's provider, with bundled and system sources probed side by side and unavailable rows named honestly.",
        alt: "Dependencies settings tab listing VapourSynth, FFmpeg, encoders, muxers, and their available providers.",
        path: "/settings",
        ready: "Every executable the pipeline can use",
        group: "App and settings",
        frame: "document",
    },
    {
        id: "encoder-json",
        title: "Encoder JSON",
        caption:
            "The generated encoder contract edited as one validated JSON document, so a fork's parameter set is never hand-written.",
        alt: "Encoder JSON editor showing the x265 descriptor set in a Monaco editor with schema validation.",
        path: "/settings/encoders/x265/json",
        ready: "The whole descriptor set as one JSON document",
        group: "Encoder tuning",
        frame: "document",
        editor: true,
    },
    {
        id: "settings-appearance",
        title: "Appearance",
        caption:
            "Theme, row density, and reduced motion are server-held preferences, so every host renders the same appearance.",
        alt: "Appearance settings with dark and light theme previews, row density options, and the reduce-motion switch.",
        path: "/settings#appearance",
        ready: "Theme",
        group: "App and settings",
        frame: "document",
    },
    {
        id: "settings-encoders",
        title: "Encoders",
        caption:
            "The encoder catalogue and its parameter table, with descriptor edits validated before the table accepts them.",
        alt: "Encoders settings tab with the encoder catalogue and the x265 descriptor table.",
        path: "/settings#encoders",
        ready: "Catalogue",
        group: "Encoder tuning",
        frame: "document",
    },
    {
        id: "settings-templates",
        title: "Project templates",
        caption:
            "Saved configurations and General defaults, searchable, with the default template marked explicitly.",
        alt: "Project templates settings tab listing Documentary, Animation, and Archive templates with the default marked.",
        path: "/settings#project-templates",
        ready: "A project template is a saved configuration",
        group: "Templates",
        frame: "document",
    },
    {
        id: "settings-storage",
        title: "Storage",
        caption:
            "Working space, retention, and app-data footprint measured on read, with retained work broken down per project.",
        alt: "Storage settings showing free space, temporary directory, retention switch, and retained work by project.",
        path: "/settings#storage",
        ready: "Working space, retention",
        group: "App and settings",
        frame: "document",
    },
    {
        id: "settings-network",
        title: "Network",
        caption:
            "Opt-in LAN access, per-browser pairing tokens, and a revocable session list that makes the trust boundary visible.",
        alt: "Network settings with LAN access enabled, a pairing code and QR, and two paired browser sessions.",
        path: "/settings#network",
        ready: "LAN access",
        group: "App and settings",
        frame: "document",
    },
    {
        id: "settings-about",
        title: "About",
        caption:
            "The application version, embedded engine revision, API contract, licence, and the two support actions.",
        alt: "About settings with the application version, Andean Condor revision, API version, and support bundle controls.",
        path: "/settings#about",
        ready: "The application, the engine it embeds",
        group: "App and settings",
        frame: "document",
    },
    {
        id: "quality-check",
        title: "Quality check",
        caption:
            "Per-scene CVVDP scores, the aggregate statistic, and the run that produced them read from the same measured scene table.",
        alt: "Quality check configuration with a CVVDP score chart across fourteen scenes and the aggregate statistic.",
        path: `${VIDEO}/config/quality-check`,
        ready: "Scores the concatenated video against the input",
        group: "Quality",
        frame: "document",
    },
    {
        id: "target-quality",
        title: "Target quality",
        caption:
            "The probe metric, target range, quantizer bounds, and interpolation points that choose a quantizer instead of a fixed CRF.",
        alt: "Target quality configuration with the CVVDP target range, maximum probes, quantizer bounds, and interpolation table.",
        path: `${VIDEO}/config/target-quality`,
        ready: "Probes scenes for a quality target instead of a fixed quantizer",
        group: "Quality",
        frame: "document",
    },
    {
        id: "encoding",
        title: "Encoding",
        caption:
            "The encoder variant, its command-line options, and the worker count every scene is encoded with.",
        alt: "Encoding configuration with the SVT-AV1 variant, six grouped parameters with info affordances, and the worker controls.",
        path: `${VIDEO}/config/encoding`,
        ready: "Chooses the encoder and the command-line parameters every scene is encoded with",
        group: "Encoder tuning",
        frame: "document",
    },
    {
        id: "home-empty",
        title: "Home empty",
        caption:
            "The first-run state names the one action and does not fabricate a recent project.",
        alt: "Empty Home screen with the no-projects message and a create-project button.",
        path: "/",
        mode: "empty",
        ready: "No projects yet",
        group: "App and settings",
        frame: "document",
    },
    {
        id: "home-error",
        title: "Home error",
        caption:
            "A failed read states the cause in place, with a retry, and never falls back to an empty list.",
        alt: "Home screen error panel saying the service is unavailable with a retry action.",
        path: "/",
        mode: "failing",
        ready: "The service is unavailable.",
        group: "App and settings",
        frame: "document",
    },
    {
        id: "project-empty-queue",
        title: "Project empty queue",
        caption:
            "A project with no videos: adding the first one does not require a template.",
        alt: "Project workspace with an empty queue and an add-videos call to action.",
        path: PROJECT,
        mode: "empty-queue",
        ready: "Add videos to the queue",
        group: "Pipeline",
        frame: "document",
    },
    {
        id: "scenes-empty",
        title: "Scenes empty",
        caption:
            "Before detection, the empty scene table still offers the detector's own next action.",
        alt: "Scenes screen before detection, with empty rail and timeline and a run-scene-detection action.",
        path: `${VIDEO}/scenes`,
        mode: "empty-scenes",
        ready: "No scenes yet",
        group: "Scenes",
        frame: "viewport",
    },
    {
        id: "command-palette",
        title: "Command palette",
        caption:
            "Navigate every project, settings tab, and action without leaving the keyboard.",
        alt: "Command palette open over Home, with grouped project and navigation results and keyboard hints.",
        path: "/",
        ready: "Aurora Documentary",
        group: "App and settings",
        frame: "viewport",
        prepare: commandPalette,
    },
    {
        id: "parameter-editor",
        title: "Parameter editor",
        caption:
            "Descriptor edits happen in a side sheet, where the generated encoder contract validates the result before the table accepts it.",
        alt: "Edit-parameter sheet open over the encoder table, showing the CRF label, range, and widget.",
        path: "/settings#encoders",
        ready: "Catalogue",
        group: "Encoder tuning",
        frame: "viewport",
        prepare: parameterEditor,
    },
    {
        id: "scene-encoder",
        title: "Scene encoder",
        caption:
            "One encoder document can replace the video's encoder or be written to exactly the selected scenes.",
        alt: "Scene encoder sheet open over the scenes screen, with video and selected-scenes scope choices and parameters.",
        path: `${VIDEO}/scenes`,
        ready: "Virtualized · 14 total",
        group: "Scenes",
        frame: "viewport",
        prepare: sceneEncoder,
    },
    {
        id: "add-videos",
        title: "Add videos",
        caption:
            "Each queued file keeps its own output and label; source files are never copied.",
        alt: "Add videos sheet open over the project, showing batch rows with source paths and derived output names.",
        path: PROJECT,
        ready: "Aurora — Opening",
        group: "Pipeline",
        frame: "viewport",
        prepare: addVideos,
    },
    {
        id: "log-export",
        title: "Log export",
        caption:
            "The exported log redacts paths, filenames, hostnames, and addresses before the preview; the download is exactly that text.",
        alt: "Export-this-run sheet open over Logs, with the redacted preview and copy and download actions.",
        path: `${VIDEO}/logs`,
        ready: "17 matching lines",
        group: "Runs and logs",
        frame: "viewport",
        prepare: logExport,
    },
    {
        id: "home-create",
        title: "New project",
        caption:
            "Creating a project from Home needs only a name; the queue, template, and destination follow in the workspace.",
        alt: "Home screen with the new-project form open and the project name field focused.",
        path: "/",
        ready: "New project",
        group: "App and settings",
        frame: "viewport",
        prepare: newProject,
    },
    {
        id: "project-template-picker",
        title: "Apply a template",
        caption:
            "A project can copy a saved configuration without touching the template it came from.",
        alt: "Apply-template popover open over the project workspace with the searchable template list.",
        path: PROJECT,
        ready: "Apply Template",
        group: "Templates",
        frame: "viewport",
        prepare: applyTemplate,
    },
    {
        id: "project-batch-selection",
        title: "Queue batch selection",
        caption:
            "Shift-click extends the queue selection, and the batch bar runs, retries, or removes every selected video.",
        alt: "Project queue with two videos selected and the batch bar showing run and removal actions.",
        path: PROJECT,
        ready: "Aurora — Coastline",
        group: "Pipeline",
        frame: "viewport",
        prepare: selectTwo,
    },
    {
        id: "project-noise-generation",
        title: "Project noise generation",
        caption:
            "Grain is measured and scaled at the project level, and either sequence can run without the other.",
        alt: "Project noise-generation configuration with the detector, scaler, and inheritance source.",
        path: `${PROJECT}/config/noise-generation`,
        ready: "Measures the source's grain",
        group: "Pipeline",
        frame: "document",
    },
    {
        id: "project-encoding",
        title: "Project encoding",
        caption:
            "The encoder document every queued video inherits: the variant, its parameters, and the worker count.",
        alt: "Project encoding configuration with the SVT-AV1 variant and the shared parameter table.",
        path: `${PROJECT}/config/encoding`,
        ready: "Chooses the encoder and the command-line parameters every scene is encoded with",
        group: "Encoder tuning",
        frame: "document",
    },
    {
        id: "project-target-quality",
        title: "Project target quality",
        caption:
            "The probe metric and target range a video inherits, with the quantizer bounds and interpolation points below.",
        alt: "Project target-quality configuration showing the CVVDP target range and quantizer bounds.",
        path: `${PROJECT}/config/target-quality`,
        ready: "Probes scenes for a quality target",
        group: "Quality",
        frame: "document",
    },
    {
        id: "project-concatenation",
        title: "Project concatenation",
        caption:
            "The muxer and its track policy are project-wide defaults a video can override section by section.",
        alt: "Project concatenation configuration with the mkvmerge muxer and track map.",
        path: `${PROJECT}/config/concatenation`,
        ready: "Joins the encoded chunks",
        group: "Pipeline",
        frame: "document",
    },
    {
        id: "project-quality-check",
        title: "Project quality check",
        caption:
            "A project-level metric and statistic score the concatenated result without changing the encode.",
        alt: "Project quality-check configuration with the metric, statistic, and inherited values.",
        path: `${PROJECT}/config/quality-check`,
        ready: "Scores the concatenated video against the input",
        group: "Quality",
        frame: "document",
    },
    {
        id: "video-noise-generation",
        title: "Video noise generation",
        caption:
            "A video can override grain measurement and scaling while the rest of the project's values stay inherited.",
        alt: "Video noise-generation section showing inherited project values and the override count.",
        path: `${VIDEO}/config/noise-generation`,
        ready: "Measures the source's grain",
        group: "Pipeline",
        frame: "document",
    },
    {
        id: "video-concatenation",
        title: "Video concatenation",
        caption:
            "The track map lists every source stream by the muxer's own key, so inclusion and options never cross namespaces.",
        alt: "Video concatenation section with the mkvmerge track map listing an English audio track and subtitles.",
        path: `${VIDEO}/config/concatenation`,
        mode: "concat-inventory",
        ready: "English 5.1",
        group: "Pipeline",
        frame: "document",
    },
    {
        id: "video-running",
        title: "Video running",
        caption:
            "A live run keeps its current sequence and progress visible while later sequences stay marked as never run.",
        alt: "Video pipeline during a run, with scene detection complete and parallel encoding in progress.",
        path: VIDEO,
        mode: "running",
        ready: "Encoding 7 of 14 scenes",
        group: "Pipeline",
        frame: "document",
    },
    {
        id: "video-failed",
        title: "Video failed",
        caption:
            "A failure is run history, recorded with the engine's message and the run id that its log belongs to.",
        alt: "Video pipeline after a failed encode, with the encoder's message and the failed sequence.",
        path: VIDEO,
        mode: "failed",
        ready: "The encoder exited with code 1 while encoding scene 7.",
        group: "Runs and logs",
        frame: "document",
    },
    {
        id: "video-blocked",
        title: "Video blocked",
        caption:
            "Preflight blockers name the condition that stops a start instead of letting the run fail later.",
        alt: "Video pipeline with an output-directory blocker shown beside the disabled start action.",
        path: VIDEO,
        mode: "blocked",
        ready: "The output directory is not writable.",
        group: "Pipeline",
        frame: "document",
    },
    {
        id: "filter-composer",
        title: "Filter composer",
        caption:
            "Filters are composed against a generated schema, with the source and output size visible while the form is built.",
        alt: "Add-filter sheet open over General, showing the FFMS2 input and filter form.",
        path: `${PROJECT}/config/general`,
        ready: "Add filter",
        group: "Scripting",
        frame: "viewport",
        prepare: addFilter,
    },
    {
        id: "scene-sources",
        title: "Preview sources",
        caption:
            "Original, decoded, and encoded can each drive the preview; the browser demo marks the two proxy sources unavailable.",
        alt: "Preview-source menu open over Scenes with the three source choices and Encoded-from section.",
        path: `${VIDEO}/scenes`,
        ready: "Virtualized · 14 total",
        group: "Scenes",
        frame: "viewport",
        prepare: previewSources,
    },
    {
        id: "scene-context-menu",
        title: "Scene actions",
        caption:
            "Right-clicking the timeline acts on the frame under the pointer, with the gap or scene named first.",
        alt: "Context menu open over the scene timeline with split, merge, and delete actions.",
        path: `${VIDEO}/scenes`,
        ready: "Virtualized · 14 total",
        group: "Scenes",
        frame: "viewport",
        prepare: sceneActions,
    },
    {
        id: "scenes-multiselect",
        title: "Multiple scenes",
        caption:
            "A multi-scene selection keeps the same detail groups, showing ranges and shared engine data instead of inventing one row.",
        alt: "Scenes screen with two scenes selected and the details panel showing 2 scenes.",
        path: `${VIDEO}/scenes`,
        ready: "Virtualized · 14 total",
        group: "Scenes",
        frame: "viewport",
        prepare: selectTwoScenes,
    },
    {
        id: "scenes-invalid",
        title: "Invalid boundaries",
        caption:
            "Overlapping scenes are named with both boundaries and disable starting before an encode touches them.",
        alt: "Scenes screen with an invalid-boundary badge and the overlap message listed.",
        path: `${VIDEO}/scenes`,
        mode: "invalid-scenes",
        ready: "Virtualized · 14 total",
        group: "Scenes",
        frame: "viewport",
        prepare: sceneBoundaryIssues,
    },
    {
        id: "history-failed",
        title: "Failed run history",
        caption:
            "A failed attempt keeps its reason and correlation id in the history table, separate from the pipeline's current phase.",
        alt: "Run history with the failed parallel-encoding attempt and its error message.",
        path: `${VIDEO}/history`,
        mode: "failed",
        ready: "gallery-failed-run",
        group: "Runs and logs",
        frame: "document",
    },
    {
        id: "pairing-screen",
        title: "Pair a browser",
        caption:
            "A browser without a LAN token sees the pairing form before any shell mounts; the code is exchanged for a session token.",
        alt: "Standalone pairing screen with the eight-character code field and the pair action.",
        path: "/pair",
        capture: "pairing",
        ready: "Pair this browser",
        group: "App and settings",
        frame: "viewport",
    },
    {
        id: "settings-dependencies-missing",
        title: "Missing dependency",
        caption:
            "An unavailable dependency names what is missing and what to install, instead of failing during a run.",
        alt: "Dependencies settings with FFmpeg unavailable and its install remediation shown.",
        path: "/settings",
        mode: "missing-dependency",
        ready: "Every executable the pipeline can use",
        group: "App and settings",
        frame: "document",
    },
    {
        id: "settings-network-disabled",
        title: "LAN access off",
        caption:
            "LAN access is opt-in: when off, no pairing code exists and loopback keeps working without a token.",
        alt: "Network settings with LAN access disabled and the pairing section explaining how to turn it on.",
        path: "/settings#network",
        mode: "lan-off",
        ready: "Turn on LAN access to create a pairing code.",
        group: "App and settings",
        frame: "document",
    },
    {
        id: "shortcuts-dialog",
        title: "Keyboard shortcuts",
        caption:
            "Every chord the application handles, grouped by surface and reachable from the command palette.",
        alt: "Keyboard-shortcuts dialog open over Home with grouped key bindings.",
        path: "/",
        ready: "Aurora Documentary",
        group: "App and settings",
        frame: "viewport",
        prepare: keyboardShortcuts,
    },
    {
        id: "encoder-build-form",
        title: "Add an encoder build",
        caption:
            "A saved build is another executable for a known encoder family, validated before the catalogue accepts it.",
        alt: "Add-a-build sheet open over Encoders with the label, base family, and executable path fields.",
        path: "/settings#encoders",
        ready: "Catalogue",
        group: "Encoder tuning",
        frame: "viewport",
        prepare: addBuild,
    },
    {
        id: "concat-track-sheet",
        title: "Track options",
        caption:
            "One source stream's language, name, and flags are edited beside the map, keyed by the muxer's own identifier.",
        alt: "Track-options sheet open over concatenation with the English 5.1 audio track's fields.",
        path: `${VIDEO}/config/concatenation`,
        mode: "concat-inventory",
        ready: "English 5.1",
        group: "Pipeline",
        frame: "viewport",
        prepare: trackOptions,
    },
];
