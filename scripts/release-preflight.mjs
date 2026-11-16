// Fail-closed release readiness checks. This command is deliberately read-only: it does not
// create a tag, build an installer, or publish anything. A failed check writes the report and
// exits non-zero; there is no warning-only path.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { projectRoot } from "./build-paths.mjs";
import { releaseShape } from "./release-manifest.mjs";
import { DEFAULT_READINESS_FILE, checkReleaseReadiness } from "./release-readiness.mjs";
import { TARGETS } from "./toolchain-manifest.mjs";

const REPORT_SCHEMA_VERSION = 1;
const DEFAULT_REPORT = join("dist", "release", "preflight.json");
const DEFAULT_ARTIFACTS = join("dist", "release");
const AUDIT_FILES = [
    ["lock", "toolchain.lock.json"],
    ["notices", "THIRD_PARTY_NOTICES.md"],
    ["python-notices", "PYTHON_NOTICES.md"],
    ["python-licenses", "PYTHON-LICENSES.txt"],
    ["sbom", "sbom.spdx.json"],
    ["source-offer", "SOURCE-OFFER.md"],
];

const ARTIFACT_PLATFORMS = [
    {
        name: "windows",
        roles: (channel) => [
            ...(channel === "stable"
                ? [{ id: "msi", label: "MSI installer", match: /\.msi$/iu }]
                : []),
            { id: "nsis", label: "NSIS installer", match: /\.exe$/iu },
            { id: "portable", label: "portable ZIP", match: /\.zip$/iu },
        ],
    },
    {
        name: "macos",
        roles: () => [
            { id: "dmg", label: "DMG installer", match: /\.dmg$/iu },
            { id: "portable", label: "portable app ZIP", match: /\.app\.zip$/iu },
        ],
    },
    {
        name: "linux",
        roles: () => [
            { id: "deb", label: "Debian package", match: /\.deb$/iu },
            { id: "portable", label: "AppImage", match: /\.appimage$/iu },
        ],
    },
];

const VARIANTS = ["bundled", "system"];

const USAGE = `Usage: npm run release:preflight -- --tag <tag> [options]

Fail-closed release readiness checks. The command does not create tags or publish.

Options:
  --tag <tag>                 v<semver>, v<semver>-rc.<n>, or v<semver>-weekly.YYYYMMDD
  --artifacts <directory>     Candidate build root (default: dist/release)
  --audit-bundle <directory>  Audit bundle root (default: <artifacts>/audit)
  --readiness <path>          Readiness record (default: release/readiness.json)
  --report <path>             JSON report path (default: dist/release/preflight.json)
  --json <path>               Alias for --report
  --code-signed               Assert the artifacts are code-signed
  --notarized                 Assert the macOS artifact is notarized
  --updater                   Assert this stable release publishes an updater
  --updater-key-file <path>   Local minisign private key (CI uses TAURI_SIGNING_PRIVATE_KEY)
  --help                      Show this help`;

function addCheck(checks, id, ok, detail) {
    checks.push({
        id,
        status: ok ? "pass" : "fail",
        detail,
    });
}

function readJson(path) {
    try {
        return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}

function readText(path) {
    try {
        return readFileSync(path, "utf8");
    } catch {
        return null;
    }
}

function nonEmptyFile(path) {
    try {
        const stat = statSync(path);
        return stat.isFile() && stat.size > 0;
    } catch {
        return false;
    }
}

function walkFiles(directory) {
    if (!existsSync(directory)) {
        return [];
    }
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkFiles(path));
        } else if (entry.isFile()) {
            files.push(path);
        }
    }
    return files;
}

function truncate(value, limit = 1200) {
    return value.length <= limit ? value : `${value.slice(0, limit)}...`;
}

function outputDetail(result) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    if (output !== "") {
        return truncate(output);
    }
    return result.status === 0 ? "toolchain:verify passed" : `exit ${String(result.status)}`;
}

/**
 * Invoke the existing verifier so the manifest/lock rules have one implementation.
 * The verifier is spawned rather than copied into this file.
 */
export function verifyToolchainLock(root) {
    const result = spawnSync(
        process.execPath,
        [join(projectRoot, "scripts", "toolchain-verify.mjs"), "--root", root],
        {
            cwd: root,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        },
    );
    if (result.error) {
        return { ok: false, detail: result.error.message };
    }
    return {
        ok: result.status === 0,
        detail: outputDetail(result),
    };
}

