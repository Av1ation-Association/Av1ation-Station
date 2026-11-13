// Publish the captured PNGs as the one deterministic gallery.
//
// `npm run screenshots` writes one AVIF per surface per theme plus a machine-readable
// catalog and a local contact sheet. The catalog is the contract docs, guides, and the
// website consume; the contact sheet is for human review. No screenshot baseline is
// committed and no image gates a merge.
import { execFileSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { parseFeatureArguments, resolveFeatureSelection } from "./screenshot-selection.mjs";

const root = process.cwd();
const rawRoot = join(root, "dist", "screenshots", "raw");
const outputRoot = join(root, "dist", "screenshots");
const { featureNotes, selector } = parseFeatureArguments(process.argv.slice(2));
const themes = ["dark", "light"];

function ffmpegBinary() {
    const configured = process.env.AV1ATION_FFMPEG;
    if (configured !== undefined && configured.trim() !== "") {
        return configured;
    }
    const bundled = join(
        root,
        "dist",
        "dev-tools",
        "bin",
        process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
    );
    return existsSync(bundled) ? bundled : "ffmpeg";
}

function readEntries() {
    const directory = join(rawRoot, "entries");
    if (!existsSync(directory)) {
        throw new Error(`no screenshot metadata under ${directory}; run the capture first`);
    }
    const entries = [];
    for (const name of readdirSync(directory).sort()) {
        if (!name.endsWith(".json")) {
            continue;
        }
        const entry = JSON.parse(readFileSync(join(directory, name), "utf8"));
        if (
            typeof entry?.id !== "string" ||
            typeof entry?.title !== "string" ||
            typeof entry?.caption !== "string" ||
            typeof entry?.alt !== "string" ||
            typeof entry?.route !== "string" ||
            typeof entry?.group !== "string" ||
            typeof entry?.file !== "string" ||
            (entry.theme !== "dark" && entry.theme !== "light") ||
            !Number.isInteger(entry.width) ||
            !Number.isInteger(entry.height)
        ) {
            throw new Error(`invalid screenshot metadata: ${name}`);
        }
        entries.push(entry);
    }
    return entries;
}

function groupEntries(entries) {
    const byId = new Map();
    for (const entry of entries) {
        let row = byId.get(entry.id);
        if (row === undefined) {
            row = { dark: undefined, light: undefined };
            byId.set(entry.id, row);
        }
        if (row[entry.theme] !== undefined) {
            throw new Error(`duplicate ${entry.theme} screenshot for ${entry.id}`);
        }
        row[entry.theme] = entry;
    }
    const screens = [];
    for (const [id, row] of [...byId.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
    )) {
        for (const theme of themes) {
            if (row[theme] === undefined) {
                throw new Error(`${id} is missing its ${theme} capture`);
            }
        }
        const dark = row.dark;
        const light = row.light;
        if (
            dark.title !== light.title ||
            dark.caption !== light.caption ||
            dark.alt !== light.alt ||
            dark.route !== light.route ||
            dark.group !== light.group
        ) {
            throw new Error(`${id} changed between themes; both must describe the same surface`);
        }
        screens.push({
            id,
            title: dark.title,
            caption: dark.caption,
            alt: dark.alt,
            route: dark.route,
            feature: dark.group,
            frame: dark.frame,
            dimensions: {
                dark: { width: dark.width, height: dark.height },
                light: { width: light.width, height: light.height },
            },
            images: {
                dark: `avif/${id}-dark.avif`,
                light: `avif/${id}-light.avif`,
            },
        });
    }
    return screens;
}

function toAvif(ffmpeg, source, target) {
    execFileSync(
        ffmpeg,
        [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            source,
            "-frames:v",
            "1",
            "-c:v",
            "libaom-av1",
            "-still-picture",
            "1",
            "-crf",
            "32",
            "-b:v",
            "0",
            "-cpu-used",
            "6",
            "-row-mt",
            "1",
            "-pix_fmt",
            "yuv420p",
            "-map_metadata",
            "-1",
            target,
        ],
        { stdio: "inherit" },
    );
    if (statSync(target).size === 0) {
        throw new Error(`AVIF conversion produced an empty file: ${target}`);
    }
    const head = readFileSync(target).subarray(0, 32).toString("ascii");
    if (!head.includes("avif")) {
        throw new Error(`AVIF conversion did not produce an AVIF file: ${target}`);
    }
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function contactSheet(screens, groups) {
    const filters = ["All", ...groups]
        .map(
            (group, index) =>
                `<button type="button" data-filter="${escapeHtml(group)}" class="${index === 0 ? "active" : ""}">${escapeHtml(group)}</button>`,
        )
        .join("\n");
    const cards = screens
        .map(
            (screen) => `<figure class="card" data-group="${escapeHtml(screen.feature)}">
    <a class="frame" href="${escapeHtml(screen.images.dark)}">
        <img class="shot shot-dark" src="${escapeHtml(screen.images.dark)}" alt="${escapeHtml(screen.alt)}" loading="lazy" />
        <img class="shot shot-light" src="${escapeHtml(screen.images.light)}" alt="${escapeHtml(screen.alt)}" loading="lazy" />
    </a>
    <figcaption>
        <div class="heading"><h2>${escapeHtml(screen.title)}</h2><code>${escapeHtml(screen.feature)}</code></div>
        <p>${escapeHtml(screen.caption)}</p>
        <p class="meta">${escapeHtml(screen.route)} · ${String(screen.dimensions.dark.width)}×${String(screen.dimensions.dark.height)} dark · ${String(screen.dimensions.light.width)}×${String(screen.dimensions.light.height)} light</p>
    </figcaption>
</figure>`,
        )
        .join("\n");
    return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Av1ation Station screenshot gallery</title>
<style>
    :root {
        --bg: #0d1118;
        --surface: #12161e;
        --raised: #1a202b;
        --line: #232b38;
        --ink: #e8edf5;
        --muted: #9aa6b8;
        --brand: #38bdf8;
        --brand-soft: #0d2a3a;
    }
    html[data-theme="light"] {
        --bg: #f4f7fb;
        --surface: #ffffff;
        --raised: #eef3f9;
        --line: #c7d0de;
        --ink: #12161e;
        --muted: #536176;
        --brand: #0284c7;
        --brand-soft: #e0f2fe;
    }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font: 14px/1.5 ui-sans-serif, system-ui, "Segoe UI", sans-serif;
    }
    .page { max-width: 1480px; margin: 0 auto; padding: 32px 24px 80px; }
    header { display: flex; flex-wrap: wrap; align-items: end; gap: 16px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
    .lede { margin: 4px 0 0; color: var(--muted); max-width: 74ch; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
    button {
        border: 1px solid var(--line);
        background: var(--surface);
        color: var(--muted);
        border-radius: 999px;
        padding: 6px 12px;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
    }
    button:hover { color: var(--ink); border-color: var(--brand); }
    button.active { background: var(--brand-soft); color: var(--brand); border-color: var(--brand); }
    .theme { border-radius: 10px; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0 24px; }
    .grid { display: grid; gap: 22px; grid-template-columns: repeat(auto-fill, minmax(390px, 1fr)); }
    .card {
        margin: 0;
        border: 1px solid var(--line);
        border-radius: 14px;
        overflow: hidden;
        background: var(--surface);
        min-width: 0;
    }
    .frame { display: block; background: var(--raised); border-bottom: 1px solid var(--line); }
    .shot { display: block; width: 100%; height: auto; }
    html[data-theme="dark"] .shot-light { display: none; }
    html[data-theme="light"] .shot-dark { display: none; }
    figcaption { padding: 14px 16px 16px; }
    .heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    h2 { margin: 0; font-size: 15px; }
    code {
        color: var(--brand);
        background: var(--brand-soft);
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 10px;
        white-space: nowrap;
    }
    figcaption p { margin: 8px 0 0; color: var(--muted); font-size: 12.5px; }
    figcaption .meta { font: 10.5px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; opacity: 0.8; }
    .empty { padding: 48px; text-align: center; color: var(--muted); }
    @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="page">
<header>
    <div>
        <h1>Av1ation Station screenshot gallery</h1>
        <p class="lede">One deterministic surface catalog, captured from the same page and data in both themes. Every image is AVIF; the catalog beside this page carries the paths, copy, dimensions, and feature group.</p>
    </div>
    <div class="toolbar">
        <button type="button" class="theme" id="theme">Switch to light</button>
    </div>
</header>
<div class="filters">${filters}</div>
<div class="grid" id="grid">
${cards}
</div>
<p class="empty" id="empty" hidden>No screens in this group.</p>
</div>
<script>
    const root = document.documentElement;
    const toggle = document.getElementById("theme");
    const syncLabel = () => {
        toggle.textContent = root.dataset.theme === "dark" ? "Switch to light" : "Switch to dark";
    };
    toggle.addEventListener("click", () => {
        root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
        syncLabel();
    });
    syncLabel();
    const cards = Array.from(document.querySelectorAll(".card"));
    const empty = document.getElementById("empty");
    document.querySelectorAll("[data-filter]").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-filter]").forEach((entry) => entry.classList.remove("active"));
            button.classList.add("active");
            const group = button.dataset.filter;
            let shown = 0;
            cards.forEach((card) => {
                const visible = group === "All" || card.dataset.group === group;
                card.hidden = !visible;
                if (visible) { shown += 1; }
            });
            empty.hidden = shown !== 0;
        });
    });
