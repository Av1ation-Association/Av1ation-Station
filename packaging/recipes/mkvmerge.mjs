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
    if (platform(target) === "darwin" && process.env.BOOST_ROOT) {
        args.push(`--with-boost=${process.env.BOOST_ROOT}`);
    }
    if (platform(target) === "darwin" && process.env.DOCBOOK_ROOT) {
        args.push(`--with-docbook-xsl-root=${process.env.DOCBOOK_ROOT}`);
    }
    const env = {};
    if (platform(target) === "win32") {
        // MKVToolNix's Qt check assumes qmake emits POSIX include paths. MSYS2's
        // qmake emits drive-letter paths, which its cleanup strips as if relative;
        // supplying the UCRT64 headers through CPPFLAGS fixes both the check and
        // the resulting USER_CPPFLAGS used by rake.
        const prefix = process.env.MINGW_PREFIX ?? "/ucrt64";
        const location = process.env.MSYS2_LOCATION;
        const root =
            location && prefix.startsWith("/")
                ? `${location.replaceAll("\\", "/")}${prefix}`
                : prefix;
        env.CPPFLAGS = [
            process.env.CPPFLAGS,
            `-I${root}/include/qt6`,
            `-I${root}/include/qt6/QtCore`,
        ]
            .filter(Boolean)
            .join(" ");
    }
    shellScript("./configure", args, { cwd: source, env });
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
