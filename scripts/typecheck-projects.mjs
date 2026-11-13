import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/**
 * Every workspace that has its own root `tsconfig.json`, plus the explicit E2E project.
 *
 * A workspace without one is a configuration package, not a TypeScript project. E2E is a
 * root-level harness rather than a workspace, so its project is named here instead of
 * widening the workspace glob. The caller fails when this is empty so a broken workspace
 * glob cannot silently pass a typecheck.
 */
export function discoverTypecheckProjects(root) {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const patterns = Array.isArray(manifest.workspaces) ? manifest.workspaces : [];
    const directories = new Set();

    for (const pattern of patterns) {
        if (typeof pattern !== "string" || pattern.startsWith("!")) {
            continue;
        }
        if (pattern.endsWith("/*")) {
            const parent = resolve(root, pattern.slice(0, -2));
            if (!existsSync(parent)) {
                continue;
            }
            for (const entry of readdirSync(parent, { withFileTypes: true })) {
                if (entry.isDirectory()) {
                    directories.add(join(parent, entry.name));
                }
            }
            continue;
        }
        if (!pattern.includes("*")) {
            directories.add(resolve(root, pattern));
        }
    }

    const projects = [
        ...[...directories]
            .map((directory) => join(directory, "tsconfig.json"))
            .filter((path) => existsSync(path)),
        join(root, "e2e", "tsconfig.json"),
    ]
        .filter((path) => existsSync(path))
        .map((path) => relative(root, path).split(sep).join("/"))
        .sort();

    if (projects.length === 0) {
        throw new Error("No workspace tsconfig.json files were found.");
    }
    return projects;
}
