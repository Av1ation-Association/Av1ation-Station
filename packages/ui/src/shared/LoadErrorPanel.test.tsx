// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoadErrorPanel } from "./LoadErrorPanel";

afterEach(cleanup);

describe("LoadErrorPanel", () => {
    it("renders the failure and runs its retry action", () => {
        const retry = vi.fn();
        render(
            <LoadErrorPanel
                className="mt-5"
                heading="h2"
                title="This section could not be loaded"
                message="The schema did not arrive."
                retryLabel="Retry"
                onRetry={retry}
            />,
        );

        expect(
            screen.getByRole("heading", {
                level: 2,
                name: "This section could not be loaded",
            }),
        ).toBeTruthy();
        expect(screen.getByText("The schema did not arrive.")).toBeTruthy();
        expect(screen.getByRole("alert").className).toContain("mt-5");

        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(retry).toHaveBeenCalledTimes(1);
    });

    it("uses the default title element and retry label", () => {
        render(<LoadErrorPanel title="Nothing loaded" onRetry={() => {}} />);

        const title = screen.getByText("Nothing loaded");
        expect(title.tagName).toBe("P");
        expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    });
});
