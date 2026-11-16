import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { generateAuditBundle } from "./release-audit.mjs";
import { TARGETS } from "./toolchain-manifest.mjs";

const directories = [];

function writeFile(path, content) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content, "utf8");
}

function fixture() {
    const root = mkdtempSync(join(tmpdir(), "av1ation-release-audit-"));
    directories.push(root);
    const source = {
        kind: "git",
        url: "https://example.com/x265",
        tag: "4.3",
        commit: "a".repeat(40),
    };
    const components = [
        {
            id: "encoder:x265",
            version: "4.3",
            license: "GPL-2.0",
            provides: ["encode:x265"],
            source,
            build: { recipe: "packaging/recipes/x265.mjs" },
            artifacts: Object.fromEntries(
                TARGETS.map((target) => [target, { install: "tools/bin/x265" }]),
            ),
        },
        {
            id: "metric:fmetrics",
            version: "0.1.0",
            license: "Apache-2.0",
            provides: ["metric:ssimulacra2"],
            source: {
                kind: "git",
                url: "https://example.com/fmetrics",
                commit: "b".repeat(40),
            },
            build: { recipe: "packaging/recipes/fmetrics.mjs" },
            artifacts: Object.fromEntries(
                TARGETS.map((target) => [target, { install: "tools/lib/libfmetrics.so" }]),
            ),
        },
    ];
    const manifest = { schema_version: 1, revision: "2026.11.1", components };
    const manifestText = `${JSON.stringify(manifest, null, 4)}\n`;
    writeFile(join(root, "packaging", "toolchain.json"), manifestText);
    const targets = Object.fromEntries(
        TARGETS.map((target) => [
            target,
            {
                components: Object.fromEntries(
                    components.map((component) => [
                        component.id,
                        {
                            version: component.version,
                            license: component.license,
                            source: component.source,
                            artifact: {
                                url: `https://example.com/${component.id}`,
                                sha256: "c".repeat(64),
                                size: 1,
                                install: component.artifacts[target].install,
                                files: [component.artifacts[target].install],
                            },
                        },
                    ]),
                ),
                tree: {
                    sha256: "d".repeat(64),
                    size: 1,
                    files: components.map((component) => component.artifacts[target].install),
                },
            },
        ]),
    );
    const lock = {
        schema_version: 1,
        revision: manifest.revision,
        manifest_sha256: createHash("sha256").update(manifestText).digest("hex"),
        targets,
    };
    writeFile(join(root, "packaging", "toolchain.lock.json"), `${JSON.stringify(lock, null, 4)}\n`);
    return { root, lock };
}

afterEach(() => {
    for (const directory of directories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe("release audit bundle", () => {
    it("writes all four files for every target from the reviewed lock", () => {
        const { root } = fixture();

        const result = generateAuditBundle({ root, tag: "v0.1.0" });

        expect(result.targets.map((target) => target.target)).toEqual(TARGETS);
        for (const target of TARGETS) {
            const directory = join(root, "dist", "release", "audit", target);
            for (const name of [
                "toolchain.lock.json",
                "THIRD_PARTY_NOTICES.md",
                "sbom.spdx.json",
                "SOURCE-OFFER.md",
            ]) {
                expect(existsSync(join(directory, name))).toBe(true);
            }
            expect(readFileSync(join(directory, "toolchain.lock.json"), "utf8")).toBe(
                readFileSync(join(root, "packaging", "toolchain.lock.json"), "utf8"),
            );
            const notices = readFileSync(join(directory, "THIRD_PARTY_NOTICES.md"), "utf8");
            expect(notices).toContain("encoder:x265");
            expect(notices).toContain("GPL-2.0");
            const offer = readFileSync(join(directory, "SOURCE-OFFER.md"), "utf8");
            expect(offer).toContain("v0.1.0");
            expect(offer).toContain("a".repeat(40));
            const sbom = JSON.parse(readFileSync(join(directory, "sbom.spdx.json"), "utf8"));
            expect(sbom.spdxVersion).toBe("SPDX-2.3");
            expect(sbom.name).toContain(target);
            expect(sbom.packages).toHaveLength(2);
            expect(sbom.packages.find((pkg) => pkg.name === "encoder:x265")?.licenseDeclared).toBe(
                "GPL-2.0-only",
            );
        }
    });

    it("refuses a lock that omits a release target", () => {
        const { root, lock } = fixture();
        delete lock.targets[TARGETS[0]];
        writeFile(
            join(root, "packaging", "toolchain.lock.json"),
            `${JSON.stringify(lock, null, 4)}\n`,
        );

        expect(() => generateAuditBundle({ root, tag: "v0.1.0" })).toThrow(
            new RegExp(`missing target ${TARGETS[0]}`, "u"),
        );
    });

    it("rejects an invalid release tag", () => {
        const { root } = fixture();

        expect(() => generateAuditBundle({ root, tag: "0.1.0" })).toThrow(/release tag/iu);
    });
});
