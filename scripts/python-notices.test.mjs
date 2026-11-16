import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { collectPythonPackages, writePythonNotices } from "./python-notices.mjs";

const roots = [];

function writeFile(path, content) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content, "utf8");
}

function fixture() {
    const root = mkdtempSync(join(tmpdir(), "av1ation-python-notices-"));
    roots.push(root);
    const targetRoot = join(root, "target");
    const sitePackages = join(targetRoot, "tools", "python", "Lib", "site-packages");
    writeFile(
        join(sitePackages, "demo-1.0.dist-info", "METADATA"),
        "Metadata-Version: 2.4\nName: demo\nVersion: 1.0\nLicense-Expression: MIT\n\nDemo\n",
    );
    writeFile(
        join(sitePackages, "demo-1.0.dist-info", "licenses", "LICENSE"),
        "MIT licence for demo\n",
    );
    writeFile(
        join(sitePackages, "plugin-2.0.dist-info", "METADATA"),
        "Metadata-Version: 2.4\nName: plugin\nVersion: 2.0\nClassifier: License :: OSI Approved :: MIT License\n\nPlugin\n",
    );
    writeFile(join(sitePackages, "plugin-2.0.dist-info", "COPYING"), "MIT licence for plugin\n");
    return { root, targetRoot };
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("Python notice collection", () => {
    it("reads every distribution from the staged tree and requires licence evidence", () => {
        const { root, targetRoot } = fixture();

        const packages = collectPythonPackages({ targetRoot, target: "test-target", root });

        expect(packages.map((pkg) => `${pkg.name}@${pkg.version}`)).toEqual([
            "demo@1.0",
            "plugin@2.0",
        ]);
        for (const pkg of packages) {
            expect(pkg.license).toBe("MIT");
            expect(pkg.licenseTexts).toHaveLength(1);
            expect(pkg.licenseTexts[0].sha256).toMatch(/^[0-9a-f]{64}$/u);
        }
    });

    it("writes notices and a licence-text bundle into the audit directory", () => {
        const { root, targetRoot } = fixture();
        const output = join(root, "audit");

        const result = writePythonNotices({
            targetRoot,
            target: "test-target",
            tag: "v0.1.0",
            outputDirectory: output,
            root,
        });

        expect(result).toEqual({ packages: 2, licenseTexts: 2 });
        const notices = readFileSync(join(output, "PYTHON_NOTICES.md"), "utf8");
        expect(notices).toContain("demo");
        expect(notices).toContain("plugin");
        expect(notices).toContain("test-target");
        const texts = readFileSync(join(output, "PYTHON-LICENSES.txt"), "utf8");
        expect(texts).toContain("MIT licence for demo");
        expect(texts).toContain("MIT licence for plugin");
        expect(texts).toContain("SHA-256");
    });

    it("fails closed when a package has no licence expression or text", () => {
        const { root, targetRoot } = fixture();
        const sitePackages = join(targetRoot, "tools", "python", "Lib", "site-packages");
        writeFile(
            join(sitePackages, "unknown-3.0.dist-info", "METADATA"),
            "Metadata-Version: 2.4\nName: unknown\nVersion: 3.0\n\nUnknown\n",
        );

        expect(() => collectPythonPackages({ targetRoot, target: "test-target", root })).toThrow(
            /unknown@3\.0 has no licence expression/u,
        );
    });
});
