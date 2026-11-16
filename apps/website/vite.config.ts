import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import remarkGfm from "remark-gfm";
import { defineConfig, type Plugin } from "vite";

const DEMO_TOUR_FILES = [
    "configure-dark.avif",
    "configure-light.avif",
    "scenes-dark.avif",
    "scenes-light.avif",
    "history-dark.avif",
    "history-light.avif",
] as const;
const DEMO_TOUR_DIRECTORY = resolve(import.meta.dirname, "public", "demo-tour");

/** Why the generated mobile tour captures cannot be used by this build. */
function demoTourProblems(): string[] {
    const problems: string[] = [];
    for (const name of DEMO_TOUR_FILES) {
        const file = resolve(DEMO_TOUR_DIRECTORY, name);
        try {
            const info = statSync(file);
            if (!info.isFile()) {
                problems.push(`${name} is not a file`);
                continue;
            }
            if (info.size === 0) {
                problems.push(`${name} is empty`);
                continue;
            }
            const header = readFileSync(file).subarray(0, 64).toString("latin1");
            if (!header.includes("avif")) {
                problems.push(`${name} is not an AVIF image`);
            }
        } catch {
            problems.push(`${name} is missing or unreadable`);
        }
    }
    return problems;
}

function demoTourSetupMessage(problems: readonly string[]): string {
    return [
        "The mobile tour captures are missing or invalid.",
        "The website build needs six generated AVIFs in apps/website/public/demo-tour:",
        ...problems.map((problem) => `  - ${problem}`),
        "",
        "These images are generated from the real screenshot gallery and are not committed.",
        "Regenerate them with:",
        "  npm run screenshots",
        "If dist/screenshots already exists, run:",
        "  npm run build:demo-tour",
    ].join("\n");
}

const DOCS_SHOTS_DIRECTORY = resolve(import.meta.dirname, "public", "docs-shots");

/** Every docs figure must have both generated theme variants before a production build. */
function docsShotProblems(): string[] {
    const problems: string[] = [];
    const indexFile = resolve(DOCS_SHOTS_DIRECTORY, "index.json");
    let ids: readonly string[] = [];
    try {
        const parsed = JSON.parse(readFileSync(indexFile, "utf8")) as { ids?: unknown };
        if (!Array.isArray(parsed.ids) || !parsed.ids.every((id) => typeof id === "string")) {
            return ["index.json has no capture id list"];
        }
        ids = parsed.ids;
    } catch {
        return ["index.json is missing or unreadable"];
    }
    if (ids.length !== 60) {
        problems.push(
            `index.json lists ${String(ids.length)} captures; the docs inventory needs 60`,
        );
    }
    for (const id of ids) {
        for (const theme of ["dark", "light"] as const) {
            const file = resolve(DOCS_SHOTS_DIRECTORY, `${id}-${theme}.avif`);
            try {
                const info = statSync(file);
                if (!info.isFile() || info.size === 0) {
                    problems.push(`${id}-${theme}.avif is empty`);
                }
            } catch {
                problems.push(`${id}-${theme}.avif is missing`);
            }
        }
    }
    return problems;
}

function docsShotSetupMessage(problems: readonly string[]): string {
    return [
        "The docs captures are missing or invalid.",
        ...problems.slice(0, 12).map((problem) => `  - ${problem}`),
        problems.length > 12 ? `  - …and ${String(problems.length - 12)} more` : "",
        "",
        "These images are generated from the screenshot gallery and are not committed.",
        "Generate them with:",
        "  npm run screenshots",
        "  npm run build:docs-shots",
    ]
        .filter((line) => line !== "")
        .join("\n");
}

/**
 * MDX compiles any `.mdx` module, including a `?raw` import whose query it strips before
 * filtering. Search needs those imports as text, so the wrapper declines the raw form and
 * lets Vite's own raw loader answer it.
 */
function docsMdx(): Plugin {
    const compiler = mdx({ remarkPlugins: [remarkGfm] });
    return {
        ...compiler,
        name: "docs-mdx",
        async transform(code, id) {
            if (id.includes("?raw")) {
                return null;
            }
            const transform = compiler.transform;
            if (typeof transform !== "function") {
                return null;
            }
            return transform.call(this, code, id);
        },
    } as Plugin;
}

function docsShots(): Plugin {
    return {
        name: "docs-shot-assets",
        buildStart() {
            const problems = docsShotProblems();
            if (problems.length > 0) {
                this.error(docsShotSetupMessage(problems));
            }
        },
    };
}

function demoTourAssets(): Plugin {
    return {
        name: "demo-tour-assets",
        buildStart() {
            const problems = demoTourProblems();
            if (problems.length > 0) {
                this.error(demoTourSetupMessage(problems));
            }
        },
    };
}

export default defineConfig(({ command, mode }) => {
    if (command === "serve") {
        const problems = demoTourProblems();
        if (problems.length > 0) {
            console.warn(`\n${demoTourSetupMessage(problems)}\n`);
        }
    }
    // The screenshot pipeline builds the demo before it can capture and crop the tour.
    // Its gallery variant therefore cannot require the captures it is about to produce.
    const galleryBuild = mode === "gallery";
    // GitHub project Pages serves this build under the repository path. The flag keeps
    // the Pages base out of shell path conversion while the explicit override remains
    // available for another hosting prefix.
    const pagesBuild = process.env.WEBSITE_PAGES === "1";
    return {
        base: process.env.WEBSITE_BASE_PATH ?? (pagesBuild ? "/Av1ation-Station/" : "/"),
        plugins: [
            docsMdx(),
            react(),
            tailwindcss(),
            ...(command === "build" && !galleryBuild ? [demoTourAssets(), docsShots()] : []),
        ],
        server: {
            port: 1422,
            strictPort: true,
        },
        build: {
            outDir: "../../dist/apps/website",
            emptyOutDir: true,
            rollupOptions: {
                // The marketing/docs site and the live demo are separate documents. The demo
                // mounts the real application, so it keeps its own entry and its own bundle.
                input: {
                    site: resolve(import.meta.dirname, "index.html"),
                    demo: resolve(import.meta.dirname, "demo/index.html"),
                },
            },
        },
    };
});
