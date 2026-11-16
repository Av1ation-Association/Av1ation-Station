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

    it("does not leave the hero wordmark at zero opacity", () => {
        const css = withoutComments(readFileSync(join(projectRoot, STYLESHEETS[0]), "utf8"));
        const block =
            [...css.matchAll(/\.brand-lockup__word\s*\{([^}]*)\}/gu)]
                .map((match) => match[1])
                .find((candidate) => candidate.includes("animation-duration")) ?? "";
        expect(block).toMatch(/opacity:\s*1\s*;/u);
        expect(block).toMatch(/animation-duration\s*:/u);
        expect(block).toMatch(/animation-fill-mode\s*:/u);
    });
});
