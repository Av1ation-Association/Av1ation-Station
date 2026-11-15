import { describe, expect, it } from "vitest";

import { DOCS_CAPTURES, isDocsCapture } from "./captures";

describe("docs capture inventory", () => {
    it("declares sixty unique captures", () => {
        expect(DOCS_CAPTURES).toHaveLength(60);
        expect(new Set(DOCS_CAPTURES).size).toBe(60);
    });

    it("admits only declared capture ids", () => {
        expect(isDocsCapture("home")).toBe(true);
        expect(isDocsCapture("not-a-capture")).toBe(false);
    });

});
