// Git Bash puts its own link.exe ahead of MSVC's linker on Windows. Every build wrapper
// goes through this one sanitized spawn and preserves the child's exit status.
import { spawnSync } from "node:child_process";

import { sanitizedPath } from "./sanitize-path.mjs";

export function runSanitized(command, args, extraEnv = {}, options = {}) {
    const result = spawnSync(command, args, {
        ...options,
        stdio: "inherit",
        env: { ...process.env, ...extraEnv, PATH: sanitizedPath() },
    });

    if (result.error) {
        console.error(result.error.message);
        process.exit(1);
    }
    process.exit(result.status ?? 1);
}
