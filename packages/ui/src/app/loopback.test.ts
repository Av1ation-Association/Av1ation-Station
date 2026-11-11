import { describe, expect, it } from "vitest";

import { isLoopbackOrigin } from "./loopback";

describe("isLoopbackOrigin", () => {
    it("accepts the local listener and rejects a network origin", () => {
        expect(isLoopbackOrigin("http://127.0.0.1:8731")).toBe(true);
        expect(isLoopbackOrigin("http://localhost:8731")).toBe(true);
        expect(isLoopbackOrigin("http://[::1]:8731")).toBe(true);
        expect(isLoopbackOrigin("http://192.168.1.20:8731")).toBe(false);
        expect(isLoopbackOrigin("https://example.com")).toBe(false);
        expect(isLoopbackOrigin("not a url")).toBe(false);
    });
});
