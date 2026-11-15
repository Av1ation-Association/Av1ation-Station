import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { gitCheckout, library, platform, requireFile, run, stageFile } from "./lib.mjs";

// fcvvdp's C implementation assumes POSIX: it includes <unistd.h> for sysconf() and
// leaves a couple of debug counters unused. Patch the fetched package so Zig's Windows
// libc can compile it; the fixes are inert on the other targets.
function patchFetchedCvvdp(source) {
    const packages = join(source, "zig-pkg");
    const packageName = readdirSync(packages).find((name) => name.startsWith("fcvvdp-"));
    if (packageName === undefined) {
        throw new Error(`Zig fetched no fcvvdp package under ${packages}`);
    }
    const path = join(packages, packageName, "src", "cvvdp.c");
    let text = readFileSync(path, "utf8");
    const original = text;
    text = text.replace(
        "#include <unistd.h>",
        "#if defined(_WIN32)\n#include <windows.h>\n#else\n#include <unistd.h>\n#endif",
    );
    text = text.replace(
        "return threads ? threads : (unsigned)sysconf(_SC_NPROCESSORS_ONLN);",
        "#if defined(_WIN32)\n    return threads ? threads : (unsigned)GetActiveProcessorCount(ALL_PROCESSOR_GROUPS);\n#else\n    return threads ? threads : (unsigned)sysconf(_SC_NPROCESSORS_ONLN);\n#endif",
    );
    const unusedTotal =
        "        total_size += (size_t)tw * th;\n        tw = (tw + 1) / 2;\n        th = (th + 1) / 2;\n    }\n";
    const instances = text.split(unusedTotal).length - 1;
    if (instances !== 2) {
        throw new Error(`expected two fcvvdp total_size loops, found ${instances}`);
    }
    text = text.replaceAll(unusedTotal, `${unusedTotal}    (void)total_size;\n`);
    if (text === original) {
        throw new Error("fcvvdp Windows patch did not apply");
    }
    writeFileSync(path, text, "utf8");
}

export default async function build({ target, workDir, outputDir, component }) {
    const source = join(workDir, "src");
    gitCheckout({
        url: component.source.url,
        commit: component.source.commit,
        destination: source,
    });
    run("zig", ["build", "--fetch"], { cwd: source });
    patchFetchedCvvdp(source);
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