function checkArtifacts(checks, artifactsDir, channel) {
    for (const platform of ARTIFACT_PLATFORMS) {
        const roles = platform.roles(channel);
        for (const variant of VARIANTS) {
            const directory = join(artifactsDir, platform.name, variant);
            const files = walkFiles(directory);
            for (const role of roles) {
                const matching = files.filter((path) => role.match.test(path));
                const nonEmpty = matching.filter(nonEmptyFile);
                if (matching.length === 0) {
                    addCheck(
                        checks,
                        `artifacts.${platform.name}.${variant}.${role.id}`,
                        false,
                        `missing ${role.label} under ${directory}`,
                    );
                } else if (nonEmpty.length !== matching.length) {
                    addCheck(
                        checks,
                        `artifacts.${platform.name}.${variant}.${role.id}`,
                        false,
                        `empty ${role.label} under ${directory}`,
                    );
                } else {
                    addCheck(
                        checks,
                        `artifacts.${platform.name}.${variant}.${role.id}`,
                        true,
                        `${String(nonEmpty.length)} ${role.label} file(s)`,
                    );
                }
            }
        }
    }

    if (channel !== "stable") {
        for (const variant of VARIANTS) {
            const directory = join(artifactsDir, "windows", variant);
            const msi = walkFiles(directory).filter((path) => /\.msi$/iu.test(path));
            addCheck(
                checks,
                `artifacts.windows.${variant}.msi-not-allowed`,
                msi.length === 0,
                msi.length === 0
                    ? "no stable-only MSI in this channel"
                    : `MSI is stable-only: ${msi.join(", ")}`,
            );
        }
    }
}

function checkUpdater(checks, { root, updater, updaterKeyFile, env }) {
    if (!updater) {
        addCheck(checks, "updater.claim", true, "no updater claim requested");
        return;
    }

    const configPath = join(root, "rust", "desktop-shell", "tauri.conf.json");
    const config = readJson(configPath);
    const publicKey = config.ok ? config.value?.plugins?.updater?.pubkey : undefined;
    const createsArtifacts =
        config.ok &&
        (config.value?.bundle?.createUpdaterArtifacts === true ||
            config.value?.plugins?.updater?.createUpdaterArtifacts === true);

    addCheck(
        checks,
        "updater.public-key",
        typeof publicKey === "string" && publicKey.trim() !== "",
        config.ok
            ? "plugins.updater.pubkey must be configured"
            : `could not read ${configPath}: ${config.error}`,
    );
    addCheck(
        checks,
        "updater.artifacts",
        createsArtifacts,
        "createUpdaterArtifacts must be enabled for a stable updater",
    );

    const environmentKey =
        typeof env?.TAURI_SIGNING_PRIVATE_KEY === "string" &&
        env.TAURI_SIGNING_PRIVATE_KEY.trim() !== "";
    const fileKey = updaterKeyFile !== undefined && nonEmptyFile(updaterKeyFile);
    addCheck(
        checks,
        "updater.private-key",
        environmentKey || fileKey,
        "provide TAURI_SIGNING_PRIVATE_KEY or --updater-key-file",
    );
}

function checkForbiddenUpdaterArtifacts(checks, { artifactsDir, updater }) {
    if (updater) {
        return;
    }
    const forbidden = walkFiles(artifactsDir).filter((path) => basename(path) === "latest.json");
    addCheck(
        checks,
        "updater.artifacts-forbidden",
        forbidden.length === 0,
        forbidden.length === 0
            ? "no updater manifest in a release without an updater claim"
            : `latest.json is not allowed without an updater claim: ${forbidden.join(", ")}`,
    );
}

function checkMetadata(checks, { artifactsDir, tag, version, release }) {
    const manifestPath = join(artifactsDir, "release-manifest.json");
    const parsed = readJson(manifestPath);
    addCheck(
        checks,
        "metadata.manifest",
        parsed.ok && parsed.value?.schema_version === 1,
        parsed.ok
            ? parsed.value?.schema_version === 1
                ? manifestPath
                : `${manifestPath} has an unsupported schema`
            : `could not read ${manifestPath}: ${parsed.error}`,
    );
    if (!parsed.ok || parsed.value?.schema_version !== 1) {
        return;
    }

    const actual = parsed.value.release;
    addCheck(checks, "metadata.tag", actual?.tag === tag, `release.tag must be ${tag}`);
    addCheck(
        checks,
        "metadata.version",
        actual?.version === version,
        `release.version must be ${version}`,
    );
    addCheck(
        checks,
        "metadata.channel",
        actual?.channel === release.channel && actual?.prerelease === release.prerelease,
        `release must be ${release.channel} with prerelease=${String(release.prerelease)}`,
    );
    addCheck(
        checks,
        "signing.labels",
        actual?.code_signed === release.codeSigned && actual?.notarized === release.notarized,
        `release.code_signed=${String(release.codeSigned)} and release.notarized=${String(release.notarized)}`,
    );
    addCheck(
        checks,
        "updater.labels",
        actual?.updater?.enabled === release.updater.enabled &&
            actual?.updater?.manifest === release.updater.manifest,
        `release.updater must be ${JSON.stringify(release.updater)}`,
    );
}

