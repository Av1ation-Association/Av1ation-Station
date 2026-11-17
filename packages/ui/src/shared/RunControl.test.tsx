// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { RunControl } from "./RunControl";

it("wires the compact Start label to hover and keyboard focus", () => {
    render(
        <RunControl
            running={false}
            pending={false}
            compact
            onStart={() => undefined}
            onStop={() => undefined}
        />,
    );

    const button = screen.getByRole("button", { name: "Start" });
    const label = screen.getByText("Start");

    // jsdom cannot lay out Tailwind's hover/focus variants. The contract under test is the
    // wiring: the button is the group, and the label expands for both pointer and keyboard.
    expect(button.className).toContain("group/run");
    expect(label.className).toContain("group-hover/run:max-w-20");
    expect(label.className).toContain("group-focus-visible/run:max-w-20");

    fireEvent.mouseEnter(button);
    fireEvent.focus(button);
    expect(label.getAttribute("aria-hidden")).toBe("true");
});
