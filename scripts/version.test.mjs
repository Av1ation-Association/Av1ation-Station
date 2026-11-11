import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { WORKSPACE_PACKAGES, lockVersions, rewriteLock } from "./version.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

function entry(name, version) {
    return `[[package]]\nname = "${name}"\nversion = "${version}"`;
}

describe("version sync", () => {
    it("rewrites only the workspace crate entries", () => {
        const sample = [
            entry("av1ation-contracts", "0.1.0"),
            entry("serde", "1.0.229"),
            entry("av1ation-desktop", "0.1.0"),
        ].join("\n\n");

        const updated = lockVersions(rewriteLock(sample, "2.0.0"));

        expect(updated.get("av1ation-contracts")).toBe("2.0.0");
        expect(updated.get("av1ation-desktop")).toBe("2.0.0");
        expect(updated.get("serde")).toBe("1.0.229");
    });

    it("keeps the checked-in Cargo.lock aligned with package.json", () => {
        const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8"));
        const lock = lockVersions(readFileSync(`${root}rust/Cargo.lock`, "utf8"));

        for (const name of WORKSPACE_PACKAGES) {
            expect(lock.get(name)).toBe(pkg.version);
        }
    });

    it("keeps generated contract metadata aligned with its sources", () => {
        const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8"));
        const engine = readFileSync(`${root}rust/crates/engine/src/lib.rs`, "utf8");
        const workspace = readFileSync(`${root}rust/Cargo.toml`, "utf8");
        const generated = readFileSync(`${root}packages/contracts/src/versions.ts`, "utf8");

        const engineVersion = /pub const ENGINE_VERSION: &str = "([^"]+)";/u.exec(engine)?.[1];
        const pinnedRevision = /^\s*andean-condor\s*=\s*\{[^}]*\brev\s*=\s*"([0-9a-f]{40})"/mu.exec(
            workspace,
        )?.[1];
        expect(workspace).toContain('git = "https://github.com/BoatsMcGee/Av1an"');
        const engineRevision = pinnedRevision;
        const appVersion = /export const APP_VERSION = "([^"]+)";/u.exec(generated)?.[1];
        const exportedEngine = /export const ENGINE_VERSION = "([^"]+)";/u.exec(generated)?.[1];
        const exportedRevision = /export const ENGINE_REVISION = "([^"]+)";/u.exec(generated)?.[1];

        expect(appVersion).toBe(pkg.version);
        expect(exportedEngine).toBe(engineVersion);
        expect(exportedRevision).toBe(engineRevision);
        expect(engineRevision).toBeDefined();
    });

    it("keeps the engine version constant aligned with the locked engine package", () => {
        const engine = readFileSync(`${root}rust/crates/engine/src/lib.rs`, "utf8");
        const lock = lockVersions(readFileSync(`${root}rust/Cargo.lock`, "utf8"));
        const declared = /pub const ENGINE_VERSION: &str = "([^"]+)";/u.exec(engine)?.[1];

        expect(declared).toBe(lock.get("andean-condor"));
    });
});
