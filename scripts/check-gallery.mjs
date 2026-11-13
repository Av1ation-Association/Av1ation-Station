// Smoke the static gallery artifact, not the app that produced it.
//
// The catalog is the only public list of images, so every path it names must answer 200 with
// an AVIF body and decode in the browser that will show it. This catches a publisher that
// writes the catalog but drops an image, and an encoder that emits a zero-byte or truncated
// file. Run it after `npm run screenshots`.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const root = resolve(projectRoot, "dist/screenshots");
const catalogPath = join(root, "catalog.json");

const MIME = {
    ".avif": "image/avif",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
};

function contentType(path) {
    return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** Serve one directory, refusing a path that escapes it. */
async function serve(request, response) {
    const url = new URL(request.url ?? "/", "http://gallery.local");
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = normalize(join(root, pathname));
    if (file !== root && !file.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
    }
    try {
        const info = await stat(file);
        if (!info.isFile()) {
            response.writeHead(404).end("Not found");
            return;
        }
        const body = await readFile(file);
        response.writeHead(200, {
            "content-type": contentType(file),
            "content-length": body.length,
        });
        response.end(body);
    } catch {
        response.writeHead(404).end("Not found");
    }
}

async function main() {
    let catalog;
    try {
        catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    } catch {
        throw new Error(`Missing screenshot catalog: ${catalogPath}. Run npm run screenshots.`);
    }
    const images = [];
    for (const screen of catalog.screens ?? []) {
        for (const [theme, path] of Object.entries(screen.images ?? {})) {
            if (typeof path === "string" && path !== "") {
                images.push({ id: screen.id, theme, path });
            }
        }
    }
    if (images.length === 0) {
        throw new Error("The screenshot catalog names no images.");
    }

    const server = createServer((request, response) => {
        void serve(request, response);
    });
    await new Promise((ready, fail) => {
        server.once("error", fail);
        server.listen(0, "127.0.0.1", ready);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
        server.close();
        throw new Error("The gallery server did not bind a loopback port.");
    }
    const origin = `http://127.0.0.1:${address.port}`;

    const browser = await chromium.launch();
    const failures = [];
    try {
        const page = await browser.newPage();
        await page.goto(`${origin}/index.html`);

        for (const image of images) {
            const url = `${origin}/${image.path}`;
            const response = await fetch(url);
            const type = response.headers.get("content-type") ?? "";
            if (response.status !== 200) {
                failures.push(`${image.id} ${image.theme}: HTTP ${String(response.status)}`);
                continue;
            }
            if (!type.startsWith("image/avif")) {
                failures.push(`${image.id} ${image.theme}: content-type ${type}`);
                continue;
            }
            const dimensions = await page.evaluate(async (source) => {
                const element = new Image();
                element.src = source;
                await element.decode();
                return { width: element.naturalWidth, height: element.naturalHeight };
            }, url);
            if (dimensions.width <= 0 || dimensions.height <= 0) {
                failures.push(
                    `${image.id} ${image.theme}: decoded ${String(dimensions.width)}×${String(dimensions.height)}`,
                );
            }
        }

        const catalogResponse = await fetch(`${origin}/catalog.json`);
        if (catalogResponse.status !== 200) {
            failures.push(`catalog.json: HTTP ${String(catalogResponse.status)}`);
        }
    } finally {
        await browser.close();
        await new Promise((closed) => server.close(closed));
    }

    if (failures.length > 0) {
        console.error("The screenshot gallery is incomplete:");
        for (const failure of failures) {
            console.error(`  ${failure}`);
        }
        process.exitCode = 1;
        return;
    }
    console.log(`Gallery smoke passed: ${String(images.length)} AVIF images decoded.`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
