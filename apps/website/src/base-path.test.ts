import { describe, expect, it } from "vitest";

import { withBase, withoutBase } from "./base-path";

describe("website base paths", () => {
    it("keeps root-hosted URLs root-relative", () => {
        expect(withBase("/docs/", "")).toBe("/docs/");
        expect(withBase("/#downloads", "")).toBe("/#downloads");
        expect(withBase("https://example.com/", "")).toBe("https://example.com/");
        expect(withBase("#section", "/Av1ation-Station")).toBe("#section");
    });

    it("prefixes project Pages URLs and strips the prefix for routing", () => {
        const base = "/Av1ation-Station";
        expect(withBase("/docs/guides/edit-scenes", base)).toBe(
            "/Av1ation-Station/docs/guides/edit-scenes",
        );
        expect(withBase("/demo/", base)).toBe("/Av1ation-Station/demo/");
        expect(withoutBase("/Av1ation-Station/docs/guides/edit-scenes", base)).toBe(
            "/docs/guides/edit-scenes",
        );
        expect(withoutBase("/Av1ation-Station", base)).toBe("/");
        expect(withoutBase("/docs", base)).toBe("/docs");
    });
});
