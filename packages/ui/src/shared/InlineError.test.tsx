// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InlineError } from "./InlineError";

afterEach(cleanup);

describe("InlineError", () => {
    it("announces the message as an alert", () => {
        render(<InlineError>The document could not be saved.</InlineError>);

        const alert = screen.getByRole("alert");
        expect(alert.textContent).toBe("The document could not be saved.");
        expect(alert.className).toContain("border-danger/30");
    });

    it("keeps the caller's spacing without dropping its own styles", () => {
        render(<InlineError className="mt-4 mb-0">Rejected</InlineError>);

        const alert = screen.getByRole("alert");
        expect(alert.className).toContain("mt-4");
        expect(alert.className).toContain("mb-0");
        expect(alert.className).toContain("text-[12px]");
    });
});
