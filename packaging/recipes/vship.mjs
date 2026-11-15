import { basename, join } from "node:path";

import { gitCheckout, platform, requireFile, run, stageFile } from "./lib.mjs";

export default async function build({ target, workDir, outputDir, component }) {
    const source = join(workDir, "src");
    gitCheckout({
        url: component.source.url,
        commit: component.source.commit,
        destination: source,
    });
    // The Makefile's first target only removes FFVship; the library target is `build`.
    const makeArgs = ["-j", "BACKEND=Vulkan", "build"];
    if (platform(target) === "win32") {
        makeArgs.push("CXX=g++");
    }
    run("make", makeArgs, { cwd: source });
    const name = basename(component.artifacts[target].install);
    const binary = requireFile(
        source,
        (path) => {
            const filename = basename(path);
            return filename === name || filename === name.replace(/^lib/u, "");
        },
        name,
    );
    stageFile(binary, outputDir, `lib/${name}`);
}