</script>
</body>
</html>
`;
}

function usageContract(screens, groups) {
    return `# Screenshot gallery

Generated by \`npm run screenshots\`. Do not commit this directory.

- \`avif/<id>-dark.avif\` and \`avif/<id>-light.avif\`: one surface in both themes.
- \`catalog.json\`: the machine-readable contract for docs, guides, and the website.
- \`index.html\`: a local contact sheet with a theme toggle and feature filters.
- \`feature-screenshots.json\`: only present for an explicit feature run.

\`catalog.json\` shape:

\`\`\`json
{
  "version": 1,
  "viewport": { "width": 1280, "height": 720 },
  "themes": ["dark", "light"],
  "features": ${JSON.stringify(groups)},
  "screens": [
    {
      "id": "quality-check",
      "title": "Quality check",
      "caption": "…",
      "alt": "…",
      "route": "/projects/demo-project/videos/demo-video/config/quality-check",
      "feature": "Quality",
      "frame": "document",
      "dimensions": { "dark": { "width": 1280, "height": 1840 }, "light": { "width": 1280, "height": 1840 } },
      "images": { "dark": "avif/quality-check-dark.avif", "light": "avif/quality-check-light.avif" }
    }
  ]
}
\`\`\`

A consumer selects the theme variant itself; it never relies on a second list or a fixed
file name. \`frame: "document"\` means the image is a full-page capture, so its height may
exceed the 1280×720 viewport; \`frame: "viewport"\` marks a fixed pane or an overlay.
Feature screenshots are chosen per run by feature group or screen id; there is no fixed
curated subset:

\`\`\`sh
npm run screenshots:features -- Quality
npm run screenshots:features -- quality-check
npm run screenshots:features -- "Runs and logs"
\`\`\`

An exact screen id wins over a group name. A group includes every screen in that group.
The manifest records the resolved selection:

\`\`\`json
{
  "selection": { "kind": "feature", "value": "Quality" },
  "screens": []
}
\`\`\`

Capture count: ${String(screens.length)} surfaces × 2 themes.
`;
}

