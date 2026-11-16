// Project one target's reviewed lock into the summary embedded in the service binary.
//
// The service must answer `GET /api/toolchain` without reading the filesystem, so this runs
// at build time and writes only the fields About needs: id, version, licence, source link
// and artifact hash. Installed paths and file inventories stay out of the response.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);

function value(name, fallback) {
    const index = args.indexOf(name);
    return index === -1 ? fallback : args[index + 1];
}

function fail(message) {
    console.error(`toolchain-summary: ${message}`);
    process.exit(1);
}

for (const argument of args) {
    if (argument.startsWith("--") && !["--lock", "--target", "--out"].includes(argument)) {
        fail(`unknown option ${argument}`);
    }
}

const lockPath = resolve(value("--lock", "packaging/toolchain.lock.json"));
const target = value("--target");
const outPath = value("--out");

if (target === undefined) {
    fail("--target is required");
}
if (outPath === undefined) {
    fail("--out is required");
}
if (!existsSync(lockPath)) {
    fail(`lock is missing: ${lockPath}`);
}

let lock;
try {
    lock = JSON.parse(readFileSync(lockPath, "utf8"));
} catch (error) {
    fail(`lock is not valid JSON: ${error.message}`);
}

const targetLock = lock.targets?.[target];
if (targetLock === undefined) {
    fail(`lock has no entry for ${target}`);
}

/** The provenance URL for one component's source declaration. */
function sourceUrl(source) {
    if (source.kind === "pypi") {
        if (source.index !== undefined) {
            return `${source.index.replace(/\/$/u, "")}/${encodeURIComponent(source.project)}/`;
        }
        return `https://pypi.org/project/${encodeURIComponent(source.project)}/${encodeURIComponent(source.version)}/`;
    }
    return source.url;
}

const components = Object.entries(targetLock.components).map(([id, component]) => ({
    id,
    version: component.version,
    license: component.license,
    source_url: sourceUrl(component.source),
    sha256: component.artifact.sha256,
}));

const summary = {
    target,
    revision: lock.revision,
    components,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