function checkReadiness(checks, { root, readinessFile, channel }) {
    const report = checkReleaseReadiness({ root, file: readinessFile, channel });
    for (const check of report.checks) {
        checks.push(check);
    }
}

function checkAudit(checks, { root, auditDir, tag }) {
    addCheck(
        checks,
        "audit.bundle",
        existsSync(auditDir),
        existsSync(auditDir) ? auditDir : `missing audit bundle: ${auditDir}`,
    );

    const rootLock =
        root === undefined ? null : readText(join(root, "packaging", "toolchain.lock.json"));
    for (const target of TARGETS) {
        const directory = join(auditDir, target);
        for (const [id, name] of AUDIT_FILES) {
            const path = join(directory, name);
            addCheck(
                checks,
                `audit.${target}.${id}`,
                nonEmptyFile(path),
                nonEmptyFile(path) ? path : `missing or empty ${path}`,
            );
        }

        const auditLockPath = join(directory, "toolchain.lock.json");
        if (rootLock !== null) {
            const auditLock = readText(auditLockPath);
            addCheck(
                checks,
                `audit.${target}.lock-match`,
                auditLock === rootLock,
                auditLock === rootLock
                    ? "audit lock matches packaging/toolchain.lock.json"
                    : `audit lock does not match packaging/toolchain.lock.json`,
            );
        }

        const sbom = readJson(join(directory, "sbom.spdx.json"));
        const sbomText = sbom.ok ? JSON.stringify(sbom.value) : "";
        addCheck(
            checks,
            `audit.${target}.sbom-target`,
            sbom.ok &&
                typeof sbom.value?.spdxVersion === "string" &&
                sbom.value.spdxVersion !== "" &&
                sbomText.includes(target),
            sbom.ok
                ? `SBOM must name target ${target} and an SPDX version`
                : `could not read SBOM: ${sbom.error}`,
        );

        const sourceOffer = readText(join(directory, "SOURCE-OFFER.md"));
        addCheck(
            checks,
            `audit.${target}.source-tag`,
            sourceOffer !== null && sourceOffer.trim() !== "" && sourceOffer.includes(tag),
            `SOURCE-OFFER.md must name ${tag}`,
        );
    }
}

