// Collect the Python packages installed in a staged toolchain target and turn them into
// reviewed notice and licence-text artifacts for the release audit bundle.
//
// The staged tree, not a requirements file, is the source of truth: it is what the installer
// carries. A package without a licence expression and a bundled licence text fails the audit
// unless a reviewed override supplies the missing evidence. This keeps a transitive package
// from entering a release without a traceable licence.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { projectRoot } from "./build-paths.mjs";

export const PYTHON_NOTICES_FILE = "PYTHON_NOTICES.md";
export const PYTHON_LICENSES_FILE = "PYTHON-LICENSES.txt";
export const OVERRIDES_FILE = join("packaging", "python-license-overrides.json");

const LICENSE_FILE_PATTERN = /^(?:licen[cs]e|copying|notice|copyright|authors?)(?:[._-].*)?$/iu;
const CLASSIFIER_LICENSES = new Map([
    ["MIT License", "MIT"],
    ["Apache Software License", "Apache-2.0"],
    ["BSD License", "BSD-3-Clause"],
    ["Mozilla Public License 2.0 (MPL 2.0)", "MPL-2.0"],
    ["GNU Lesser General Public License v3 (LGPLv3)", "LGPL-3.0-only"],
]);

function fail(message) {
    throw new Error(message);
}

function normalizeName(name) {
    return String(name)
        .toLowerCase()
        .replace(/[-_.]+/gu, "-");
}

function packageKey(name, version) {
    return `${normalizeName(name)}@${String(version)}`;
}

function parseMetadata(text) {
    const headers = new Map();
    const lines = text.replace(/\r\n?/gu, "\n").split("\n");
    let current = null;
    for (const line of lines) {
        if (line === "") {
            break;
        }
        if (/^[ \t]/u.test(line) && current !== null) {
            const values = headers.get(current);
            values[values.length - 1] += `\n${line.trim()}`;
            continue;
        }
        const match = /^([!-9;-~]+):[ \t]*(.*)$/u.exec(line);
        if (match === null) {
            current = null;
            continue;
        }
        current = match[1];
        const values = headers.get(current) ?? [];
        values.push(match[2]);
        headers.set(current, values);
    }
    return headers;
}

function headerValues(headers, name) {
    return headers.get(name) ?? [];
}

function headerValue(headers, name) {
    return (
        headerValues(headers, name)
            .find((value) => value.trim() !== "")
            ?.trim() ?? null
    );
}

function sourceFor(headers) {
    const projectUrls = headerValues(headers, "Project-URL");
    const preferred = ["source", "repository", "homepage", "documentation"];
    for (const label of preferred) {
        for (const value of projectUrls) {
            const match = /^([^,]+),\s*(.+)$/u.exec(value);
            if (match !== null && match[1].trim().toLowerCase() === label) {
                return match[2].trim();
            }
        }
    }
    const firstUrl = projectUrls.find((value) => /^[^,]+,\s*https?:\/\//u.test(value));
    if (firstUrl !== undefined) {
        const match = /^[^,]+,\s*(.+)$/u.exec(firstUrl);
        if (match !== null) {
            return match[1].trim();
        }
    }
    return headerValue(headers, "Home-page");
}

function licenseFromHeaders(headers) {
    const expression = headerValue(headers, "License-Expression");
    if (expression !== null && expression !== "UNKNOWN") {
        return expression;
    }
    const declared = headerValue(headers, "License");
    if (
        declared !== null &&
        declared !== "UNKNOWN" &&
        declared.length <= 200 &&
        !/copyright/iu.test(declared)
    ) {
        return declared;
    }
    for (const classifier of headerValues(headers, "Classifier")) {
        if (!classifier.startsWith("License ::")) {
            continue;
        }
        const value = classifier.split("::").at(-1)?.trim() ?? "";
        const mapped = CLASSIFIER_LICENSES.get(value);
        if (mapped !== undefined) {
            return mapped;
        }
    }
    return null;
}

function inferLicenseFromText(text) {
    if (/GNU LESSER GENERAL PUBLIC LICENSE[\s\S]*Version 3/iu.test(text)) {
        return "LGPL-3.0-or-later";
    }
    if (/GNU LESSER GENERAL PUBLIC LICENSE[\s\S]*Version 2\.1/iu.test(text)) {
        return "LGPL-2.1-or-later";
    }
    if (/GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3/iu.test(text)) {
        return "GPL-3.0-or-later";
    }
    if (/GNU GENERAL PUBLIC LICENSE[\s\S]*Version 2/iu.test(text)) {
        return "GPL-2.0";
    }
    if (/Apache License[\s\S]*Version 2\.0/iu.test(text)) {
        return "Apache-2.0";
    }
    if (/Permission is hereby granted, free of charge/iu.test(text)) {
        return "MIT";
    }
    if (/Mozilla Public License Version 2\.0/iu.test(text)) {
        return "MPL-2.0";
    }
    if (/Redistribution and use in source and binary forms/iu.test(text)) {
        return /Neither the name|endorse or promote/iu.test(text) ? "BSD-3-Clause" : "BSD-2-Clause";
    }
    if (/Permission to use, copy, modify, and\/or distribute this software/iu.test(text)) {
        return "ISC";
    }
    return null;
}

function collectFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectFiles(path));
        } else if (entry.isFile()) {
            files.push(path);
        }
    }
    return files;
}

