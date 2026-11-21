import { join } from "node:path";

import { cmakeBuild, executable, gitCheckout, requireFile, stageFile } from "./lib.mjs";

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
    if (target === "aarch64-apple-darwin") {
        // AVM's generic ARM CPU probe has no macOS arm64 path; the baseline build is
        // already native, so runtime dispatch is not needed here.
        configureArgs.push("-DCONFIG_RUNTIME_CPU_DETECT=OFF");
    }
    cmakeBuild({
        source,
        buildDir: build,
        prefix: join(workDir, "prefix"),
        configureArgs,
        target: "avmenc",
    });
    const name = executable(target, "avmenc");
    const binary = requireFile(
        build,
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `bin/${name}`);
}
