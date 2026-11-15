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
    const args = [
        "--disable-unit-tests",
        "--disable-docs",
        "--disable-shared",
        "--enable-static",
        "--enable-vp8",
        "--enable-vp9",
        "--enable-vp9-highbitdepth",
    ];
    if (platform(target) === "win32") {
        args.push("--target=x86_64-win64-gcc");
    }
    shellScript("./configure", args, { cwd: source });
    makeConfigured(source);
    const name = executable(target, "vpxenc");
    const binary = requireFile(
        source,
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `bin/${name}`);
}
