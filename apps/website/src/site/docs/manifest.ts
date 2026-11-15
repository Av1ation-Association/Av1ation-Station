/**
 * The typed implementation index of the public manual.
 *
 * One entry is one `/docs/...` URL and exactly one MDX body. The page contract in
 * `docs/website-docs.md` is the source; this file is what routing, navigation, search,
 * and tests read so none of them can drift into a second page list.
 */
export type DocsGroupId =
    | "get-started"
    | "concepts"
    | "guides"
    | "reference"
    | "troubleshooting"
    | "contributing";

export type DocsPageKind = "overview" | "task" | "concept" | "reference" | "contributing";

export interface DocsPage {
    /** Inventory id (`D00`, `T01`, `G01`, …), stable across URL changes. */
    readonly id: string;
    readonly path: string;
    readonly title: string;
    readonly description: string;
    readonly group: DocsGroupId;
    readonly kind: DocsPageKind;
    /** H2 headings in order; the in-page TOC mirrors these. */
    readonly sections: readonly string[];
    /** Page ids that a reader is likely to need next. */
    readonly related: readonly string[];
}

export const DOCS_GROUPS: readonly { id: DocsGroupId; label: string }[] = [
    { id: "get-started", label: "Get started" },
    { id: "concepts", label: "Concepts" },
    { id: "guides", label: "Guides" },
    { id: "reference", label: "Reference" },
    { id: "troubleshooting", label: "Troubleshooting" },
    { id: "contributing", label: "Contributing" },
] as const;

