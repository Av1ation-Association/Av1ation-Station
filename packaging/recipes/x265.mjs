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
