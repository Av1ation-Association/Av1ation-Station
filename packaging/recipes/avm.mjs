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
            "-DBUILD_SHARED_LIBS=OFF",
        ],
        target: "aomenc",
    });
    const name = executable(target, "aomenc");
    const binary = requireFile(
        build,
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `bin/${executable(target, "avmenc")}`);
}
