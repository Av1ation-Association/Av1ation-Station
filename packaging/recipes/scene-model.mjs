import { join } from "node:path";

import { download, stageFile } from "./lib.mjs";

export default async function build({ workDir, outputDir, component }) {
    const archive = join(workDir, "transnetv2.onnx");
    await download({
        url: component.source.url,
        destination: archive,
        sha256: component.source.sha256,
    });
    stageFile(archive, outputDir, "model/transnetv2.onnx");
}