function reportFor({ tag, version, release, checks, reportPath }) {
    const failed = checks.filter((check) => check.status === "fail");
    const report = {
        schema_version: REPORT_SCHEMA_VERSION,
        generated_at: new Date().toISOString(),
        tag: tag ?? null,
        version: version ?? null,
        channel: release?.channel ?? null,
        prerelease: release?.prerelease ?? null,
        ready: failed.length === 0 && release !== undefined,
        checks,
        summary: {
            passed: checks.length - failed.length,
            failed: failed.length,
        },
    };
    if (reportPath !== undefined) {
        mkdirSync(dirname(reportPath), { recursive: true });
        writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
    return report;
}

/**
 * Run every release-readiness check and return the same report written by the CLI.
 * `verifyToolchain` is injectable so tests can exercise the gate without a real lock.
 */
export function runPreflight({
    root = projectRoot,
    tag,
    artifactsDir,
    auditDir,
    reportPath,
    codeSigned = false,
    notarized = false,
    updater = false,
    updaterKeyFile,
    readinessFile = DEFAULT_READINESS_FILE,
    env = process.env,
    verifyToolchain = verifyToolchainLock,
} = {}) {
    const resolvedRoot = resolve(root);
    const resolvedArtifacts = resolve(resolvedRoot, artifactsDir ?? DEFAULT_ARTIFACTS);
    const resolvedAudit = resolve(resolvedRoot, auditDir ?? join(resolvedArtifacts, "audit"));
    const resolvedReport = resolve(resolvedRoot, reportPath ?? DEFAULT_REPORT);
    const resolvedUpdaterKey =
        updaterKeyFile === undefined ? undefined : resolve(resolvedRoot, updaterKeyFile);
    const checks = [];
    let version = null;
    let release = null;

    try {
        const pkg = JSON.parse(readFileSync(join(resolvedRoot, "package.json"), "utf8"));
        if (typeof pkg.version !== "string" || pkg.version.trim() === "") {
            throw new Error("package.json has no version");
        }
        version = pkg.version.trim();
    } catch (error) {
        addCheck(
            checks,
            "release.version",
            false,
            error instanceof Error ? error.message : String(error),
        );
    }

    let toolchain;
    try {
        toolchain = verifyToolchain(resolvedRoot);
    } catch (error) {
        toolchain = {
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
        };
    }
    addCheck(
        checks,
        "toolchain.lock",
        toolchain?.ok === true,
        typeof toolchain?.detail === "string" ? toolchain.detail : "toolchain:verify failed",
    );

    if (version !== null) {
        try {
            release = releaseShape({ tag, version, codeSigned, notarized, updater });
            addCheck(checks, "release.tag", true, `${release.tag} is a ${release.channel} release`);
        } catch (error) {
            addCheck(
                checks,
                "release.tag",
                false,
                error instanceof Error ? error.message : String(error),
            );
        }
    } else {
        addCheck(checks, "release.tag", false, "package version is unavailable");
    }

    if (release === null) {
        return reportFor({
            tag,
            version,
            release,
            checks,
            reportPath: resolvedReport,
        });
    }

    checkArtifacts(checks, resolvedArtifacts, release.channel);
    checkForbiddenUpdaterArtifacts(checks, {
        artifactsDir: resolvedArtifacts,
        updater: release.updater.enabled,
    });
    checkReadiness(checks, {
        root: resolvedRoot,
        readinessFile,
        channel: release.channel,
    });
    checkUpdater(checks, {
        root: resolvedRoot,
        updater: release.updater.enabled,
        updaterKeyFile: resolvedUpdaterKey,
        env,
    });
    checkMetadata(checks, {
        artifactsDir: resolvedArtifacts,
        tag,
        version,
        release,
    });
    checkAudit(checks, {
        root: resolvedRoot,
        auditDir: resolvedAudit,
        tag,
    });

    return reportFor({
        tag,
        version,
        release,
        checks,
        reportPath: resolvedReport,
    });
}

function requiredValue(argv, index, option) {
    const value = argv[index + 1];
    if (typeof value !== "string" || value.trim() === "" || value.startsWith("--")) {
        throw new Error(`${option} must be followed by a value`);
    }
    return value;
}

function parseCli(argv) {
    const options = {
        tag: undefined,
        artifactsDir: undefined,
        auditDir: undefined,
        reportPath: undefined,
        codeSigned: false,
        notarized: false,
        updater: false,
        updaterKeyFile: undefined,
        readinessFile: DEFAULT_READINESS_FILE,
        help: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        switch (argument) {
            case "--tag":
                options.tag = requiredValue(argv, index, "--tag");
                index += 1;
                break;
            case "--artifacts":
                options.artifactsDir = requiredValue(argv, index, "--artifacts");
                index += 1;
                break;
            case "--audit-bundle":
                options.auditDir = requiredValue(argv, index, "--audit-bundle");
                index += 1;
                break;
            case "--report":
            case "--json":
                options.reportPath = requiredValue(argv, index, argument);
                index += 1;
                break;
            case "--updater-key-file":
                options.updaterKeyFile = requiredValue(argv, index, "--updater-key-file");
                index += 1;
                break;
            case "--readiness":
                options.readinessFile = requiredValue(argv, index, "--readiness");
                index += 1;
                break;
            case "--code-signed":
                options.codeSigned = true;
                break;
            case "--notarized":
                options.notarized = true;
                break;
            case "--updater":
                options.updater = true;
                break;
            case "--help":
                options.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${argument}`);
        }
    }
    if (!options.help && options.tag === undefined) {
        throw new Error("--tag is required; pass a weekly, RC, or stable release tag");
    }
    return options;
}

function main() {
    const options = parseCli(process.argv.slice(2));
    if (options.help) {
        console.log(USAGE);
        return;
    }
    const report = runPreflight(options);
    const failed = report.checks.filter((check) => check.status === "fail");
    if (report.ready) {
        console.log(`release:preflight passed for ${String(report.tag)}.`);
        console.log(`Report: ${resolve(projectRoot, options.reportPath ?? DEFAULT_REPORT)}`);
        return;
    }
    console.error(
        `release:preflight blocked ${String(report.tag)} with ${String(failed.length)} failure(s):`,
    );
    for (const check of failed) {
        console.error(`  - ${check.id}: ${check.detail}`);
    }
    console.error(`Report: ${resolve(projectRoot, options.reportPath ?? DEFAULT_REPORT)}`);
    process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
