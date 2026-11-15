import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkBundleSize, HOSTS, initialScriptReferences } from "./check-bundle-size.mjs";

const directories = [];

function writeFile(path, content) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
}

function fixture(hosts = HOSTS) {
    const root = mkdtempSync(join(tmpdir(), "av1ation-bundle-"));
    directories.push(root);
    for (const host of hosts) {
        writeFile(
            join(root, host, "index.html"),
            [
                "<!doctype html>",
                `<script type="module" src="/assets/entry.js"></script>`,
                `<link rel="modulepreload" href="/assets/vendor.js">`,
                `<link rel="stylesheet" href="/assets/app.css">`,
            ].join("\n"),
        );
        writeFile(join(root, host, "assets", "entry.js"), `console.log("${host}");\n`);
        writeFile(join(root, host, "assets", "vendor.js"), "export const vendor = true;\n");
        writeFile(join(root, host, "assets", "app.css"), "body { color: black; }\n");
    }
    return root;
}

afterEach(() => {
    for (const directory of directories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe("bundle-size gate", () => {
    it("reads the module entry and modulepreload links, never stylesheets", () => {
        expect(
            initialScriptReferences(
                [
                    '<script type="module" src="./assets/entry.js"></script>',
                    '<link rel="modulepreload" href="/assets/vendor.js">',
                    '<link rel="modulepreload stylesheet" href="/assets/extra.js">',
                    '<link rel="stylesheet" href="/assets/app.css">',
                    '<script src="/assets/classic.js"></script>',
                ].join("\n"),
            ),
        ).toEqual(["./assets/entry.js", "/assets/extra.js", "/assets/vendor.js"]);
    });

    it("passes when every host is within the budget", () => {
        const result = checkBundleSize({ root: fixture(), budgetBytes: 1_000_000 });

        expect(result.failures).toEqual([]);
        expect(result.reports.map((report) => report.host)).toEqual(HOSTS);
        expect(result.reports.every((report) => report.assets.length === 2)).toBe(true);
    });

    it("does not count unreferenced lazy Monaco or ECharts chunks", () => {
        const root = fixture();
        for (const host of HOSTS) {
            writeFile(join(root, host, "assets", "editor.api-lazy.js"), "x".repeat(2_000_000));
            writeFile(join(root, host, "assets", "echarts-lazy.js"), "x".repeat(2_000_000));
        }

        const result = checkBundleSize({ root, budgetBytes: 10_000 });

        expect(result.failures).toEqual([]);
        expect(result.reports[0].assets.map((asset) => asset.file)).toEqual([
            "assets/entry.js",
            "assets/vendor.js",
        ]);
    });

    it("fails every host over the budget and reports the measured total", () => {
        const result = checkBundleSize({ root: fixture(), budgetBytes: 1 });

        expect(result.reports).toHaveLength(HOSTS.length);
        expect(result.failures).toHaveLength(HOSTS.length);
        expect(result.failures[0].message).toMatch(/exceeds the 0\.0 KB budget/u);
        expect(result.reports[0].totalBytes).toBeGreaterThan(1);
    });

    it("fails loudly when the build or a referenced asset is missing", () => {
        const root = fixture(["desktop"]);
        rmSync(join(root, "desktop", "assets", "vendor.js"));

        const result = checkBundleSize({ root, hosts: ["desktop", "web"], budgetBytes: 1_000_000 });

        expect(result.reports).toEqual([]);
        expect(result.failures).toHaveLength(2);
        expect(result.failures[0].message).toMatch(/Missing initial script/u);
        expect(result.failures[1].message).toMatch(/Missing .*index\.html/u);
    });

    it("produces the same measurement for the same output", () => {
        const root = fixture();

        const first = checkBundleSize({ root, budgetBytes: 1_000_000 });
        const second = checkBundleSize({ root, budgetBytes: 1_000_000 });

        expect(second.reports.map((report) => report.totalBytes)).toEqual(
            first.reports.map((report) => report.totalBytes),
        );
    });
});