function findLicenseFiles(distInfo, headers) {
    const files = collectFiles(distInfo);
    const selected = new Set();
    for (const declared of headerValues(headers, "License-File")) {
        const value = declared.trim();
        if (value === "") {
            continue;
        }
        const direct = join(distInfo, value);
        if (existsSync(direct) && statSync(direct).isFile()) {
            selected.add(direct);
            continue;
        }
        const basename = value.split(/[\\/]/u).at(-1);
        const match = files.find((path) => path.split(sep).at(-1) === basename);
        if (match !== undefined) {
            selected.add(match);
        }
    }
    for (const path of files) {
        const segments = relative(distInfo, path).split(sep);
        if (
            segments.some((segment) => segment.toLowerCase() === "licenses") ||
            LICENSE_FILE_PATTERN.test(segments.at(-1) ?? "")
        ) {
            selected.add(path);
        }
    }
    return [...selected].sort();
}

function readOverrides(root) {
    const path = resolve(root, OVERRIDES_FILE);
    if (!existsSync(path)) {
        return new Map();
    }
    let record;
    try {
        record = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        fail(
            `could not read ${OVERRIDES_FILE}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    if (
        record?.schema_version !== 1 ||
        typeof record.packages !== "object" ||
        record.packages === null
    ) {
        fail(`${OVERRIDES_FILE} must use schema_version 1 and a packages object`);
    }
    const overrides = new Map();
    for (const [key, entry] of Object.entries(record.packages)) {
        if (typeof entry?.license !== "string" || entry.license.trim() === "") {
            fail(`${OVERRIDES_FILE} entry ${key} needs a non-empty license`);
        }
        if (
            entry.license_texts !== undefined &&
            (!Array.isArray(entry.license_texts) ||
                entry.license_texts.some(
                    (value) => typeof value !== "string" || value.trim() === "",
                ))
        ) {
            fail(`${OVERRIDES_FILE} entry ${key} has invalid license_texts`);
        }
        overrides.set(key, entry);
    }
    return overrides;
}

function findSitePackages(targetRoot, target) {
    const roots = [
        join(targetRoot, "tools", "python", "Lib", "site-packages"),
        join(targetRoot, "tools", "python", "lib"),
    ];
    if (!existsSync(roots[0])) {
        const lib = roots[1];
        if (existsSync(lib)) {
            for (const entry of readdirSync(lib, { withFileTypes: true })) {
                if (entry.isDirectory() && /^python3\.\d+$/u.test(entry.name)) {
                    const candidate = join(lib, entry.name, "site-packages");
                    if (existsSync(candidate)) {
                        return candidate;
                    }
                }
            }
        }
        fail(`staged target ${target} has no Python site-packages under ${targetRoot}`);
    }
    return roots[0];
}

function sha256(text) {
    return createHash("sha256").update(text).digest("hex");
}

function escapeCell(value) {
    return String(value).replaceAll("|", "\\|").replace(/\r?\n/gu, " ");
}

/**
 * Read every Python distribution in one target's staged tree.
 *
 * The package set is derived from the `.dist-info` directories that the installer carries,
 * not from a separate dependency list. Each package needs a licence expression and at least
 * one licence text, either bundled in the wheel or supplied by the reviewed override file.
 */
export function collectPythonPackages({ targetRoot, target, root = projectRoot } = {}) {
    if (typeof targetRoot !== "string" || targetRoot === "") {
        fail("a staged target root is required");
    }
    if (typeof target !== "string" || target === "") {
        fail("a target name is required");
    }
    const resolvedTargetRoot = resolve(targetRoot);
    const sitePackages = findSitePackages(resolvedTargetRoot, target);
    const overrides = readOverrides(root);
    const packages = [];
    for (const entry of readdirSync(sitePackages, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.endsWith(".dist-info")) {
            continue;
        }
        const distInfo = join(sitePackages, entry.name);
        const metadataPath = join(distInfo, "METADATA");
        if (!existsSync(metadataPath)) {
            fail(`${target} package ${entry.name} has no METADATA`);
        }
        const headers = parseMetadata(readFileSync(metadataPath, "utf8"));
        const name = headerValue(headers, "Name") ?? entry.name.replace(/\.dist-info$/u, "");
        const version = headerValue(headers, "Version") ?? "unknown";
        const key = packageKey(name, version);
        const override = overrides.get(key);
        const bundled = findLicenseFiles(distInfo, headers).map((path) => ({
            file: relative(distInfo, path).split(sep).join("/"),
            content: readFileSync(path, "utf8"),
            origin: "bundled",
        }));
        const overrideTexts = (override?.license_texts ?? []).map((value) => {
            const path = resolve(root, value);
            if (!existsSync(path)) {
                fail(`${OVERRIDES_FILE} entry ${key} names a missing licence text: ${value}`);
            }
            return {
                file: value.split(sep).join("/"),
                content: readFileSync(path, "utf8"),
                origin: "override",
            };
        });
        const licenseTexts = [...bundled, ...overrideTexts];
        const declared = override?.license ?? licenseFromHeaders(headers);
        const inferred =
            declared ??
            (licenseTexts.length > 0 ? inferLicenseFromText(licenseTexts[0].content) : null);
        if (inferred === null) {
            fail(`${target} package ${key} has no licence expression or bundled licence text`);
        }
        if (licenseTexts.length === 0) {
            fail(`${target} package ${key} has no bundled licence text`);
        }
        packages.push({
            name,
            version,
            license: inferred,
            source:
                override?.source ??
                sourceFor(headers) ??
                `https://pypi.org/project/${name}/${version}/`,
            licenseTexts: licenseTexts.map((item) => ({
                ...item,
                sha256: sha256(item.content),
            })),
        });
    }
    if (packages.length === 0) {
        fail(`staged target ${target} has no Python distributions`);
    }
    packages.sort((left, right) =>
        `${left.name}\0${left.version}`.localeCompare(`${right.name}\0${right.version}`),
    );
    return packages;
}

