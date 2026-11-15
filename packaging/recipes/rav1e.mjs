import { join } from "node:path";

import { executable, gitCheckout, requireFile, run, stageFile } from "./lib.mjs";

export default async function build({ target, workDir, outputDir, component }) {
    const source = join(workDir, "src");
    gitCheckout({
        url: component.source.url,
        commit: component.source.commit,
        destination: source,
    });
    run("cargo", ["build", "--release", "--bin", "rav1e"], { cwd: source });
    const name = executable(target, "rav1e");
    const binary = requireFile(
        join(source, "target", "release"),
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `bin/${name}`);
}
