import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { cmakeBuild, executable, gitCheckout, requireFile, stageFile } from "./lib.mjs";

/**
 * TFLite and XNNPACK compile a handful of very large translation units. The default job
 * count exhausts a hosted runner's memory before the build finishes.
 */
function buildJobs(target) {
    if (target === "aarch64-apple-darwin") {
        return 2;
    }
    if (target === "x86_64-unknown-linux-gnu") {
        return 3;
    }
    return null;
}

export default async function build({ target, workDir, outputDir, component }) {
    const source = join(workDir, "src");
    gitCheckout({
        url: component.source.url,
        commit: component.source.commit,
        destination: source,
    });
    const build = join(workDir, "build");
    const configureArgs = [
        "-DENABLE_TESTS=OFF",
        "-DENABLE_EXAMPLES=ON",
        "-DENABLE_TOOLS=ON",
        "-DBUILD_SHARED_LIBS=OFF",
    ];
    if (target === "x86_64-pc-windows-msvc") {
        // TFLite's vendored cpuinfo calls the windows.h max() macro, which AVM removes
        // with NOMINMAX. AVM's own MinGW CI disables the two features that pull TFLite
        // in rather than port it.
        configureArgs.push("-DCONFIG_ML_PART_SPLIT=0", "-DCONFIG_DIP_EXT_PRUNING=0");
    }
    if (target === "aarch64-apple-darwin") {
        // AVM's generic ARM CPU probe has no macOS arm64 path; the baseline build is
        // already native, so runtime dispatch is not needed here.
        configureArgs.push("-DCONFIG_RUNTIME_CPU_DETECT=OFF");
    }
    if (spawnSync("ccache", ["--version"], { stdio: "ignore" }).status === 0) {
        // An AVM version bump usually leaves the vendored TFLite and XNNPACK sources
        // alone, so their objects survive in the compiler cache.
        configureArgs.push(
            "-DCMAKE_C_COMPILER_LAUNCHER=ccache",
            "-DCMAKE_CXX_COMPILER_LAUNCHER=ccache",
        );
    }
    cmakeBuild({
        source,
        buildDir: build,
        prefix: join(workDir, "prefix"),
        configureArgs,
        target: "avmenc",
        jobs: buildJobs(target),
    });
    const name = executable(target, "avmenc");
    const binary = requireFile(
        build,
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `bin/${name}`);
}
