// Generate the deterministic media the screenshot gallery displays.
//
// The gallery must not run an encode or depend on a real project, but a screen with a black
// player is not a useful marketing image either. The clip is Conway's Game of Life and its
// length matches the captured run exactly: 2,160 frames at 24 fps. A shorter clip made seeks
// past its end clamp to the final frame, which looked like a player bug in the demo. One
// WebM, keyframe thumbnails, and one paused frame exercise the player, scene rail, and
// timeline. They are build inputs, not committed fixtures: `apps/website/public/gallery/`
// is ignored.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outputDirectory = join(root, "apps", "website", "public", "gallery");
const thumbnailDirectory = join(outputDirectory, "thumbs");
const frameRate = 24;
const durationSeconds = 90;
const frameCount = frameRate * durationSeconds;

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
        "life=size=160x90:rate=24:ratio=0.09:seed=7:mold=6:life_color=0xaaf3d0:death_color=0x081017:mold_color=0x163a30,scale=1280:720:flags=neighbor",
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=440:sample_rate=48000:duration=${String(durationSeconds)}`,
        "-c:v",
        "libvpx-vp9",
        "-deadline",
        "good",
        "-cpu-used",
        "4",
        "-row-mt",
        "1",
        "-b:v",
        "300k",
        "-pix_fmt",
        "yuv420p",
        "-g",
        String(frameRate),
        "-frames:v",
        String(frameCount),
        "-c:a",
        "libopus",
        "-b:a",
        "96k",
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
        "fps=1/5,scale=320:-2",
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
        "30",
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
