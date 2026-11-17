// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DelimiterReadout } from "./DelimiterReadout";
import { delimiterLabel, readDelimiter } from "./delimiter-label";

afterEach(cleanup);

describe("delimiter label", () => {
    it("renders a space as a glyph and keeps the stored name separate", () => {
        expect(readDelimiter("Space")).toBe("Space");
        expect(delimiterLabel("Space")).toEqual({
            glyph: "␠",
            name: "Space",
            hint: "two argv entries",
            accessibleName: "Space separator, two arguments",
        });
    });

    it("shows the joined character rather than the enum variant", () => {
        expect(readDelimiter({ Joined: "=" })).toEqual({ Joined: "=" });
        expect(delimiterLabel({ Joined: "=" })).toEqual({
            glyph: "=",
            name: "Equals",
            hint: "one argv entry",
            accessibleName: "Equals separator, one argument",
        });
    });

    it("names tab and newline joined delimiters by what they do", () => {
        expect(delimiterLabel({ Joined: "\t" })).toMatchObject({
            glyph: "⇥",
            name: "Tab",
        });
        expect(delimiterLabel({ Joined: "\n" })).toMatchObject({
            glyph: "⏎",
            name: "Return",
        });
    });

    it("exposes one accessible name while showing the glyph", () => {
        render(<DelimiterReadout delimiter={{ Joined: "=" }} />);

        const readout = screen.getByLabelText("Equals separator, one argument");
        expect(readout.textContent).toContain("=");
        expect(readout.textContent).toContain("Equals");
        expect(readout.textContent).not.toContain("Joined");
    });
});
