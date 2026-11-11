// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SectionCard } from "./SectionCard";

afterEach(cleanup);

describe("SectionCard", () => {
    it("renders a failure band in the card and changes the card to the danger tone", () => {
        render(
            <SectionCard
                title="General"
                lines={["FFMS2 · C:/media/clip.mkv"]}
                failed
                alert={<p role="alert">The run failed.</p>}
            />,
        );

        expect(screen.getByRole("alert").textContent).toBe("The run failed.");
        expect(screen.getByRole("heading", { name: "General" })).toBeDefined();
        expect(screen.getByRole("alert").closest("section")?.className).toContain(
            "border-danger/40",
        );
    });

    it("keeps the ordinary border when there is no failure", () => {
        render(<SectionCard title="General" lines={["Ready"]} />);

        expect(screen.queryByRole("alert")).toBeNull();
        expect(
            screen.getByRole("heading", { name: "General" }).closest("section")?.className,
        ).toContain("border-line");
    });
});
