import { afterEach, describe, expect, it, vi } from "vitest";

import { randomId } from "./random-id";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("randomId", () => {
    it("uses randomUUID when the runtime provides it", () => {
        vi.stubGlobal("crypto", { randomUUID: () => "draft-uuid" });

        expect(randomId()).toBe("draft-uuid");
    });

    it("uses getRandomValues when randomUUID is unavailable", () => {
        const bytes = new Uint8Array(16).fill(0xab);
        vi.stubGlobal("crypto", { getRandomValues: () => bytes });

        expect(randomId()).toBe("ab".repeat(16));
    });

    it("keeps working when Web Crypto is unavailable", () => {
        vi.stubGlobal("crypto", undefined);

        expect(randomId()).toMatch(/^[a-z0-9]+-[a-z0-9]+$/u);
    });
});