export const DOCS_PAGES: readonly DocsPage[] = [
    {
        id: "D00",
        path: "/docs",
        title: "Documentation",
        description:
            "Install Av1ation Station, understand the scene-aware pipeline, and find the guide for the task in front of you.",
        group: "get-started",
        kind: "overview",
        sections: ["Start here", "Understand the pipeline", "Browse the manual", "Get help", "What this covers"],
        related: ["T01", "T02", "C01"],
    },
    {
        id: "T01",
        path: "/docs/get-started/install",
        title: "Install and verify",
        description:
            "Install the unsigned pre-release on Windows or Linux, or build from source, then verify the providers your first encode needs.",
        group: "get-started",
        kind: "task",
        sections: ["Install", "Check the toolchain", "Troubleshooting", "Next step"],
        related: ["H01", "G15", "T02"],
    },
    {
        id: "T02",
        path: "/docs/get-started/first-encode",
        title: "Your first project and encode",
        description:
            "Create a project, queue one video, start the run, and read the result from the Video and History surfaces.",
        group: "get-started",
        kind: "task",
        sections: [
            "Create a project",
            "Add a video",
            "Check the source and output",
            "Start the run",
            "Watch the pipeline",
            "Read the result",
            "Next steps",
        ],
        related: ["G09", "R10", "C01"],
    },
    {
        id: "T03",
        path: "/docs/get-started/workspace",
        title: "Tour the workspace",
        description:
            "Learn the four surfaces that hold the application: Projects, a project, a video, and Settings.",
        group: "get-started",
        kind: "task",
        sections: [
            "Projects",
            "Project workspace",
            "Video workspace",
            "Settings",
            "Command palette and shortcuts",
            "Where to go next",
        ],
        related: ["R02", "R10", "R18"],
    },
    {
        id: "C01",
        path: "/docs/concepts/pipeline",
        title: "How the pipeline works",
        description:
            "The six stages in order, what each one writes, and why the current state is derived instead of stored.",
        group: "concepts",
        kind: "concept",
        sections: [
            "The six stages",
            "What each stage produces",
            "Derived state",
            "Optional stages",
            "Retained work",
            "Reading the pipeline",
        ],
        related: ["C02", "G01", "R10"],
    },
    {
        id: "C02",
        path: "/docs/concepts/configuration",
        title: "Configuration and inheritance",
        description:
            "How project defaults, whole-section video overrides, drafts, templates, and the run lock fit together.",
        group: "concepts",
        kind: "concept",
        sections: [
            "Project defaults",
            "Video overrides",
            "Whole-section replacement",
            "Drafts and undo",
            "The run lock",
            "Templates are snapshots",
            "Validation",
        ],
        related: ["C01", "R02", "R14"],
    },
    {
        id: "C03",
        path: "/docs/concepts/quality",
        title: "Quality targets and checks",
        description:
            "Target quality chooses a quantizer per scene; quality check measures the finished file. Neither replaces the other.",
        group: "concepts",
        kind: "concept",
        sections: [
            "Target quality and quality check",
            "Metrics and ranges",
            "Probing",
            "Speed scaling and bitrate optimization",
            "When scores mislead",
        ],
        related: ["G02", "R07", "R09"],
    },
    {
        id: "C04",
        path: "/docs/concepts/scenes",
        title: "Scenes and preview",
        description:
            "A scene is an owned frame range with its own chunk; editing one is a structural change to the encode.",
        group: "concepts",
        kind: "concept",
        sections: [
            "What a scene is",
            "Detection",
            "The scene table",
            "Preview sources",
            "Scene edits",
            "Per-scene encoder",
            "Retained chunks",
        ],
        related: ["G03", "G04", "R11"],
    },
    {
        id: "C05",
        path: "/docs/concepts/runs",
        title: "Runs, history, and logs",
        description:
            "One run is one lock and one log; its attempts are append-only history, not a state field.",
        group: "concepts",
        kind: "concept",
        sections: [
            "One run, many attempts",
            "Outcomes",
            "History",
            "Logs",
            "Export and redaction",
            "What survives deletion",
        ],
        related: ["G12", "G13", "R12"],
    },
    {
        id: "C06",
        path: "/docs/concepts/scripting",
        title: "VapourSynth scripting",
        description:
            "A VapourSynth script is one input for the whole video, with scene data injected through a generated module.",
        group: "concepts",
        kind: "concept",
        sections: [
            "Where scripts live",
            "Input kinds",
            "The generated data module",
            "Scene data",
            "Validation and completion",
            "Limits",
        ],
        related: ["G10", "R17", "R03"],
    },
    {
        id: "G01",
        path: "/docs/guides/configure-pipeline",
        title: "Configure the pipeline stages",
        description:
            "Save deliberate project defaults for all seven configuration sections before a video joins the queue.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "General",
            "Scene detection",
            "Noise generation",
            "Encoding",
            "Target quality",
            "Concatenation",
            "Quality check",
            "Check your result",
            "If it goes wrong",
            "Related reference",
        ],
        related: ["C01", "C02", "R04", "R05", "R06", "R07", "R08", "R09"],
    },
    {
        id: "G02",
        path: "/docs/guides/target-quality",
        title: "Hit a quality target",
        description:
            "Probe scenes, choose a quantizer per scene, and confirm the result with a quality check.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Enable target quality",
            "Choose metric and range",
            "Set probes and bounds",
            "Add speed points",
            "Set the bitrate threshold",
            "Run and inspect",
            "Check your result",
            "If it goes wrong",
        ],
        related: ["C03", "R07", "R09"],
    },
    {
        id: "G03",
        path: "/docs/guides/edit-scenes",
        title: "Inspect and edit scenes",
        description:
            "Read the scene table, make one deliberate structural edit, and leave every boundary valid.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Detect scenes",
            "Select and inspect",
            "Split, merge, or delete",
            "Undo",
            "Edit multiple scenes",
            "Set a scene encoder",
            "Reset chunks",
            "Check your result",
            "If it goes wrong",
        ],
        related: ["C04", "G04", "R11"],
    },
    {
        id: "G04",
        path: "/docs/guides/compare-previews",
        title: "Compare Original, Decoded, and Encoded",
        description:
            "Switch between the three preview sources without losing the scene-relative frame.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Open the source control",
            "Compare Original and Decoded",
            "Compare Encoded",
            "Switch without losing position",
            "Understand unavailable sources",
            "Check your result",
        ],
        related: ["C04", "R11", "G03"],
    },
    {
        id: "G05",
        path: "/docs/guides/tune-encoder",
        title: "Tune encoder parameters",
        description:
            "Choose the encoder or build, set only the parameters you mean, and read the command before saving.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Choose the encoder",
            "Choose a saved build",
            "Find and edit parameters",
            "Add a parameter",
            "Preview the command",
            "Save",
            "Check your result",
            "If it goes wrong",
        ],
        related: ["R06", "R15", "G15"],
    },
    {
        id: "G06",
        path: "/docs/guides/input-filters",
        title: "Add and order input filters",
        description:
            "Build an ordered filter list for FFMS2 or VapourSynth and keep the generated fields valid.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Choose the input kind",
            "Add a filter",
            "Fill the generated fields",
            "Reorder and remove",
            "Save",
            "Check your result",
            "If it goes wrong",
        ],
        related: ["R03", "R16", "G01"],
    },
    {
        id: "G07",
        path: "/docs/guides/concatenate",
        title: "Configure concatenation and tracks",
        description:
            "Choose a muxer, probe the source streams, and decide exactly what reaches the final file.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Choose the method",
            "Probe the inventory",
            "Map tracks",
            "Edit a track",
            "Copy chapters and metadata",
            "Add attachments or extra inputs",
            "Save",
            "Check your result",
            "If it goes wrong",
        ],
        related: ["R08", "C01", "G01"],
    },
    {
        id: "G08",
        path: "/docs/guides/templates",
        title: "Save and reuse a project template",
        description:
            "Capture a configuration as a template, mark a default deliberately, and apply it without touching video overrides.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Create a template",
            "Edit a section",
            "Edit the template script",
            "Mark the default",
            "Apply to a project",
            "Reset or delete",
            "Check your result",
            "If it goes wrong",
        ],
        related: ["R14", "C02", "G01"],
    },
    {
        id: "G09",
        path: "/docs/guides/batch-queue",
        title: "Run and monitor a batch queue",
        description:
            "Reorder the queue, run a selection, and read each video's outcome without losing the rest of the batch.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Add the queue",
            "Reorder",
            "Select and run",
            "Monitor",
            "Stop",
            "Read results",
            "If it goes wrong",
        ],
        related: ["R02", "C05", "G12"],
    },
    {
        id: "G10",
        path: "/docs/guides/script-scene-data",
        title: "Inject scene data into a VapourSynth script",
        description:
            "Read the generated module, use a scene value, and save a script the next run can actually execute.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Open the script page",
            "Read the variables",
            "Edit the script",
            "Use scene data",
            "Validate",
            "Save",
            "Check your result",
            "If it goes wrong",
        ],
        related: ["C06", "R17", "R03"],
    },
    {
        id: "G11",
        path: "/docs/guides/lan-access",
        title: "Pair and use a LAN browser",
        description:
            "Enable the LAN listener, pair one browser with its token, and revoke access when it is no longer needed.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Enable LAN",
            "Read the address",
            "Pair with code, link, or QR",
            "Use the browser",
            "Revoke or disable",
            "Firewall",
            "If it goes wrong",
        ],
        related: ["H03", "R13", "T03"],
    },
    {
        id: "G12",
        path: "/docs/guides/logs-evidence",
        title: "Review logs and export support evidence",
        description:
            "Find one run's log, narrow it, and export redacted evidence that matches the preview exactly.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Open History",
            "Open the log",
            "Filter and search",
            "Follow a live run",
            "Export",
            "Review redactions",
            "Delete a run",
            "If it goes wrong",
        ],
        related: ["C05", "R12", "H04"],
    },
    {
        id: "G13",
        path: "/docs/guides/recover-run",
        title: "Recover from a failed or interrupted run",
        description:
            "Read the failure, find the owning sequence, fix the cause, and verify the recovery in History.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Read the failure",
            "Find the failing sequence",
            "Open the log",
            "Fix the cause",
            "Resume or rerun",
            "Verify",
            "If it goes wrong",
        ],
        related: ["H02", "C05", "G12"],
    },
    {
        id: "G14",
        path: "/docs/guides/storage",
        title: "Manage storage and retained work",
        description:
            "Read the volumes the app uses, move scratch deliberately, and decide whether encoded chunks are kept.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Read storage",
            "Change scratch",
            "Set retention",
            "Remove retained work",
            "Reveal app data",
            "Check your result",
        ],
        related: ["R13", "C01", "R10"],
    },
    {
        id: "G15",
        path: "/docs/guides/dependencies",
        title: "Resolve dependencies and add encoder builds",
        description:
            "Give each capability a working provider and register another build of a known encoder.",
        group: "guides",
        kind: "task",
        sections: [
            "Before you start",
            "Run preflight",
            "Read a row",
            "Choose bundled or system",
            "Locate a custom executable",
            "Set the scene model or interpreter",
            "Add a custom encoder build",
            "Restart when required",
            "If it goes wrong",
        ],
        related: ["H01", "R13", "R15"],
    },
    {
        id: "R01",
        path: "/docs/reference/home",
        title: "Home and projects",
        description:
            "The project list, search, create, rename, delete, and the states the list can show.",
        group: "reference",
        kind: "reference",
        sections: ["Project list", "Search", "Create and rename", "Delete", "Disk size", "States"],
        related: ["T02", "R02", "G09"],
    },
    {
        id: "R02",
        path: "/docs/reference/project",
        title: "Project workspace and queue",
        description:
            "The section grid, queue rows, reordering, selection, bulk actions, and the run lock.",
        group: "reference",
        kind: "reference",
        sections: [
            "Section grid",
            "Queue",
            "Shared section contract",
            "Template application",
            "States",
        ],
        related: ["R10", "G09", "C02"],
    },
    {
        id: "R03",
        path: "/docs/reference/general",
        title: "General",
        description:
            "Input kinds, import method, index, script source, output, and the filter list.",
        group: "reference",
        kind: "reference",
        sections: ["Input kinds", "Import method", "Index", "Script sources", "Output", "Filter list", "States"],
        related: ["G06", "R16", "C06"],
    },
    {
        id: "R04",
        path: "/docs/reference/scene-detection",
        title: "Scene detection",
        description:
            "Detector choice, scene-length bounds, per-frame scores, the model path, and video overrides.",
        group: "reference",
        kind: "reference",
        sections: ["Method", "Scene lengths", "Input override", "Per-frame scores", "Model", "States"],
        related: ["C04", "G03", "G15"],
    },
    {
        id: "R05",
        path: "/docs/reference/noise-generation",
        title: "Noise generation",
        description:
            "The noise detector, scaler bounds, the WNNM default pair, and what changes when a provider is missing.",
        group: "reference",
        kind: "reference",
        sections: ["Detector", "Scaler", "Availability", "States"],
        related: ["C01", "G01", "R04"],
    },
    {
        id: "R06",
        path: "/docs/reference/encoding",
        title: "Encoding",
        description:
            "Encoder families and builds, passes, colour data, photon noise, parameters, and FFmpeg filters.",
        group: "reference",
        kind: "reference",
        sections: [
            "Input",
            "Encoder",
            "Saved builds",
            "Executable",
            "Passes",
            "Colour and grain",
            "Parameters",
            "Add parameter",
            "FFmpeg filter",
            "Warnings",
            "States",
        ],
        related: ["G05", "G15", "R15"],
    },
    {
        id: "R07",
        path: "/docs/reference/target-quality",
        title: "Target quality",
        description:
            "The probe metric and range, quantizer bounds, interpolators, probe strategy, and speed scaling.",
        group: "reference",
        kind: "reference",
        sections: [
            "Metric and range",
            "Probes",
            "Quantizer bounds",
            "Interpolators",
            "Probe strategy",
            "Speed scaling",
            "Bitrate optimization",
            "Metric options",
            "States",
        ],
        related: ["G02", "C03", "R09"],
    },
    {
        id: "R08",
        path: "/docs/reference/concatenation",
        title: "Concatenation",
        description:
            "Muxers, track-map namespaces, the locked encoded-video row, chapters, metadata, attachments, and extra inputs.",
        group: "reference",
        kind: "reference",
        sections: [
            "Project method",
            "Video workbench",
            "Track map",
            "Track sheet",
            "Chapters",
            "Metadata",
            "Attachments",
            "Extra inputs",
            "Muxer limits",
            "States",
        ],
        related: ["G07", "C01", "R06"],
    },
    {
        id: "R09",
        path: "/docs/reference/quality-check",
        title: "Quality check",
        description:
            "The metric and statistic, the strategy, input overrides, retained chunks, and the FFmpeg-filter warning.",
        group: "reference",
        kind: "reference",
        sections: ["Metric", "Strategy", "Statistic", "Input override", "Retained chunks", "Warning", "States"],
        related: ["C03", "G02", "R07"],
    },
    {
        id: "R10",
        path: "/docs/reference/video",
        title: "Video workspace and overrides",
        description:
            "The four video tabs, its configuration grid, overrides, measured data, clip details, and exact output.",
        group: "reference",
        kind: "reference",
        sections: [
            "Tabs",
            "Configuration grid",
            "Overrides",
            "Measured data",
            "Clip details",
            "Output",
            "Scratch",
            "Lock",
            "States",
        ],
        related: ["C02", "R12", "G09"],
    },
    {
        id: "R11",
        path: "/docs/reference/scenes",
        title: "Scenes and player",
        description:
            "The rail, timeline, details groups, engine data, sequence data, player sources, edits, and chunk markers.",
        group: "reference",
        kind: "reference",
        sections: [
            "Rail",
            "Timeline",
            "Details",
            "Engine data",
            "Sequence data",
            "Player sources",
            "Editing",
            "Chunks",
            "States",
        ],
        related: ["C04", "G03", "G04"],
    },
    {
        id: "R12",
        path: "/docs/reference/history-logs",
        title: "History and logs",
        description:
            "History cards, the logs viewer, filters and search, sorting, follow, export, deletion, and lock states.",
        group: "reference",
        kind: "reference",
        sections: [
            "History cards",
            "Logs viewer",
            "Filters and search",
            "Sort",
            "Follow",
            "Export",
            "Delete",
            "States",
        ],
        related: ["C05", "G12", "G13"],
    },
    {
        id: "R13",
        path: "/docs/reference/settings",
        title: "Settings",
        description:
            "Appearance, Dependencies, Encoders, Project Templates, Storage, Network, and About.",
        group: "reference",
        kind: "reference",
        sections: [
            "Appearance",
            "Dependencies",
            "Encoders",
            "Project Templates",
            "Storage",
            "Network",
            "About",
        ],
        related: ["T03", "G15", "R14"],
    },
    {
        id: "R14",
        path: "/docs/reference/templates",
        title: "Project templates",
        description:
            "The template list, default marker, overview, section editor, script, application, reset, and deletion.",
        group: "reference",
        kind: "reference",
        sections: [
            "List and default",
            "Overview",
            "Section editor",
            "Script",
            "Apply to a project",
            "Reset and delete",
            "States",
        ],
        related: ["G08", "C02", "R02"],
    },
    {
        id: "R15",
        path: "/docs/reference/encoders",
        title: "Encoders",
        description:
            "The catalogue, provider, parameter table, editor sheet, JSON, saved builds, overrides, and states.",
        group: "reference",
        kind: "reference",
        sections: ["Catalogue", "Provider", "Parameter table", "Editor sheet", "JSON", "Saved builds", "Overrides", "States"],
        related: ["G05", "R06", "G15"],
    },
    {
        id: "R16",
        path: "/docs/reference/filters",
        title: "Input filters",
        description:
            "The two filter targets, the composer, generated fields, cross-field rules, and plugin availability.",
        group: "reference",
        kind: "reference",
        sections: [
            "Two targets",
            "Composer",
            "FFMS2 OutputFormat",
            "VapourSynth filters",
            "Cross-field rules",
            "Availability",
            "States",
        ],
        related: ["G06", "R03", "C06"],
    },
    {
        id: "R17",
        path: "/docs/reference/script-api",
        title: "Script data API",
        description:
            "The generated module's scope, reserved variables, scene fields, sequence data, types, and examples.",
        group: "reference",
        kind: "reference",
        sections: [
            "Scope",
            "Variables",
            "Scene fields",
            "Sequence data",
            "Enums and types",
            "Validation",
            "Examples",
        ],
        related: ["C06", "G10", "R03"],
    },
    {
        id: "R18",
        path: "/docs/reference/shortcuts",
        title: "Keyboard shortcuts",
        description:
            "Global commands, player keys, platform modifier labels, and the command palette.",
        group: "reference",
        kind: "reference",
        sections: ["Global commands", "Player keys", "Platform conventions", "Command palette"],
        related: ["T03", "R10", "R11"],
    },
    {
        id: "H01",
        path: "/docs/troubleshooting/dependencies",
        title: "Missing tools and providers",
        description:
            "Start from an unavailable dependency, read its row, and fix it by choosing a provider or locating an executable.",
        group: "troubleshooting",
        kind: "reference",
        sections: ["Symptom", "Check preflight", "Read the row", "Fix by provider", "Restart", "Still missing"],
        related: ["G15", "T01", "R13"],
    },
    {
        id: "H02",
        path: "/docs/troubleshooting/runs",
        title: "Failed or interrupted runs",
        description:
            "Find the failure, separate a run failure from a control refusal, and recover without losing completed work.",
        group: "troubleshooting",
        kind: "reference",
        sections: ["Symptom", "Find the failure", "Diagnose", "Recover", "Prevent"],
        related: ["G13", "C05", "R12"],
    },
    {
        id: "H03",
        path: "/docs/troubleshooting/lan",
        title: "LAN access and pairing",
        description:
            "Check the listener, the firewall, and the pairing token before assuming the browser is broken.",
        group: "troubleshooting",
        kind: "reference",
        sections: ["Symptom", "Check the listener", "Firewall", "Pair", "Revoke", "Still failing"],
        related: ["G11", "R13", "H01"],
    },
    {
        id: "H04",
        path: "/docs/troubleshooting/support",
        title: "Diagnostics and support",
        description:
            "Collect the right evidence, redact what must not leave the machine, and send a report someone can act on.",
        group: "troubleshooting",
        kind: "reference",
        sections: ["Collect", "Logs", "Diagnostics bundle", "Redact", "Report", "What not to share"],
        related: ["G12", "H02", "R13"],
    },
    {
        id: "X01",
        path: "/docs/contributing",
        title: "For contributors",
        description:
            "Where the repository explains development setup, architecture, contracts, testing, and contribution rules.",
        group: "contributing",
        kind: "contributing",
        sections: [
            "Repository docs",
            "Development setup",
            "Architecture and contracts",
            "Testing",
            "Contributing",
        ],
        related: ["C01", "C02"],
    },
] as const;

