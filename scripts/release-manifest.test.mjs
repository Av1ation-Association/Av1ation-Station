import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { projectRoot } from "./build-paths.mjs";
import {
    parseBranchArgument,
    parseReleaseTag,
    parseTagArgument,
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
