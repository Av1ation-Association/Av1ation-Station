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
    cmakeBuild({
        source,
        buildDir: build,
        prefix: join(workDir, "prefix"),
        configureArgs: [
            "-DENABLE_TESTS=OFF",
            "-DENABLE_EXAMPLES=ON",
            "-DENABLE_TOOLS=ON",
            "-DCONFIG_AV1_ENCODER=1",
            "-DCONFIG_AV1_DECODER=1",
            "-DBUILD_SHARED_LIBS=OFF",
        ],
        target: "aomenc",
    });
    const binary = requireFile(
        build,
        (path) =>
            path.endsWith(`/${executable(target, "aomenc")}`) ||
            path.endsWith(`\\${executable(target, "aomenc")}`),
        executable(target, "aomenc"),
    );
    stageFile(binary, outputDir, `bin/${executable(target, "aomenc")}`);
}
