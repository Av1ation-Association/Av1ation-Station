import { existsSync } from "node:fs";
import { join } from "node:path";

import {
    executable,
    gitCheckout,
    platform,
    requireFile,
    run,
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
    // MKVToolNix 103 requires libEBML 1.4.7, which is newer than the Ubuntu 24.04
    // system package; use the release's pinned submodules instead.
    run("git", ["-C", source, "submodule", "update", "--init", "--recursive", "--depth", "1"]);
    if (!existsSync(join(source, "configure"))) {
        shellScript("./autogen.sh", [], { cwd: source });
    }
    const args = ["--disable-gui", "--disable-update-check"];
    if (platform(target) === "win32") {
        args.push("--host=x86_64-w64-mingw32");
    }
    if (platform(target) === "darwin" && process.env.QMAKE6) {
        args.push(`--with-qmake6=${process.env.QMAKE6}`);
    }
    shellScript("./configure", args, { cwd: source });
    // RubyInstaller exposes rake as a .bat wrapper, which CreateProcess cannot execute
    // directly; let cmd resolve it through PATHEXT on Windows.
    if (platform(target) === "win32") {
        run("cmd", ["/c", "rake", "-j", "4"], { cwd: source });
    } else {
        run("rake", ["-j", "4"], { cwd: source });
    }
    const name = executable(target, "mkvmerge");
    const binary = requireFile(
        source,
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `bin/${name}`);
}
