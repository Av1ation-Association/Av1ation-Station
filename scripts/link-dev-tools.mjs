// Copy a staged release toolchain into the persistent `dist/dev-tools/` cache so `tauri dev`
// can exercise bundled providers without installing them system-wide. Links are resolved, so
// a hand-staged Python junction does not make the cache depend on a machine-wide install.
// `cargo clean` leaves the copy alone.
import { existsSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

import { stagedTools } from "./build-paths.mjs";
import { cacheRoot, prepareDevTools, stageCache } from "./dev-tools.mjs";

const args = process.argv.slice(2);
const fromIndex = args.indexOf("--from");
const defaultSource = stagedTools;
const source =
    fromIndex === -1
        ? existsSync(defaultSource)
            ? defaultSource
            : undefined
        : args[fromIndex + 1];

if (source === undefined || source.trim() === "") {
    console.error(
        "Usage: npm run dev:tools [-- --from <staged-tools-directory>]\n" +
            "Without --from, dist/tools (the release-staged tree) is used.\n" +
            "The directory is the `tools/` root a release bundle would install.",
    );
    process.exit(1);
}

const root = resolve(source);
if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`${root} is not a directory.`);
    process.exit(1);
}
for (const expected of ["python", "bin", "lib"]) {
    if (!existsSync(resolve(root, expected))) {
        console.warn(`warning: ${relative(process.cwd(), root)} has no ${expected}/ directory.`);
    }
}

try {
    stageCache(root);
} catch (error) {
    console.error(`the toolchain could not be staged: ${error.message}`);
    process.exit(1);
}

const staged = prepareDevTools();
console.log(`Dev toolchain cache: ${cacheRoot}`);
console.log(`Dev builds use ${staged ?? cacheRoot}; cargo clean leaves the cache in place.`);
console.log("The cache mirrors the release toolchain; stage a full Python tree only outside it.");
