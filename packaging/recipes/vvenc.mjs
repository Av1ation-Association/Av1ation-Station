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
        configureArgs: ["-DVVCENC_BUILD_APP=ON", "-DVVCENC_BUILD_SHARED=OFF"],
        target: "vvencapp",
    });
    const name = executable(target, "vvencapp");
    // vvenc places the application in its source-tree `bin/release-static` directory.
    const binary = requireFile(
        source,
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `bin/${name}`);
}