export const DOCS_PAGE_BY_ID: ReadonlyMap<string, DocsPage> = new Map(
    DOCS_PAGES.map((page) => [page.id, page]),
);

export const DOCS_PAGE_BY_PATH: ReadonlyMap<string, DocsPage> = new Map(
    DOCS_PAGES.map((page) => [normalizeDocsPath(page.path), page]),
);

/** `/docs/` and `/docs` are the same page; trailing slashes never identify a different one. */
export function normalizeDocsPath(path: string): string {
    const trimmed = path.replace(/\/index\.html$/u, "/").replace(/\/+$/u, "");
    return trimmed === "" ? "/" : trimmed;
}

export function docsPath(path: string): string {
    return normalizeDocsPath(path);
}

export function isDocsPath(path: string): boolean {
    const normalized = normalizeDocsPath(path);
    return normalized === "/docs" || normalized.startsWith("/docs/");
}

/** A stable fragment for a heading, shared by MDX headings, the TOC, and search. */
export function slugifyHeading(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .trim()
        .replace(/\s+/gu, "-");
}

export function docsNeighbours(pageId: string): {
    previous: DocsPage | null;
    next: DocsPage | null;
} {
    const index = DOCS_PAGES.findIndex((page) => page.id === pageId);
    if (index === -1) {
        return { previous: null, next: null };
    }
    return {
        previous: DOCS_PAGES[index - 1] ?? null,
        next: DOCS_PAGES[index + 1] ?? null,
    };
}

export function pagesInGroup(group: DocsGroupId): readonly DocsPage[] {
    return DOCS_PAGES.filter((page) => page.group === group);
}
