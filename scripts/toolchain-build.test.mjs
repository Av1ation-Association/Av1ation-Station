import { describe, expect, it } from "vitest";

import { cacheKeyFor } from "./toolchain-build.mjs";

const component = {
    id: "encoder:test",
    version: "1.0.0",
    source: { kind: "git", url: "https://example.com/test.git", commit: "a".repeat(40) },
};
const recipe = Buffer.from("export default async function build() {}\n");
const helper = Buffer.from("export const helper = true;\n");
const engine = Buffer.from("engine version 1\n");

describe("toolchain component cache keys", () => {
    it("is stable for the same component, target and recipe bytes", () => {
        const first = cacheKeyFor(component, "x86_64-unknown-linux-gnu", recipe, helper, engine);
        const second = cacheKeyFor(
            structuredClone(component),
            "x86_64-unknown-linux-gnu",
            recipe,
            helper,
            engine,
        );

        expect(first).toBe(second);
        expect(first).toMatch(/^[a-f0-9]{64}$/u);
    });

    it("changes when the target, component, recipe, helper or builder changes", () => {
        const base = cacheKeyFor(component, "x86_64-unknown-linux-gnu", recipe, helper, engine);

        expect(cacheKeyFor(component, "aarch64-apple-darwin", recipe, helper, engine)).not.toBe(
            base,
        );
        expect(
            cacheKeyFor(
                { ...component, version: "1.0.1" },
                "x86_64-unknown-linux-gnu",
                recipe,
                helper,
                engine,
            ),
        ).not.toBe(base);
        expect(
            cacheKeyFor(
                component,
                "x86_64-unknown-linux-gnu",
                Buffer.from("changed"),
                helper,
                engine,
            ),
        ).not.toBe(base);
        expect(
            cacheKeyFor(
                component,
                "x86_64-unknown-linux-gnu",
                recipe,
                Buffer.from("changed"),
                engine,
            ),
        ).not.toBe(base);
        expect(
            cacheKeyFor(
                component,
                "x86_64-unknown-linux-gnu",
                recipe,
                helper,
                Buffer.from("changed"),
            ),
        ).not.toBe(base);
    });
});
