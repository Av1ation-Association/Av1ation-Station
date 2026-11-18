import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { projectRoot } from "./build-paths.mjs";
import {
    collectReleaseChanges,
    isReleaseAssetPath,
    notesFor,
    parseConventionalCommit,
    parseBranchArgument,
    parseReleaseTag,
    parseTagArgument,
    readArtifacts,
    renderReleaseChanges,
    releaseShape,
    resolveReleaseBranch,
    writeReleaseManifest,
} from "./release-manifest.mjs";

const weeklyTag = "v0.1.0-weekly.20261116";
const weeklyVersion = "0.1.0-weekly.20261116.abcdef0";
const rcTag = "v0.1.0-rc.1";
const rcVersion = "0.1.0-rc.1";
const stableTag = "v0.1.0";
const stableVersion = "0.1.0";

describe("release manifest shapes", () => {
    it("derives a weekly prerelease with no signing or updater claim", () => {
        const release = releaseShape({ tag: weeklyTag, version: weeklyVersion });

        expect(release).toMatchObject({
            channel: "weekly",
            tag: weeklyTag,
            base: "0.1.0",
            date: "20261116",
            version: weeklyVersion,
            prerelease: true,
            codeSigned: false,
            notarized: false,
            updater: { enabled: false, manifest: null },
        });
    });

    it("derives an RC prerelease and permits signing without an updater", () => {
        const release = releaseShape({
            tag: rcTag,
            version: rcVersion,
            codeSigned: true,
            notarized: true,
        });

        expect(release).toMatchObject({
            channel: "rc",
            tag: rcTag,
            base: "0.1.0",
            candidate: "1",
            version: rcVersion,
            prerelease: true,
            codeSigned: true,
            notarized: true,
            updater: { enabled: false, manifest: null },
        });
    });

    it("derives a stable release and enables the updater only when requested", () => {
        const unsigned = releaseShape({ tag: stableTag, version: stableVersion });
        const updatable = releaseShape({
            tag: stableTag,
            version: stableVersion,
            codeSigned: true,
            notarized: true,
            updater: true,
        });

        expect(unsigned).toMatchObject({
            channel: "stable",
            prerelease: false,
            codeSigned: false,
            notarized: false,
            updater: { enabled: false, manifest: null },
        });
        expect(updatable).toMatchObject({
            channel: "stable",
            prerelease: false,
            codeSigned: true,
            notarized: true,
            updater: { enabled: true, manifest: "latest.json" },
        });
    });

    it("rejects signing claims on a weekly release", () => {
        expect(() =>
            releaseShape({ tag: weeklyTag, version: weeklyVersion, codeSigned: true }),
        ).toThrow(/weekly releases are unsigned/u);
        expect(() =>
            releaseShape({
                tag: weeklyTag,
                version: weeklyVersion,
                codeSigned: true,
                notarized: true,
            }),
        ).toThrow(/weekly releases are unsigned/u);
    });

    it("rejects an updater on weekly and RC releases", () => {
        expect(() =>
            releaseShape({ tag: weeklyTag, version: weeklyVersion, updater: true }),
        ).toThrow(/only stable releases may publish an updater/u);
        expect(() => releaseShape({ tag: rcTag, version: rcVersion, updater: true })).toThrow(
            /only stable releases may publish an updater/u,
        );
    });

    it("rejects notarisation without code signing", () => {
        expect(() =>
            releaseShape({ tag: stableTag, version: stableVersion, notarized: true }),
        ).toThrow(/must also be code-signed/u);
    });

    it("rejects a package version that does not match the tag shape", () => {
        expect(() => releaseShape({ tag: rcTag, version: stableVersion })).toThrow(
            /does not match rc tag/u,
        );
        expect(() => releaseShape({ tag: weeklyTag, version: "0.1.0-weekly.20261116" })).toThrow(
            /does not match weekly tag/u,
        );
        expect(() => releaseShape({ tag: stableTag, version: rcVersion })).toThrow(
            /does not match stable tag/u,
        );
    });

    it("rejects unsupported or malformed tag shapes", () => {
        expect(() => parseReleaseTag("v0.1.0-beta.1")).toThrow(/unsupported release tag/u);
        expect(() => parseReleaseTag("0.1.0")).toThrow(/unsupported release tag/u);
        expect(() => parseReleaseTag("v0.1.0-weekly.20260230")).toThrow(/invalid date/u);
    });

    it("requires an explicit tag instead of defaulting to stable", () => {
        expect(parseTagArgument([])).toBeUndefined();
        expect(() => parseTagArgument(["--tag"])).toThrow(/must be followed/u);
        expect(() => parseTagArgument(["--tag", "--skip-bundled"])).toThrow(/must be followed/u);
        expect(parseTagArgument(["--skip-bundled", "--tag", stableTag])).toBe(stableTag);
        expect(() => writeReleaseManifest()).toThrow(/release tag is required/u);
    });

    it("fails the release build before it can emit stable metadata without a tag", () => {
        const result = spawnSync(
            process.execPath,
            [join(projectRoot, "scripts", "build-release.mjs")],
            { cwd: projectRoot, encoding: "utf8" },
        );

        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/Release tag is required/u);
    });
});

