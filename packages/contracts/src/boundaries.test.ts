/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";

import { BOUNDARY_FIXTURES } from "./boundaries";

/**
 * Every fixture is discovered from disk, not from the registry, so an unregistered file is
 * visible. The registry is the hand-maintained claim; this test makes the two sets equal.
 */
const fixtureModules = import.meta.glob("./fixtures/boundary/**/*.json", {
    eager: true,
    query: "?raw",
    import: "default",
}) as Record<string, string>;

describe("boundary fixtures", () => {
    it("parses every registered fixture against its generated schema", () => {
        for (const entry of BOUNDARY_FIXTURES) {
            const parsed = entry.schema.safeParse(entry.fixture);
            expect(
                parsed.success,
                parsed.success
                    ? entry.name
                    : `${entry.name}: ${parsed.error.issues
                          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
                          .join("; ")}`,
            ).toBe(true);
        }
    });

    it("has no registered fixture missing from disk", () => {
        const registered = new Set(
            BOUNDARY_FIXTURES.map((entry) => `./fixtures/boundary/${entry.fixturePath}`),
        );
        const discovered = new Set(Object.keys(fixtureModules));
        expect([...registered].filter((path) => !discovered.has(path))).toEqual([]);
    });

    it("has no fixture on disk that the registry does not claim", () => {
        const registered = new Set(
            BOUNDARY_FIXTURES.map((entry) => `./fixtures/boundary/${entry.fixturePath}`),
        );
        const discovered = new Set(Object.keys(fixtureModules));
        expect([...discovered].filter((path) => !registered.has(path))).toEqual([]);
    });

    it("names every boundary once", () => {
        const names = BOUNDARY_FIXTURES.map((entry) => entry.name);
        expect(new Set(names).size).toBe(names.length);
    });
});
