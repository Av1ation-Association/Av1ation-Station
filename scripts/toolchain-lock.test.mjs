import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { TARGETS } from "./toolchain-manifest.mjs";

const lockScript = fileURLToPath(new URL("./toolchain-lock.mjs", import.meta.url));
const verifyScript = fileURLToPath(new URL("./toolchain-verify.mjs", import.meta.url));
const directories = [];

function fixture(components) {
    const root = mkdtempSync(join(tmpdir(), "av1ation-toolchain-lock-"));
    directories.push(root);
    const source = { kind: "git", url: "https://example.com/test.git", commit: "a".repeat(40) };
    const artifacts = Object.fromEntries(
        TARGETS.map((target) => [target, { install: "tools/bin/test" }]),
    );
    const manifest = {
        schema_version: 1,
        revision: "2026.11.0",
        components: components.map((component) => ({ ...component, source, artifacts })),
    };
    writeFile(join(root, "packaging", "toolchain.json"), `${JSON.stringify(manifest, null, 4)}\n`);
    for (const target of TARGETS) {
        writeFile(join(root, "builds", target, "tools", "bin", "test"), `${target}\n`);
    }
    return root;
}

function writeFile(path, content) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
}

function runScript(script, root, extra = []) {
    return spawnSync(process.execPath, [script, "--root", root, ...extra], { encoding: "utf8" });
}

function run(root) {
    return runScript(lockScript, root, ["--from", "builds"]);
}

afterEach(() => {
    for (const directory of directories.splice(0)) {
        rmSync(directory, { force: true, recursive: true });
    }
});

describe("toolchain lock fixtures", () => {
    it("writes a lock that the verifier accepts for four valid targets", () => {
        const root = fixture([
            { id: "encoder:test", version: "1.0.0", license: "MIT", provides: ["encode:test"] },
        ]);

        const result = run(root);
        const verification = runScript(verifyScript, root);

        expect(result.status).toBe(0);
        expect(existsSync(join(root, "packaging", "toolchain.lock.json"))).toBe(true);
        expect(verification.status).toBe(0);
    });

    it("includes unclaimed runtime files in the target tree hash", () => {
        const root = fixture([
            { id: "encoder:test", version: "1.0.0", license: "MIT", provides: ["encode:test"] },
        ]);
        const lockPath = join(root, "packaging", "toolchain.lock.json");

        expect(run(root).status).toBe(0);
        const before = JSON.parse(readFileSync(lockPath, "utf8"));
        const target = TARGETS[0];

        writeFile(join(root, "builds", target, "tools", "bin", "runtime.dll"), "runtime\n");
        expect(run(root).status).toBe(0);
        const after = JSON.parse(readFileSync(lockPath, "utf8"));

        expect(after.targets[target].tree.files).toContain("tools/bin/runtime.dll");
        expect(after.targets[target].tree.sha256).not.toBe(before.targets[target].tree.sha256);
        expect(runScript(verifyScript, root).status).toBe(0);
    });

    it("writes no lock when an artifact is zero bytes", () => {
        const root = fixture([
            { id: "encoder:test", version: "1.0.0", license: "MIT", provides: ["encode:test"] },
        ]);
        for (const target of TARGETS) {
            writeFile(join(root, "builds", target, "tools", "bin", "test"), "");
        }

        const result = run(root);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("zero bytes");
        expect(existsSync(join(root, "packaging", "toolchain.lock.json"))).toBe(false);
        expect(existsSync(join(root, "packaging", "toolchain.lock.json.tmp"))).toBe(false);
    });

    it("writes no lock when two components claim the same install path", () => {
        const root = fixture([
            { id: "encoder:one", version: "1.0.0", license: "MIT", provides: ["encode:one"] },
            { id: "encoder:two", version: "1.0.0", license: "MIT", provides: ["encode:two"] },
        ]);

        const result = run(root);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("duplicate install path");
        expect(existsSync(join(root, "packaging", "toolchain.lock.json"))).toBe(false);
        expect(existsSync(join(root, "packaging", "toolchain.lock.json.tmp"))).toBe(false);
    });
});
