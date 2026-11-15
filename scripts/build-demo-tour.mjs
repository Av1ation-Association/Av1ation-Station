// Crop the deterministic app captures into the three images the mobile tour shows.
//
// The website cannot mount the desktop application on a phone, so the small-screen
// experience steps through native-scale crops of the same real screens the screenshot
// gallery captures. The crops are build inputs, not committed fixtures:
// `apps/website/public/demo-tour/` is ignored. Run `npm run screenshots` first.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const captureRoot = join(root, "dist", "screenshots", "avif");
const outputRoot = join(root, "apps", "website", "public", "demo-tour");
const builtRoot = join(root, "dist", "apps", "website");

const CROP_WIDTH = 400;
const CROP_HEIGHT = 300;

// Each crop starts at a meaningful region of the real 1280 × 720 capture instead of
// squeezing the whole desktop window into a phone frame. The figures stay at native scale
// and the surrounding copy names what the crop leaves out.
const steps = [
    {
        id: "configure",
        source: "video",
        x: 436,
        y: 174,
    },
    {
        id: "scenes",
        source: "scenes",
        x: 0,
        y: 108,
    },
    {
        id: "history",
        source: "history",
        x: 20,
        y: 200,
    },
];

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

function crop(ffmpeg, source, target, x, y) {
    execFileSync(
        ffmpeg,
        [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            source,
            "-vf",
            `crop=${String(CROP_WIDTH)}:${String(CROP_HEIGHT)}:${String(x)}:${String(y)}`,
            "-frames:v",
            "1",
            "-c:v",
            "libaom-av1",
            "-still-picture",
            "1",
            "-crf",
            "28",
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
        throw new Error(`demo-tour crop produced an empty file: ${target}`);
    }
}

if (!existsSync(captureRoot)) {
    throw new Error(
        `no screenshot captures under ${captureRoot}; run "npm run screenshots" before building the mobile tour`,
    );
}

const ffmpeg = ffmpegBinary();
try {
    execFileSync(ffmpeg, ["-version"], { stdio: "ignore" });
} catch {
    throw new Error(
        `The mobile tour needs FFmpeg at ${ffmpeg}. Stage dist/dev-tools or set AV1ATION_FFMPEG.`,
    );
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

for (const step of steps) {
    for (const theme of ["dark", "light"]) {
        const source = join(captureRoot, `${step.source}-${theme}.avif`);
        if (!existsSync(source)) {
            throw new Error(`missing ${source}; run "npm run screenshots" again`);
        }
        crop(ffmpeg, source, join(outputRoot, `${step.id}-${theme}.avif`), step.x, step.y);
    }
}

// The screenshot command builds the website before it captures. Keep that already-built
// copy usable after the crops land, instead of serving a tour with six broken images.
if (existsSync(join(builtRoot, "index.html"))) {
    cpSync(outputRoot, join(builtRoot, "demo-tour"), { recursive: true });
}

console.log(`Mobile tour captures: ${outputRoot}`);
