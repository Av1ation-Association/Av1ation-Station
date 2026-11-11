import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverTypecheckProjects } from "./typecheck-projects.mjs";

const roots: string[] = [];

function workspace(manifest: unknown): string {
    const root = mkdtempSync(join(tmpdir(), "av1ation-typecheck-"));
    roots.push(root);
    writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
    return root;
}

function project(root: string, path: string): void {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, "tsconfig.json"), "{}");
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("discoverTypecheckProjects", () => {
    it("finds workspace projects and skips a package with no root tsconfig", () => {
        const root = workspace({ workspaces: ["packages/*", "apps/*"] });
        project(root, "packages/contracts");
        project(root, "apps/desktop");
        // A base config is not a project unless the workspace also has tsconfig.json.
        mkdirSync(join(root, "packages/config"), { recursive: true });
        writeFileSync(join(root, "packages/config/tsconfig.base.json"), "{}");

        expect(discoverTypecheckProjects(root)).toEqual([
            "apps/desktop/tsconfig.json",
            "packages/contracts/tsconfig.json",
        ]);
    });

    it("fails when no workspace project is found", () => {
        const root = workspace({ workspaces: ["packages/*"] });
        mkdirSync(join(root, "packages/config"), { recursive: true });
        writeFileSync(join(root, "packages/config/tsconfig.base.json"), "{}");

        expect(() => discoverTypecheckProjects(root)).toThrow(
            "No workspace tsconfig.json files were found.",
        );
    });
});
