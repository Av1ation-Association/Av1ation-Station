// Run Cargo with the Git Bash linker shim removed from PATH. The Cargo workspace lives
// under rust/, so every wrapper command resolves the lockfile and target directory there.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runSanitized } from "./spawn-sanitized.mjs";

const rustRoot = resolve(fileURLToPath(new URL("../rust/", import.meta.url)));
runSanitized("cargo", process.argv.slice(2), {}, { cwd: rustRoot });
