import { join } from "node:path";

import { cmakeBuild, executable, gitCheckout, requireFile, run, stageFile } from "./lib.mjs";

export default async function build({ target, workDir, outputDir, component }) {
    const source = join(workDir, "src");
    gitCheckout({
        url: component.source.url,
        commit: component.source.commit,
        destination: source,
    });
    // gitCheckout fetches one commit, not tags. x265 derives its version from
    // `git describe --tags`, and CMake errors on an empty VERSION_LIST.
    if (component.source.tag !== undefined) {
        run("git", [
            "-C",
            source,
            "fetch",
            "--quiet",
            "--depth",
            "1",
            "origin",
            `refs/tags/${component.source.tag}:refs/tags/${component.source.tag}`,
        ]);
    }
    const build = join(workDir, "build");
    cmakeBuild({
        source: join(source, "source"),
        buildDir: build,
        prefix: join(workDir, "prefix"),
        configureArgs: ["-DENABLE_CLI=ON", "-DENABLE_SHARED=OFF", "-DENABLE_ASSEMBLY=ON"],
        target: "cli",
    });
    const name = executable(target, "x265");
    const binary = requireFile(
        build,
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `bin/${name}`);
}