try {
    execFileSync(ffmpegBinary(), ["-version"], { stdio: "ignore" });
} catch {
    throw new Error(
        `The screenshot gallery needs FFmpeg. Stage dist/dev-tools or set AV1ATION_FFMPEG.`,
    );
}
const ffmpeg = ffmpegBinary();
const screens = groupEntries(readEntries());
const groups = [...new Set(screens.map((screen) => screen.feature))];
const selection = featureNotes ? resolveFeatureSelection(screens, selector) : null;
const imageDirectory = join(outputRoot, "avif");
rmSync(imageDirectory, { recursive: true, force: true });
mkdirSync(imageDirectory, { recursive: true });

for (const screen of screens) {
    for (const theme of themes) {
        const entry = screen.images[theme].replace(/^avif\//u, "");
        toAvif(ffmpeg, join(rawRoot, theme, `${screen.id}.png`), join(imageDirectory, entry));
    }
}

const catalog = {
    version: 1,
    viewport: { width: 1280, height: 720 },
    themes,
    features: groups,
    screens,
};
writeFileSync(join(outputRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
writeFileSync(join(outputRoot, "index.html"), contactSheet(screens, groups));
writeFileSync(join(outputRoot, "README.md"), usageContract(screens, groups));

const featurePath = join(outputRoot, "feature-screenshots.json");
if (selection !== null) {
    const selected = selection.screens.map(
        ({ id, title, caption, alt, route, feature, images, dimensions }) => ({
            id,
            title,
            caption,
            alt,
            route,
            feature,
            images,
            dimensions,
        }),
    );
    writeFileSync(
        featurePath,
        `${JSON.stringify(
            {
                selection: { kind: selection.kind, value: selection.value },
                screens: selected,
            },
            null,
            2,
        )}\n`,
    );
} else {
    rmSync(featurePath, { force: true });
}

rmSync(rawRoot, { recursive: true, force: true });
console.log(`Screenshot gallery: ${outputRoot}`);
console.log(`Surfaces: ${String(screens.length)}; themes: ${themes.join(", ")}`);
if (selection !== null) {
    console.log(
        `Feature screenshots: ${selection.kind} ${selection.value} (${String(selection.screens.length)} surfaces) -> ${featurePath}`,
    );
}
