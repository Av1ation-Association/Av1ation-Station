// Generate the deterministic media the screenshot gallery displays.
//
// The gallery must not run an encode or depend on a real project, but a screen with a black
// player is not a useful marketing image either. One short WebM, seventeen keyframe
// thumbnails, and one paused frame are enough to exercise the player, the scene rail, and
// the timeline; seventeen is the number the captured run's thumbnail manifest publishes.
// They are build inputs, not committed fixtures: `apps/website/public/gallery/` is ignored.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outputDirectory = join(root, "apps", "website", "public", "gallery");
const thumbnailDirectory = join(outputDirectory, "thumbs");

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

const ffmpeg = ffmpegBinary();
try {
    execFileSync(ffmpeg, ["-version"], { stdio: "ignore" });
} catch {
    throw new Error(
        `The screenshot gallery needs FFmpeg at ${ffmpeg}. Stage dist/dev-tools or set AV1ATION_FFMPEG.`,
    );
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(thumbnailDirectory, { recursive: true });

execFileSync(
    ffmpeg,
    [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=1280x720:rate=24:duration=17",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000:duration=17",
        "-c:v",
        "libvpx-vp9",
        "-deadline",
        "realtime",
        "-cpu-used",
        "8",
        "-row-mt",
        "1",
        "-b:v",
        "1M",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "libopus",
        "-shortest",
        join(outputDirectory, "demo.webm"),
    ],
    { stdio: "inherit" },
);

execFileSync(
    ffmpeg,
    [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        join(outputDirectory, "demo.webm"),
        "-vf",
        "fps=1,scale=320:-2",
        "-q:v",
        "4",
        "-start_number",
        "0",
        join(thumbnailDirectory, "%d.jpg"),
    ],
    { stdio: "inherit" },
);

execFileSync(
    ffmpeg,
    [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        "3",
        "-i",
        join(outputDirectory, "demo.webm"),
        "-frames:v",
        "1",
        "-q:v",
        "2",
        join(outputDirectory, "frame.jpg"),
    ],
    { stdio: "inherit" },
);

console.log(`Gallery media: ${outputDirectory}`);