describe("release artifact selection", () => {
    it("accepts installers and portables while ignoring audit and report files", () => {
        expect(isReleaseAssetPath("windows/bundled/Av1ation Station_0.1.0_x64-setup.exe")).toBe(
            true,
        );
        expect(isReleaseAssetPath("windows/bundled/Av1ation Station_0.1.0_x64_portable.zip")).toBe(
            true,
        );
        expect(isReleaseAssetPath("macos/bundled/Av1ation Station.app.zip")).toBe(true);
        expect(isReleaseAssetPath("audit/x86_64-pc-windows-msvc/PYTHON_NOTICES.md")).toBe(false);
        expect(isReleaseAssetPath("audit/windows/future-asset.zip")).toBe(false);
        expect(isReleaseAssetPath("preflight.json")).toBe(false);
        expect(isReleaseAssetPath("preflight-run.log")).toBe(false);
    });

    it("reads only installable assets from a checksum file that also names audit files", () => {
        const directory = mkdtempSync(join(tmpdir(), "av1ation-release-manifest-"));
        try {
            const files = new Map([
                ["windows/bundled/setup.exe", "installer"],
                ["windows/bundled/portable.zip", "portable"],
                ["audit/x86_64-pc-windows-msvc/PYTHON_NOTICES.md", "notice"],
                ["audit/aarch64-apple-darwin/PYTHON_NOTICES.md", "notice"],
                ["preflight.json", "report"],
            ]);
            const lines = [];
            for (const [path, contents] of files) {
                const absolute = join(directory, ...path.split("/"));
                mkdirSync(join(absolute, ".."), { recursive: true });
                writeFileSync(absolute, contents);
                const digest = createHash("sha256").update(contents).digest("hex");
                lines.push(`${digest}  ${path}`);
            }
            writeFileSync(join(directory, "SHA256SUMS.txt"), `${lines.join("\n")}\n`);

            expect(readArtifacts(directory).map((artifact) => artifact.name)).toEqual([
                "setup-bundled.exe",
                "portable-bundled.zip",
            ]);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});

describe("release branch resolution", () => {
    it("uses an explicit branch without asking git", () => {
        expect(resolveReleaseBranch("main", () => null)).toBe("main");
        expect(resolveReleaseBranch("feature/toolchain", () => null)).toBe("feature/toolchain");
    });

    it("reads the checked-out branch when none is supplied", () => {
        expect(resolveReleaseBranch(undefined, () => "main")).toBe("main");
    });

    it("fails closed when the checkout has no branch", () => {
        expect(() => resolveReleaseBranch(undefined, () => null)).toThrow(/pass --branch/u);
        expect(() => resolveReleaseBranch(undefined, () => "HEAD")).toThrow(/pass --branch/u);
        expect(() => resolveReleaseBranch("", () => null)).toThrow(/pass --branch/u);
    });

    it("rejects a value that is not a branch name", () => {
        expect(() => resolveReleaseBranch("--branch", () => null)).toThrow(/pass --branch/u);
        expect(() => resolveReleaseBranch("release..1.0", () => null)).toThrow(/pass --branch/u);
        expect(() => resolveReleaseBranch("release 1.0", () => null)).toThrow(/pass --branch/u);
    });

    it("requires a value after --branch", () => {
        expect(parseBranchArgument([])).toBeUndefined();
        expect(() => parseBranchArgument(["--branch"])).toThrow(/must be followed/u);
        expect(() => parseBranchArgument(["--branch", "--tag", stableTag])).toThrow(
            /must be followed/u,
        );
        expect(parseBranchArgument(["--tag", stableTag, "--branch", "main"])).toBe("main");
    });

    it("fails the manifest before it reads artifacts when the branch is HEAD", () => {
        const result = spawnSync(
            process.execPath,
            [
                join(projectRoot, "scripts", "release-manifest.mjs"),
                "--tag",
                stableTag,
                "--branch",
                "HEAD",
            ],
            { cwd: projectRoot, encoding: "utf8" },
        );

        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/pass --branch/u);
    });
});

describe("release note changes", () => {
    it("parses Conventional Commit subjects and ignores merge commits", () => {
        expect(parseConventionalCommit("feat(ui)!: add the scene rail")).toEqual({
            type: "feat",
            scope: "ui",
            breaking: true,
            summary: "add the scene rail",
        });
        expect(parseConventionalCommit("fix: keep the encoder name")).toMatchObject({
            type: "fix",
            scope: null,
            breaking: false,
        });
        expect(parseConventionalCommit("Merge branch 'main'")).toBeNull();
        expect(parseConventionalCommit("unstructured subject")).toBeNull();
    });

    it("collects commits since the previous release tag", () => {
        const result = collectReleaseChanges({
            from: "v0.1.0",
            to: "HEAD",
            runGit: (args) => {
                expect(args[0]).toBe("log");
                expect(args.at(-1)).toBe("v0.1.0..HEAD");
                return "abc1234\tfeat(ui): add the rail\ndef5678\tfix: keep the name\nfedcba9\tunstructured subject";
            },
        });

        expect(result.changes).toHaveLength(3);
        expect(result.changes[0]).toMatchObject({
            hash: "abc1234",
            type: "feat",
            scope: "ui",
        });
        expect(result.changes[2]).toMatchObject({
            hash: "fedcba9",
            type: "other",
            summary: "unstructured subject",
        });
    });

    it("renders features, fixes and an other-changes group", () => {
        const text = renderReleaseChanges({
            from: "v0.1.0",
            to: "HEAD",
            changes: [
                {
                    hash: "abc1234",
                    type: "feat",
                    scope: null,
                    breaking: false,
                    summary: "add the rail",
                },
                {
                    hash: "def5678",
                    type: "fix",
                    scope: "ui",
                    breaking: false,
                    summary: "keep the name",
                },
                {
                    hash: "fedcba9",
                    type: "unknown",
                    scope: null,
                    breaking: false,
                    summary: "another change",
                },
            ],
        });

        expect(text).toContain("## Changes");
        expect(text).toContain("### Features");
        expect(text).toContain("### Fixes");
        expect(text).toContain("### Other changes");
        expect(text).toContain("`abc1234`");
    });
});

describe("release note installer guidance", () => {
    const release = releaseShape({ tag: rcTag, version: rcVersion });
    const exe = {
        name: "Av1ation Station_0.1.0-rc.1_x64-setup-bundled.exe",
        platform: "windows",
        arch: "x86_64",
        variant: "bundled",
        format: "exe",
        kind: "installer",
        size: 1024,
        sha256: "a".repeat(64),
    };
    const windows = (artifacts) => ({
        os: "windows",
        arch: "x86_64",
        target: "x86_64-pc-windows-msvc",
        label: "Windows x64",
        variants: new Map([["bundled", artifacts]]),
    });
    const notes = (artifacts, metadataArchive = null) =>
        notesFor({
            artifacts,
            platforms: [windows(artifacts)],
            featureScreenshots: [],
            changes: "## Changes\n\n",
            version: rcVersion,
            tag: rcTag,
            sourceCommit: "abc1234",
            branch: "main",
            release,
            metadataArchive,
        });

    it("offers only the NSIS installer when the candidate has no MSI", () => {
        const text = notes([exe]);

        expect(text).toContain("Run the `-setup.exe` for the variant you want.");
        expect(text).not.toContain("`.msi`");
    });

    it("offers both installers when the artifact set includes an MSI", () => {
        const msi = {
            ...exe,
            name: "Av1ation Station_0.1.0-rc.1_x64-bundled.msi",
            format: "msi",
        };

        expect(notes([exe, msi])).toContain(
            "Run the `.msi` or `-setup.exe` for the variant you want.",
        );
    });

    it("points users to the consolidated metadata archive when one is attached", () => {
        const text = notes([exe], "Av1ation-Station_0.1.0-rc.1_metadata.zip");

        expect(text).toContain("## Release metadata");
        expect(text).toContain("Av1ation-Station_0.1.0-rc.1_metadata.zip");
        expect(text).not.toContain("must be attached before publication");
    });
});
