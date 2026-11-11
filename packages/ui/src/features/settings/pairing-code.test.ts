import { describe, expect, it } from "vitest";

import { pairingCode } from "./pairing-code";

describe("pairingCode", () => {
    it("normalizes a displayed, lowercase, or spaced code", () => {
        expect(pairingCode("ABCD-EFGH")).toBe("ABCDEFGH");
        expect(pairingCode("abcd-efgh")).toBe("ABCDEFGH");
        expect(pairingCode("ABCD EFGH")).toBe("ABCDEFGH");
    });

    it("rejects ambiguous or wrong-length values", () => {
        expect(pairingCode("ABCD-EFG0")).toBeNull();
        expect(pairingCode("ABCD-EFGI")).toBeNull();
        expect(pairingCode("ABCD-EFG")).toBeNull();
        expect(pairingCode("a bearer token")).toBeNull();
    });
});
