import { join } from "node:path";

import { gitCheckout, library, platform, requireFile, run, stageFile } from "./lib.mjs";

export default async function build({ target, workDir, outputDir, component }) {
    const source = join(workDir, "src");
    gitCheckout({
        url: component.source.url,
        commit: component.source.commit,
        destination: source,
    });
    run("zig", ["build", "--fetch"], { cwd: source });
    run("zig", ["build", "--release=fast", "-Dshared=true", "-Dstrip=true"], {
        cwd: source,
    });
    const name = library(target, "fmetrics");
    // Zig 0.16 links the static archive into the shared library without pulling its objects,
    // leaving an empty static-PIE file. Relink the archive with --whole-archive on Linux so
    // the loadable library exports the fmetrics API the engine probes.
    if (platform(target) === "linux") {
        run(
            "cc",
            [
                "-shared",
                "-s",
                "-Wl,-soname,libfmetrics.so",
                "-o",
                join(source, "zig-out", "lib", name),
                "-Wl,--whole-archive",
                join(source, "zig-out", "lib", "libfmetrics.a"),
                "-Wl,--no-whole-archive",
                "-lm",
                "-lpthread",
                "-ldl",
            ],
            { cwd: source },
        );
    }
    const binary = requireFile(
        join(source, "zig-out"),
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `lib/${name}`);
}
