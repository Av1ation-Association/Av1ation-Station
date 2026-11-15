import { join } from "node:path";

import {
    executable,
    gitCheckout,
    makeConfigured,
    platform,
    requireFile,
    shellScript,
    stageFile,
} from "./lib.mjs";

export default async function build({ target, workDir, outputDir, component }) {
    const source = join(workDir, "src");
    gitCheckout({
        url: component.source.url,
        commit: component.source.commit,
        destination: source,
    });
    const prefix = join(workDir, "prefix");
    const args = [
        `--prefix=${prefix}`,
        "--disable-doc",
        "--disable-debug",
        "--disable-gpl",
        "--disable-nonfree",
        "--disable-autodetect",
        "--enable-static",
        "--disable-shared",
    ];
    if (platform(target) === "win32") {
        args.push("--toolchain=msvc", "--arch=x86_64");
    } else if (target === "aarch64-apple-darwin") {
        args.push("--arch=arm64");
    } else if (target === "x86_64-apple-darwin") {
        args.push("--arch=x86_64");
    } else {
        args.push("--arch=x86_64");
    }
    shellScript("./configure", args, { cwd: source });
    makeConfigured(source);
    const name = executable(target, "ffmpeg");
    const binary = requireFile(
        source,
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `bin/${name}`);
}
