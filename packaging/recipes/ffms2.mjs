import { existsSync } from "node:fs";
import { join } from "node:path";

import {
    gitCheckout,
    library,
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
    if (!existsSync(join(source, "configure"))) {
        shellScript("./autogen.sh", [], { cwd: source });
    }
    const args = ["--enable-shared", "--disable-static", "--with-pic"];
    if (platform(target) === "win32") {
        args.push("--host=x86_64-w64-mingw32");
    }
    shellScript("./configure", args, { cwd: source });
    // ffmsindex uses wmain on Windows without adding -municode to its link flags;
    // only the shared library is bundled, so skip the indexer target there.
    makeConfigured(source, null, platform(target) === "win32" ? "src/core/libffms2.la" : null);
    const name = library(target, "ffms2");
    const binary = requireFile(
        source,
        (path) => {
            const filename = path.split(/[\\/]/u).pop() ?? "";
            return platform(target) === "win32"
                ? /^(?:lib)?ffms2(?:[-.][0-9]+)?\.dll$/iu.test(filename)
                : /^libffms2(?:\.[0-9]+)*\.(?:so(?:\.[0-9]+)*|dylib)$/u.test(filename);
        },
        name,
    );
    stageFile(binary, outputDir, `lib/${name}`);
}
