import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { projectRoot } from "./build-paths.mjs";
import { runPreflight } from "./release-preflight.mjs";
import { READINESS_GATES } from "./release-readiness.mjs";
import { TARGETS } from "./toolchain-manifest.mjs";

const roots = [];

function channelFor(tag) {
    if (tag.includes("-weekly.")) return "weekly";
    if (tag.includes("-rc.")) return "rc";
    return "stable";
}

function writeFile(path, contents) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, contents, "utf8");
}

function writeArtifacts(directory, platform, version, channel, variant, omitWindowsMsi) {
    mkdirSync(directory, { recursive: true });
    const base = `av1ation-station_${version}_${platform}_${variant}`;
    const names =
        platform === "windows"
            ? [
                  ...(channel === "stable" && !omitWindowsMsi ? [`${base}.msi`] : []),
                  `${base}-setup.exe`,
                  `${base}.zip`,
              ]
            : platform === "macos"
              ? [`${base}.dmg`, `${base}.app.zip`]
              : [`${base}.deb`, `${base}.AppImage`];
    for (const name of names) {
        writeFile(join(directory, name), "artifact\n");
    }
}

function fixture({
    tag = "v0.1.0",
    version = "0.1.0",
    codeSigned = false,
    notarized = false,
    updater = false,
    omitWindowsMsi = false,
    manifestOverrides = {},
} = {}) {
    const root = mkdtempSync(join(tmpdir(), "av1ation-preflight-"));
    roots.push(root);
    const channel = channelFor(tag);
    mkdirSync(join(root, "packaging"), { recursive: true });
    writeFile(join(root, "package.json"), `${JSON.stringify({ version }, null, 2)}\n`);
    writeFile(join(root, "packaging", "toolchain.lock.json"), "lock-file\n");
    writeFile(
        join(root, "release", "readiness.json"),
        `${JSON.stringify(
            {
                schema_version: 1,
                updated_at: "2026-11-16",
                gates: Object.fromEntries(
                    READINESS_GATES.map((gate) => [
                        gate.id,
                        {
                            status: "pass",
                            evidence: `${gate.id} verified`,
                            verified_at: "2026-11-16",
                        },
                    ]),
                ),
            },
            null,
            2,
        )}\n`,
    );
    writeFile(
        join(root, "rust", "desktop-shell", "tauri.conf.json"),
        `${JSON.stringify(
            updater
                ? {
                      bundle: { createUpdaterArtifacts: true },
                      plugins: { updater: { pubkey: "test-public-key" } },
                  }
                : {},
            null,
            2,
        )}\n`,
    );

    const artifacts = join(root, "dist", "release");
    for (const platform of ["windows", "macos", "linux"]) {
        for (const variant of ["bundled", "system"]) {
            writeArtifacts(
                join(artifacts, platform, variant),
                platform,
                version,
                channel,
                variant,
                omitWindowsMsi,
            );
        }
    }

    for (const target of TARGETS) {
        const audit = join(artifacts, "audit", target);
        writeFile(join(audit, "toolchain.lock.json"), "lock-file\n");
        writeFile(join(audit, "THIRD_PARTY_NOTICES.md"), "notices\n");
        writeFile(join(audit, "SOURCE-OFFER.md"), `source offer for ${tag}\n`);
        writeFile(
            join(audit, "sbom.spdx.json"),
            `${JSON.stringify({ spdxVersion: "SPDX-2.3", name: target }, null, 2)}\n`,
        );
    }

    const release = {
        tag,
        version,
        channel,
        prerelease: channel !== "stable",
        code_signed: codeSigned,
        notarized,
        updater: {
            enabled: updater,
            manifest: updater ? "latest.json" : null,
        },
        ...manifestOverrides,
    };
    writeFile(
        join(artifacts, "release-manifest.json"),
        `${JSON.stringify({ schema_version: 1, release }, null, 2)}\n`,
    );

    return {
        root,
        artifacts,
        tag,
        run(overrides = {}) {
            return runPreflight({
                root,
                tag,
                artifactsDir: artifacts,
                reportPath: join(root, "preflight.json"),
                codeSigned,
                notarized,
                updater,
                env: {},
                verifyToolchain: () => ({ ok: true, detail: "toolchain verified" }),
                ...overrides,
            });
        },
    };
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("release preflight", () => {
    it("passes a complete stable candidate and writes the JSON report", () => {
        const candidate = fixture();
        const report = candidate.run();

        expect(report.ready).toBe(true);
        expect(report.summary.failed).toBe(0);
        expect(report.checks.every((check) => check.status === "pass")).toBe(true);

        const written = JSON.parse(readFileSync(join(candidate.root, "preflight.json"), "utf8"));
        expect(written).toMatchObject({
            schema_version: 1,
            tag: "v0.1.0",
            version: "0.1.0",
            channel: "stable",
            prerelease: false,
            ready: true,
        });
    });

    it("accepts a weekly candidate without a stable-only MSI", () => {
        const candidate = fixture({
            tag: "v0.1.0-weekly.20261116",
            version: "0.1.0-weekly.20261116.abcdef0",
        });

        expect(candidate.run().ready).toBe(true);
    });

    it("fails closed when toolchain:verify rejects the lock", () => {
        const report = fixture().run({
            verifyToolchain: () => ({ ok: false, detail: "toolchain lock is missing" }),
        });

        expect(report.ready).toBe(false);
        expect(report.checks).toContainEqual({
            id: "toolchain.lock",
            status: "fail",
            detail: "toolchain lock is missing",
        });
    });

    it("fails when a required stable installer is missing", () => {
        const report = fixture({ omitWindowsMsi: true }).run();

        expect(report.ready).toBe(false);
        expect(report.checks).toContainEqual(
            expect.objectContaining({
                id: "artifacts.windows.bundled.msi",
                status: "fail",
            }),
        );
    });

    it("fails when the manifest contradicts the signing label", () => {
        const report = fixture({
            codeSigned: true,
            manifestOverrides: { code_signed: false },
        }).run();

        expect(report.ready).toBe(false);
        expect(report.checks).toContainEqual(
            expect.objectContaining({ id: "signing.labels", status: "fail" }),
        );
    });

    it("fails an updater claim without a private key", () => {
        const report = fixture({ updater: true }).run();

        expect(report.ready).toBe(false);
        expect(report.checks).toContainEqual(
            expect.objectContaining({ id: "updater.private-key", status: "fail" }),
        );
    });

    it("accepts an updater when the public and private key are present", () => {
        const report = fixture({ updater: true }).run({
            env: { TAURI_SIGNING_PRIVATE_KEY: "test-private-key" },
        });

        expect(report.ready).toBe(true);
    });

    it("fails when the audit bundle is incomplete", () => {
        const candidate = fixture();
        rmSync(join(candidate.artifacts, "audit", TARGETS[0], "sbom.spdx.json"));
        const report = candidate.run();

        expect(report.ready).toBe(false);
        expect(report.checks).toContainEqual(
            expect.objectContaining({
                id: `audit.${TARGETS[0]}.sbom`,
                status: "fail",
            }),
        );
    });

    it("fails closed when a manual readiness gate is pending", () => {
        const candidate = fixture();
        const readiness = JSON.parse(
            readFileSync(join(candidate.root, "release", "readiness.json"), "utf8"),
        );
        readiness.gates["clean-vm"] = {
            status: "pending",
            evidence: "",
            verified_at: null,
            note: "clean hosts are not available yet",
        };
        writeFile(
            join(candidate.root, "release", "readiness.json"),
            `${JSON.stringify(readiness, null, 2)}\n`,
        );

        const report = candidate.run();

        expect(report.ready).toBe(false);
        expect(report.checks).toContainEqual(
            expect.objectContaining({
                id: "readiness.clean-vm",
                status: "fail",
            }),
        );
    });

    it("rejects latest.json when the release has no updater claim", () => {
        const candidate = fixture();
        writeFile(join(candidate.artifacts, "windows", "bundled", "latest.json"), "{}\n");

        const report = candidate.run();

        expect(report.ready).toBe(false);
        expect(report.checks).toContainEqual(
            expect.objectContaining({
                id: "updater.artifacts-forbidden",
                status: "fail",
            }),
        );
    });

    it("fails a tag/version mismatch before artifact checks pass", () => {
        const report = fixture({ version: "0.2.0" }).run();

        expect(report.ready).toBe(false);
        expect(report.checks).toContainEqual(
            expect.objectContaining({ id: "release.tag", status: "fail" }),
        );
    });

    it("requires an explicit tag at the CLI", () => {
        const result = spawnSync(
            process.execPath,
            [join(projectRoot, "scripts", "release-preflight.mjs")],
            { cwd: projectRoot, encoding: "utf8" },
        );

        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/--tag is required/u);
    });
});