function renderNotices({ tag, target, packages }) {
    const rows = packages.map(
        (pkg) =>
            `| \`${escapeCell(pkg.name)}\` | ${escapeCell(pkg.version)} | ${escapeCell(pkg.license)} | ${escapeCell(pkg.source)} | ${String(pkg.licenseTexts.length)} |`,
    );
    return `# Python and plugin notices

Av1ation Station ${tag} for ${target}.

This file covers every Python distribution installed in the staged CPython tree, including
the VapourSynth runtime and plugin wheels. The package set and versions are read from the
target's \`.dist-info\` metadata; bundled licence texts and reviewed overrides are reproduced
in \`PYTHON-LICENSES.txt\`.

| Package | Version | Licence | Source | Licence texts |
| --- | --- | --- | --- | --- |
${rows.join("\n")}

Every package above has a licence expression and at least one licence text. The aggregate
licence-text bundle records the SHA-256 of each text. This file is generated from the staged
target tree; do not edit it by hand.

Source repository: https://github.com/Av1ation-Association/Av1ation-Station
`;
}

function renderLicenseTexts({ tag, target, packages }) {
    const sections = packages.map((pkg) => {
        const texts = pkg.licenseTexts
            .map(
                (text) =>
                    `--- ${pkg.name} ${pkg.version}: ${text.file} (${text.origin}, SHA-256 ${text.sha256}) ---\n\n${text.content.trimEnd()}\n`,
            )
            .join("\n");
        return `===== ${pkg.name} ${pkg.version} — ${pkg.license} =====\n\nSource: ${pkg.source}\n\n${texts}`;
    });
    return `# Python and plugin licence texts

Av1ation Station ${tag} for ${target}. These texts are reproduced from the staged Python
packages named in \`PYTHON_NOTICES.md\`; reviewed overrides are marked as such.

${sections.join("\n")}
`;
}

/**
 * Write the two Python notice artifacts into a target audit directory.
 *
 * Returns the number of packages and licence texts so the caller can report coverage.
 */
export function writePythonNotices({
    targetRoot,
    target,
    tag,
    outputDirectory,
    root = projectRoot,
} = {}) {
    const packages = collectPythonPackages({ targetRoot, target, root });
    const notices = renderNotices({ tag, target, packages });
    const licenseTexts = renderLicenseTexts({ tag, target, packages });
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(join(outputDirectory, PYTHON_NOTICES_FILE), notices, "utf8");
    writeFileSync(join(outputDirectory, PYTHON_LICENSES_FILE), licenseTexts, "utf8");
    return {
        packages: packages.length,
        licenseTexts: packages.reduce((total, pkg) => total + pkg.licenseTexts.length, 0),
    };
}
