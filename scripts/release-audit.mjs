// Generate the per-target audit bundle that release:preflight consumes.
//
// The reviewed manifest names the components; the lock resolves them to exact sources and
// built artifacts for each target. This command copies the lock unchanged and derives the
// notices, SPDX SBOM, and source offer from those two inputs. It never reads an installer,
// contacts an upstream service, or writes a signing claim.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { projectRoot } from "./build-paths.mjs";
import { parseReleaseTag } from "./release-manifest.mjs";
import { TARGETS } from "./toolchain-manifest.mjs";

const DEFAULT_OUTPUT = join("dist", "release", "audit");
const DEFAULT_REPOSITORY = "Av1ation-Association/Av1ation-Station";

function fail(message) {
    throw new Error(message);
}

function readJson(path, label) {
    if (!existsSync(path)) {
        fail(`missing ${label}: ${path}`);
    }
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        fail(`could not read ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function cell(value) {
    return String(value).replaceAll("|", "\\|");
}

function code(value) {
    return `\`${cell(value)}\``;
}

function sourceDescription(source) {
    switch (source?.kind) {
        case "git": {
            const tag = typeof source.tag === "string" ? `, tag ${source.tag}` : "";
            return `${source.url} (commit ${source.commit}${tag})`;
        }
        case "pypi": {
            const index = typeof source.index === "string" ? ` via ${source.index}` : "";
            return `PyPI ${source.project} ${source.version}${index}`;
        }
        case "url":
            return `${source.url} (SHA-256 ${source.sha256})`;
        default:
            return "unrecognised source";
    }
}

function downloadLocation(source) {
    switch (source?.kind) {
        case "git":
            return `git+${source.url}@${source.commit}`;
        case "pypi":
            return `https://pypi.org/project/${source.project}/${source.version}/`;
        case "url":
            return source.url;
        default:
            return "NOASSERTION";
    }
}

function spdxLicense(license) {
    return String(license)
        .split(/\s+AND\s+/u)
        .map((part) => {
            switch (part) {
                case "GPL-2.0":
                    return "GPL-2.0-only";
                case "LGPL-3.0":
                    return "LGPL-3.0-only";
                default:
                    return part;
            }
        })
        .join(" AND ");
}

function spdxId(id) {
    return `SPDXRef-Package-${id.replace(/[^A-Za-z0-9.-]/gu, "-")}`;
}

function componentRows({ lock, manifestById, target }) {
    const components = lock.targets[target].components;
    return Object.keys(components)
        .sort()
        .map((id) => {
            const resolved = components[id];
            const declared = manifestById.get(id);
            if (declared === undefined) {
                fail(`lock target ${target} names a component absent from the manifest: ${id}`);
            }
            const artifact = resolved.artifact;
            if (
                artifact === undefined ||
                typeof artifact.url !== "string" ||
                typeof artifact.sha256 !== "string" ||
                typeof artifact.install !== "string"
            ) {
                fail(`lock target ${target} has no complete artifact for ${id}`);
            }
            const install = artifact.install;
            const recipe = declared.build?.recipe ?? "not recorded";
            return {
                id,
                version: resolved.version,
                license: resolved.license,
                source: resolved.source,
                artifact,
                install,
                recipe,
                provides: declared.provides ?? [],
            };
        });
}

function noticesFor({ tag, target, manifest, lock, components, repository }) {
    const rows = components.map(
        (component) =>
            `| ${code(component.id)} | ${cell(component.version)} | ${cell(component.license)} | ${cell(component.provides.join(", "))} | ${code(component.install)} |`,
    );
    return `# Third-party notices

Av1ation Station ${tag} for ${target}. Toolchain revision ${manifest.revision}; lock ${lock.manifest_sha256}.

This index covers the top-level components recorded in \`packaging/toolchain.lock.json\`; each
row's licence identifier is the reviewed expression in \`packaging/toolchain.json\`. The
VapourSynth row carries a CPython runtime and third-party plugin wheels whose transitive
notices remain a publication gate; their package metadata is inside the staged Python tree.

| Component | Version | Licence | Provides | Installed at |
| --- | --- | --- | --- | --- |
${rows.join("\n")}

The exact source revision, build recipe, and artifact digest for each component are in
\`SOURCE-OFFER.md\`. Upstream licence texts are available from the source locations named
there. This file is generated from the lock; do not edit it by hand.

Source repository: https://github.com/${repository}
`;
}

function sourceOfferFor({ tag, target, manifest, lock, components, repository }) {
    const gplComponents = components.filter((component) =>
        String(component.license).includes("GPL"),
    );
    const gplRows = gplComponents.map(
        (component) =>
            `| ${code(component.id)} | ${cell(component.version)} | ${cell(component.license)} | ${cell(sourceDescription(component.source))} | ${code(component.recipe)} | ${code(component.artifact.sha256)} |`,
    );
    const allRows = components.map(
        (component) =>
            `| ${code(component.id)} | ${cell(sourceDescription(component.source))} | ${code(component.recipe)} | ${code(component.artifact.url)} |`,
    );
    const tagUrl = `https://github.com/${repository}/tree/${encodeURIComponent(tag)}`;
    return `# Source offer

Av1ation Station is distributed under GPL-3.0. The corresponding source for the application
is the source tree at ${tagUrl} (tag ${tag}); the upstream sources for the top-level bundled
components are listed below.

This target is ${target}; toolchain revision ${manifest.revision}; lock ${lock.manifest_sha256}.
The recipes apply only patches committed beside them in the tagged source tree.

This offer covers the top-level components in \`packaging/toolchain.json\`. The VapourSynth
row bundles CPython, VapourSynth, vsjetpack, and their wheels; their transitive package
notices and licence texts remain a publication gate. The fmetrics fork commit is listed
above, and its Windows portability patch is applied by \`packaging/recipes/fmetrics.mjs\`.

## GPL and LGPL components

These components require corresponding source. The source revision, recipe, and built
artifact digest are recorded here so the source can be obtained and checked without trusting
a mutable download page.

| Component | Version | Licence | Source revision | Recipe | Artifact SHA-256 |
| --- | --- | --- | --- | --- | --- |
${gplRows.join("\n")}

## All resolved components

| Component | Source revision | Recipe | Artifact source |
| --- | --- | --- | --- |
${allRows.join("\n")}

Build the source with the named recipe from the tagged repository. The build reads no
mutable branch or latest asset; the lock records the exact resolved bytes for this target.

Source repository: https://github.com/${repository}
`;
}

function sbomFor({ tag, target, manifest, lock, components, repository }) {
    const created = new Date().toISOString();
    const packages = components.map((component) => ({
        name: component.id,
        SPDXID: spdxId(component.id),
        versionInfo: component.version,
        packageFileName: component.install,
        downloadLocation: downloadLocation(component.source),
        filesAnalyzed: false,
        checksums: [
            {
                algorithm: "SHA256",
                checksumValue: component.artifact.sha256,
            },
        ],
        licenseConcluded: "NOASSERTION",
        licenseDeclared: spdxLicense(component.license),
        copyrightText: "NOASSERTION",
        supplier: "NOASSERTION",
        sourceInfo: `Toolchain revision ${manifest.revision}; recipe ${component.recipe}; artifact ${component.artifact.url}`,
    }));
    return {
        spdxVersion: "SPDX-2.3",
        dataLicense: "CC0-1.0",
        SPDXID: "SPDXRef-DOCUMENT",
        name: `Av1ation Station ${tag} ${target}`,
        documentNamespace: `https://github.com/${repository}/spdx/${encodeURIComponent(tag)}/${target}/${lock.manifest_sha256}`,
        creationInfo: {
            created,
            creators: ["Tool: av1ation-release-audit"],
        },
        comment:
            "Top-level components from packaging/toolchain.json; transitive Python and plugin packages are not enumerated in this revision.",
        documentDescribes: packages.map((pkg) => pkg.SPDXID),
        packages,
        relationships: packages.map((pkg) => ({
            spdxElementId: "SPDXRef-DOCUMENT",
            relationshipType: "DESCRIBES",
            relatedSpdxElement: pkg.SPDXID,
        })),
    };
}

/**
 * Write the audit bundle for every target the lock resolves.
 *
 * The output is disposable build evidence under `dist/`; the lock and manifest remain the
 * reviewed inputs. Existing target directories are replaced so a stale target cannot survive
 * a lock update.
 */
export function generateAuditBundle({
    root = projectRoot,
    tag,
    outDir = DEFAULT_OUTPUT,
    repository = process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY,
} = {}) {
    const resolvedRoot = resolve(root);
    let release;
    try {
        release = parseReleaseTag(tag);
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }

    const manifestPath = join(resolvedRoot, "packaging", "toolchain.json");
    const lockPath = join(resolvedRoot, "packaging", "toolchain.lock.json");
    const manifest = readJson(manifestPath, "toolchain manifest");
    const manifestText = readFileSync(manifestPath, "utf8");
    const lock = readJson(lockPath, "toolchain lock");
    if (manifest.schema_version !== 1 || lock.schema_version !== 1) {
        fail("the toolchain manifest and lock must use schema_version 1");
    }
    if (manifest.revision !== lock.revision) {
        fail(
            `toolchain lock revision ${String(lock.revision)} does not match manifest revision ${String(manifest.revision)}`,
        );
    }
    const manifestHash = createHash("sha256").update(manifestText).digest("hex");
    if (manifestHash !== lock.manifest_sha256) {
        fail("toolchain lock does not hash the current manifest");
    }
    if (!Array.isArray(manifest.components) || manifest.components.length === 0) {
        fail("toolchain manifest has no components");
    }
    const manifestById = new Map();
    for (const component of manifest.components) {
        if (manifestById.has(component.id)) {
            fail(`toolchain manifest has a duplicate component id: ${component.id}`);
        }
        manifestById.set(component.id, component);
    }
    for (const target of TARGETS) {
        if (lock.targets?.[target] === undefined) {
            fail(`toolchain lock is missing target ${target}`);
        }
    }

    const outputRoot = resolve(resolvedRoot, outDir);
    mkdirSync(outputRoot, { recursive: true });
    const generated = [];
    for (const target of TARGETS) {
        const targetDirectory = join(outputRoot, target);
        rmSync(targetDirectory, { recursive: true, force: true });
        mkdirSync(targetDirectory, { recursive: true });
        copyFileSync(lockPath, join(targetDirectory, "toolchain.lock.json"));

        const components = componentRows({ lock, manifestById, target });
        if (components.length === 0) {
            fail(`toolchain lock target ${target} has no components`);
        }
        writeFileSync(
            join(targetDirectory, "THIRD_PARTY_NOTICES.md"),
            noticesFor({ tag: release.tag, target, manifest, lock, components, repository }),
        );
        writeFileSync(
            join(targetDirectory, "SOURCE-OFFER.md"),
            sourceOfferFor({ tag: release.tag, target, manifest, lock, components, repository }),
        );
        writeFileSync(
            join(targetDirectory, "sbom.spdx.json"),
            `${JSON.stringify(
                sbomFor({ tag: release.tag, target, manifest, lock, components, repository }),
                null,
                2,
            )}\n`,
        );
        generated.push({ target, components: components.length, directory: targetDirectory });
    }
    return { outputRoot, tag: release.tag, targets: generated };
}

function requiredValue(argv, index, option) {
    const value = argv[index + 1];
    if (typeof value !== "string" || value.trim() === "" || value.startsWith("--")) {
        fail(`${option} must be followed by a value`);
    }
    return value.trim();
}

function parseCli(argv) {
    const options = { tag: undefined, outDir: DEFAULT_OUTPUT, root: projectRoot, help: false };
    for (let index = 0; index < argv.length; index += 1) {
        switch (argv[index]) {
            case "--tag":
                options.tag = requiredValue(argv, index, "--tag");
                index += 1;
                break;
            case "--out":
                options.outDir = requiredValue(argv, index, "--out");
                index += 1;
                break;
            case "--root":
                options.root = requiredValue(argv, index, "--root");
                index += 1;
                break;
            case "--help":
                options.help = true;
                break;
            default:
                fail(`unknown argument: ${argv[index]}`);
        }
    }
    if (!options.help && options.tag === undefined) {
        fail("--tag is required; pass v<semver>, v<semver>-rc.<n>, or v<semver>-weekly.YYYYMMDD");
    }
    return options;
}

function main() {
    const options = parseCli(process.argv.slice(2));
    if (options.help) {
        console.log(`Usage: npm run release:audit -- --tag <tag> [options]

Write each target's lock copy, third-party notices, SPDX 2.3 SBOM, and source offer.

Options:
  --tag <tag>    v<semver>, v<semver>-rc.<n>, or v<semver>-weekly.YYYYMMDD
  --out <dir>    Output root (default: ${DEFAULT_OUTPUT})
  --root <dir>   Repository root (default: ${projectRoot})
  --help         Show this help`);
        return;
    }
    const result = generateAuditBundle(options);
    for (const target of result.targets) {
        console.log(
            `audit: ${target.target} (${String(target.components)} components) -> ${target.directory}`,
        );
    }
    console.log(`Audit bundle: ${result.outputRoot}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
