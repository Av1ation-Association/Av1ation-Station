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
    const args = ["--enable-cli", "--enable-static", "--disable-opencl"];
    if (platform(target) === "win32") {
        // The UCRT64 toolchain is native, so its binutils do not install the
        // x86_64-w64-mingw32-* aliases that the MINGW64 packages provide. Leave the
        // cross prefix empty and let configure use gcc, strings, and windres directly.
        args.push("--host=x86_64-w64-mingw32");
    }
    shellScript("./configure", args, { cwd: source });
    makeConfigured(source);
    const name = executable(target, "x264");
    const binary = requireFile(
        source,
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `bin/${name}`);
}
