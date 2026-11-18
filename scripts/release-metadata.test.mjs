import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    AUDIT_FILES,
    createMetadataArchive,
    expectedMetadataEntries,
    readZip,
} from "./release-metadata.mjs";
import { TARGETS } from "./toolchain-manifest.mjs";

const roots = [];

function fixture() {
    const root = mkdtempSync(join(tmpdir(), "av1ation-release-metadata-"));
    roots.push(root);
    const releaseDir = join(root, "release");
    for (const target of TARGETS) {
        for (const file of AUDIT_FILES) {
            const path = join(releaseDir, "audit", target, file);
            mkdirSync(join(path, ".."), { recursive: true });
            writeFileSync(path, `${target}/${file}\n`);
        }
    }
    writeFileSync(join(releaseDir, "SHA256SUMS-github.txt"), "installer checksum\n");
    writeFileSync(join(releaseDir, "SHA256SUMS.txt"), "build checksum\n");
    return { releaseDir };
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("release metadata archive", () => {
    it("carries checksums and every per-target audit file in one archive", () => {
        const { releaseDir } = fixture();
        const result = createMetadataArchive({
            releaseDir,
            tag: "v0.1.0-rc.3",
            version: "0.1.0-rc.3",
        });

        expect(result.name).toBe("Av1ation-Station_0.1.0-rc.3_metadata.zip");
        expect(result.asset).toMatchObject({
            kind: "metadata",
            format: "zip",
            path: `assets/${result.name}`,
        });

        const entries = readZip(join(releaseDir, result.path));
        expect(entries.map((entry) => entry.name).sort()).toEqual(expectedMetadataEntries().sort());
        expect(entries.find((entry) => entry.name === "README.txt")?.data.toString()).toContain(
            "v0.1.0-rc.3",
        );
        expect(
            entries.find((entry) => entry.name === "AUDIT-SHA256SUMS.txt")?.data.toString(),
        ).toContain(`${TARGETS[0]}-toolchain.lock.json`);
    });

    it("is deterministic across rebuilds", () => {
        const { releaseDir } = fixture();
        const options = { releaseDir, tag: "v0.1.0", version: "0.1.0" };
        createMetadataArchive(options);
        const first = readFileSync(
            join(releaseDir, "assets", "Av1ation-Station_0.1.0_metadata.zip"),
        );
        createMetadataArchive(options);
        const second = readFileSync(
            join(releaseDir, "assets", "Av1ation-Station_0.1.0_metadata.zip"),
        );

        expect(first.equals(second)).toBe(true);
    });

    it("refuses to build an archive without the audit bundle", () => {
        const root = mkdtempSync(join(tmpdir(), "av1ation-release-metadata-"));
        roots.push(root);

        expect(() =>
            createMetadataArchive({
                releaseDir: join(root, "release"),
                tag: "v0.1.0",
                version: "0.1.0",
            }),
        ).toThrow(/missing audit bundle/u);
    });
});
