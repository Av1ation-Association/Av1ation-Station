// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SliderMarks } from "./SliderMarks";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

it("reveals only the hovered or focused collided label", async () => {
    // jsdom has no layout; a 100px track with 40px labels makes the two marks collide.
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(40);

    render(
        <SliderMarks
            min={1}
            max={70}
            defaultValue={25}
            marks={[{ value: 30, label: "Visually lossless" }]}
        />,
    );

    const scale = screen.getByRole("group");
    const defaultTick = screen.getByLabelText("Default 25");
    const collidedTick = screen.getByLabelText("Visually lossless");
    const hiddenLabel = screen.getByText("Visually lossless");

    // The scale is not a focus stop; the ticks are, so focus cannot reveal every label.
    expect(scale.getAttribute("tabindex")).toBeNull();
    await waitFor(() => expect(hiddenLabel.className).toContain("invisible"));

    fireEvent.mouseEnter(collidedTick);
    await waitFor(() => expect(hiddenLabel.className).not.toContain("invisible"));
    expect(screen.getByText("Default 25").className).not.toContain("invisible");

    fireEvent.mouseLeave(collidedTick);
    await waitFor(() => expect(hiddenLabel.className).toContain("invisible"));

    fireEvent.focus(defaultTick);
    expect(hiddenLabel.className).toContain("invisible");

    fireEvent.focus(collidedTick);
    await waitFor(() => expect(hiddenLabel.className).not.toContain("invisible"));
    expect(screen.getByText("Default 25").className).not.toContain("invisible");
});
