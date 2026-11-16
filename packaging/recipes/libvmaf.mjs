import { basename, join } from "node:path";

import { gitCheckout, mesonBuild, platform, requireFile, stageFile } from "./lib.mjs";

export default async function build({ target, workDir, outputDir, component }) {
    const source = join(workDir, "src");
    gitCheckout({
        url: component.source.url,
        commit: component.source.commit,
        destination: source,
    });
    const prefix = join(workDir, "prefix");
    const build = join(workDir, "build");
    // MSVC is on PATH on Windows runners. Meson otherwise prefers cl and then rejects
    // MSYS2's GNU link.exe; this component builds successfully with the UCRT64 GCC.
    const env = platform(target) === "win32" ? { CC: "gcc", CXX: "g++" } : {};
    mesonBuild({
        source: join(source, "libvmaf"),
        buildDir: build,
        prefix,
        args: ["--default-library=shared", "-Denable_tools=false", "-Denable_tests=false"],
        env,
    });
    const name = basename(component.artifacts[target].install);
    const libraryFile = requireFile(
        prefix,
        (path) => {
            const filename = basename(path);
            return filename === name || filename === name.replace(/^lib/u, "");
        },
        name,
    );
    stageFile(libraryFile, outputDir, `lib/${name}`);
}
