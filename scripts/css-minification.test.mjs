// The production CSS minifier rewrites a name-less animation shorthand to
// `animation: none`. That drops the duration and fill mode while leaving a delayed base
// rule (such as `opacity: 0`) in place, so the element never becomes visible. Keep every
// shorthand explicit about the keyframes it runs.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { projectRoot } from "./build-paths.mjs";

const STYLESHEETS = ["apps/website/src/site/site.css", "packages/ui/src/styles.css"];

function withoutComments(css) {
    return css.replaceAll(/\/\*[\s\S]*?\*\//gu, "");
}

function keyframeNames(css) {
    return new Set([...css.matchAll(/@keyframes\s+([A-Za-z_-][\w-]*)/gu)].map((match) => match[1]));
}

function animationShorthands(css) {
    return [...css.matchAll(/(?:^|[;{])\s*animation\s*:\s*([^;}]+)/gu)].map((match) =>
        match[1].trim(),
    );
}

describe("production CSS minification", () => {
    it("keeps an animation name in every shorthand", () => {
        const missing = [];
        for (const relative of STYLESHEETS) {
            const css = withoutComments(readFileSync(join(projectRoot, relative), "utf8"));
            const names = keyframeNames(css);
            for (const value of animationShorthands(css)) {
                if (value === "none" || value.includes("var(")) {
                    continue;
                }
                const tokens = value.split(/\s+/u);
                if (![...names].some((name) => tokens.includes(name))) {
                    missing.push(`${relative}: animation: ${value}`);
                }
            }
        }
        expect(missing).toEqual([]);
    });

    it("reveals the hero wordmark only after the contrails finish", () => {
        const css = withoutComments(readFileSync(join(projectRoot, STYLESHEETS[0]), "utf8"));
        const base =
            [...css.matchAll(/\.brand-lockup__word\s*\{([^}]*)\}/gu)]
                .map((match) => match[1])
                .find((candidate) => candidate.includes("animation-duration")) ?? "";
        expect(base).toMatch(/opacity:\s*0\s*;/u);
        expect(base).toMatch(/animation-duration\s*:/u);
        expect(base).toMatch(/animation-fill-mode\s*:/u);

        const trailEnds = [
            ...css.matchAll(/\.brand-lockup__trail--(?:upper|lower)\s*\{([^}]*)\}/gu),
        ].map((match) => {
            const values = [...match[1].matchAll(/([\d.]+)ms/gu)].map((value) => Number(value[1]));
            return values[0] + (values[1] ?? 0);
        });
        expect(trailEnds).toHaveLength(2);
        const trailsEnd = Math.max(...trailEnds);

        for (const [selector, delay] of [
            [".brand-lockup__word--av1ation", 1050],
            [".brand-lockup__word--station", 1150],
        ]) {
            const pattern = selector.replaceAll(".", "\\.");
            const block =
                [...css.matchAll(new RegExp(`${pattern}\\s*\\{([^}]*)\\}`, "gu"))]
                    .map((match) => match[1])
                    .find((candidate) => candidate.includes("animation-delay")) ?? "";
            expect(block).toMatch(/animation-name\s*:/u);
            expect(block).toMatch(new RegExp(`animation-delay:\\s*${String(delay)}ms`, "u"));
            expect(Number(delay)).toBeGreaterThanOrEqual(trailsEnd);
        }

        for (const name of ["brand-word-in-up", "brand-word-in-down"]) {
            const block =
                new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`, "u").exec(css)?.[1] ?? "";
            expect(block).toMatch(/from\s*\{[^}]*opacity:\s*0\s*;/u);
            expect(block).toMatch(/to\s*\{[^}]*opacity:\s*1\s*;/u);
        }
    });
});
