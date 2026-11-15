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
            "-DBUILD_APPS=ON",
            "-DBUILD_SHARED_LIBS=OFF",
            "-DENABLE_AVX512=ON",
            "-DCMAKE_POSITION_INDEPENDENT_CODE=ON",
        ],
        target: "SvtAv1EncApp",
    });
    const name = executable(target, "SvtAv1EncApp");
    // SVT-AV1 overrides the runtime output directory, so its app lands under the source
    // tree's `Bin/Release` rather than the CMake build directory.
    const binary = requireFile(
        source,
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `bin/${name}`);
}
