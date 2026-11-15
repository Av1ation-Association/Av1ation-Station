import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { GALLERY_CASES, type GalleryCase } from "./catalog";

const root = process.cwd();
const rawRoot = join(root, "dist", "screenshots", "raw");

/** Loading text used by screens that do not wrap the surface in `aria-busy`. */
const LOADING_TEXT = [
    "Loading the input…",
    "Loading the editor…",
    "Loading the video…",
    "Opening the log…",
    "Loading runs",
] as const;

interface CaptureEntry {
    readonly id: string;
    readonly title: string;
    readonly caption: string;
    readonly alt: string;
    readonly route: string;
    readonly group: string;
    readonly frame: "document" | "viewport";
    readonly theme: "dark" | "light";
    readonly file: string;
    readonly width: number;
    readonly height: number;
}

function galleryPath(item: GalleryCase): string {
    // The demo is a separate entry at /demo/ and routes with a fragment, so the screenshot
    // path is the hash and the gallery mode stays on the entry URL. A capture-only host
    // route replaces the shell entirely and has no hash route of its own.
    const url = new URL("/demo/", "http://gallery.local");
    if (item.capture !== undefined) {
        url.searchParams.set("capture", item.capture);
        return `${url.pathname}${url.search}`;
    }
    url.searchParams.set("gallery", item.mode ?? "populated");
    url.hash = item.path.startsWith("/") ? item.path : `/${item.path}`;
    return `${url.pathname}${url.search}${url.hash}`;
}

async function expectNoLoading(page: Page): Promise<void> {
    await expect(page.locator('[aria-busy="true"]:visible')).toHaveCount(0);
    for (const text of LOADING_TEXT) {
        await expect(page.getByText(text).first()).toBeHidden();
    }
}

async function settle(page: Page, item: GalleryCase, theme: string): Promise<void> {
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText(item.ready).first()).toBeVisible();
    await expectNoLoading(page);
    if (item.editor === true) {
        await expect(page.locator(".monaco-editor").first()).toBeVisible();
    }
    await page.evaluate(async () => {
        await document.fonts.ready;
        // Two frames let pending layout and chart paint reach the screen without assuming a
        // fixed amount of time has passed.
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
    });
    await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
        .toBe(theme);
}

async function settleMedia(page: Page): Promise<void> {
    await expect
        .poll(
            () =>
                page.evaluate(() => {
                    const images = Array.from(document.images).filter((image) => {
                        const rect = image.getBoundingClientRect();
                        return (
                            rect.width > 0 &&
                            rect.height > 0 &&
                            rect.bottom > 0 &&
                            rect.right > 0 &&
                            rect.top < window.innerHeight &&
                            rect.left < window.innerWidth
                        );
                    });
                    if (!images.every((image) => image.complete && image.naturalWidth > 0)) {
                        return false;
                    }
                    const videos = Array.from(document.querySelectorAll("video"));
                    return videos.every((video) => video.readyState >= 2);
                }),
            { timeout: 20_000 },
        )
        .toBe(true);
}

function pngSize(buffer: Buffer): { width: number; height: number } {
    const signature = buffer.subarray(0, 8).toString("hex");
    if (signature !== "89504e470d0a1a0a" || buffer.length < 24) {
        throw new Error("the screenshot was not a PNG");
    }
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function capture(page: Page, testInfo: TestInfo, item: GalleryCase): Promise<void> {
    const theme = testInfo.project.name === "light" ? "light" : "dark";
    const directory = join(rawRoot, theme);
    const entryDirectory = join(rawRoot, "entries");
    mkdirSync(directory, { recursive: true });
    mkdirSync(entryDirectory, { recursive: true });

    const buffer = await page.screenshot({
        animations: "disabled",
        caret: "hide",
        fullPage: item.frame === "document",
    });
    const dimensions = pngSize(buffer);
    const file = join(directory, `${item.id}.png`);
    writeFileSync(file, buffer);
    const entry: CaptureEntry = {
        id: item.id,
        title: item.title,
        caption: item.caption,
        alt: item.alt,
        route: item.path,
        group: item.group,
        frame: item.frame,
        theme,
        file: join("raw", theme, `${item.id}.png`).replaceAll("\\", "/"),
        ...dimensions,
    };
    writeFileSync(
        join(entryDirectory, `${theme}-${item.id}.json`),
        `${JSON.stringify(entry, null, 2)}\n`,
    );
}

for (const item of GALLERY_CASES) {
    test(`${item.id}`, async ({ page }, testInfo) => {
        const theme = testInfo.project.name === "light" ? "light" : "dark";
        await page.goto(galleryPath(item));
        await settle(page, item, theme);
        if (item.prepare !== undefined) {
            await item.prepare(page);
            await expectNoLoading(page);
            await page.evaluate(async () => {
                await document.fonts.ready;
            });
        }
        await settleMedia(page);
        await capture(page, testInfo, item);
    });
}
