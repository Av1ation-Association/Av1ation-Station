import { basename, join } from "node:path";

import { gitCheckout, mesonBuild, requireFile, stageFile } from "./lib.mjs";

export default async function build({ target, workDir, outputDir, component }) {
    const source = join(workDir, "src");
    gitCheckout({
        url: component.source.url,
        commit: component.source.commit,
        destination: source,
    });
    const prefix = join(workDir, "prefix");
    const build = join(workDir, "build");
    mesonBuild({
        source: join(source, "libvmaf"),
        buildDir: build,
        prefix,
        args: ["--default-library=shared", "-Denable_tools=false", "-Denable_tests=false"],
    });
    const name = basename(component.artifacts[target].install);
    const libraryFile = requireFile(
        prefix,
        (path) => {
            const filename = basename(path);
            return filename === name || filename === name.replace(/^lib/u, "");
        },
        name,
    );
    stageFile(libraryFile, outputDir, `lib/${name}`);
}
