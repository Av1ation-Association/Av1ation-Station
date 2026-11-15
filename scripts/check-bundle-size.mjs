// Gate the JavaScript a browser downloads before the application can start.
//
// Summing every emitted asset would count route chunks such as Monaco and ECharts, which are
// deliberately lazy. The initial set is exactly the module entry and modulepreload links Vite
// writes into index.html. A fixed gzip level keeps the byte count reproducible instead of
// inheriting a server setting or the Node default.
import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { appsRoot, projectRoot } from "./build-paths.mjs";

/** The reviewed initial-JavaScript budget, in decimal kilobytes. */
export const BUDGET_BYTES = 250_000;
/** A fixed compression level makes the measured byte count deterministic. */
export const GZIP_LEVEL = 6;
/** Every host `npm run build` produces shares the one documented application budget. */
export const HOSTS = ["desktop", "web", "website"];
export const DEFAULT_APPS_ROOT = appsRoot;

const ORIGIN = "https://bundle.invalid";

function attributes(source) {
    const values = {};
    for (const match of source.matchAll(/([^\s=/>]+)\s*=\s*"([^"]*)"/gu)) {
        values[match[1].toLowerCase()] = match[2];
    }
    return values;
}

/**
 * The JavaScript references a browser resolves before it runs the application.
 *
 * Vite emits a module script for the entry and modulepreload links for its static imports.
 * Dynamic route imports are intentionally absent, so Monaco and ECharts stay out of the
 * measurement until a route asks for them.
 */
export function initialScriptReferences(html) {
    const references = new Set();
    for (const match of html.matchAll(/<(script|link)\b([^>]*)>/giu)) {
        const tag = match[1].toLowerCase();
        const attributesByName = attributes(match[2]);
        let reference;
        if (tag === "script" && attributesByName.type?.toLowerCase() === "module") {
            reference = attributesByName.src;
        } else if (
            tag === "link" &&
            attributesByName.rel?.toLowerCase().split(/\s+/u).includes("modulepreload")
        ) {
            reference = attributesByName.href;
        }
        if (reference === undefined) {
            continue;
        }
        const pathname = new URL(reference, ORIGIN).pathname;
        if (/\.m?js$/iu.test(pathname)) {
            references.add(reference);
        }
    }
    return [...references].sort();
}

function localAsset(hostRoot, reference) {
    const url = new URL(reference, ORIGIN);
    if (url.origin !== ORIGIN) {
        throw new Error(`Initial scripts must be local, found ${reference}.`);
    }
    const pathname = decodeURIComponent(url.pathname).replace(/^\/+/u, "");
    const target = resolve(hostRoot, pathname);
    const prefix = hostRoot.endsWith(sep) ? hostRoot : `${hostRoot}${sep}`;
    if (!target.startsWith(prefix)) {
        throw new Error(`Initial script escapes the host output: ${reference}.`);
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
        throw new Error(`Missing initial script ${reference}; run npm run build.`);
    }
    return {
        file: relative(hostRoot, target).split(sep).join("/"),
        path: target,
    };
}

function inspectHost(host, root) {
    const hostRoot = resolve(root, host);
    const indexPath = resolve(hostRoot, "index.html");
    if (!existsSync(indexPath)) {
        throw new Error(`Missing ${indexPath}; run npm run build.`);
    }
    const references = initialScriptReferences(readFileSync(indexPath, "utf8"));
    if (references.length === 0) {
        throw new Error(`No initial module script found in ${indexPath}.`);
    }
    const assets = references.map((reference) => {
        const asset = localAsset(hostRoot, reference);
        return {
            ...asset,
            gzipBytes: gzipSync(readFileSync(asset.path), { level: GZIP_LEVEL }).length,
        };
    });
    return {
        host,
        indexPath: relative(projectRoot, indexPath).split(sep).join("/"),
        assets,
        totalBytes: assets.reduce((total, asset) => total + asset.gzipBytes, 0),
    };
}

/**
 * Measure every built host against the initial-JavaScript budget.
 *
 * A missing build is a failure, not an empty pass: the check runs after `npm run build`, so
 * absent output means the gate never measured anything.
 */
export function checkBundleSize({
    root = DEFAULT_APPS_ROOT,
    hosts = HOSTS,
    budgetBytes = BUDGET_BYTES,
} = {}) {
    const reports = [];
    const failures = [];
    for (const host of hosts) {
        try {
            const report = inspectHost(host, root);
            reports.push(report);
            if (report.totalBytes > budgetBytes) {
                failures.push({
                    host,
                    message: `${(report.totalBytes / 1000).toFixed(1)} KB exceeds the ${(budgetBytes / 1000).toFixed(1)} KB budget.`,
                });
            }
        } catch (error) {
            failures.push({
                host,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return { reports, failures, budgetBytes };
}

function formatKilobytes(bytes) {
    return `${(bytes / 1000).toFixed(1)} KB`;
}

function main() {
    if (process.argv.includes("--help")) {
        console.log(
            "Usage: node scripts/check-bundle-size.mjs\n" +
                "Checks dist/apps/{desktop,web,website}/index.html after npm run build.",
        );
        return;
    }

    const result = checkBundleSize();
    console.log(
        `Initial JavaScript budget: ${formatKilobytes(result.budgetBytes)} gzip per host ` +
            "(entry + modulepreload; lazy Monaco/ECharts chunks excluded)",
    );
    for (const report of result.reports) {
        const withinBudget = report.totalBytes <= result.budgetBytes;
        console.log(
            `  ${withinBudget ? "pass" : "FAIL"}  ${report.host.padEnd(8)} ` +
                `${formatKilobytes(report.totalBytes).padStart(9)}`,
        );
        for (const asset of report.assets) {
            console.log(`        ${formatKilobytes(asset.gzipBytes).padStart(9)}  ${asset.file}`);
        }
    }
    if (result.failures.length > 0) {
        console.error("Bundle-size gate failed:");
        for (const failure of result.failures) {
            console.error(`  ${failure.host}: ${failure.message}`);
        }
        process.exitCode = 1;
    }
}

const invoked =
    process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
    main();
}
