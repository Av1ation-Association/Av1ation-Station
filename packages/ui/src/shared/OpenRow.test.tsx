// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { OpenRow } from "./OpenRow";

afterEach(() => {
    cleanup();
    window.getSelection()?.removeAllRanges();
});

it("opens from anywhere on the row but not from a control on it", () => {
    const onOpen = vi.fn();
    render(
        <OpenRow onOpen={onOpen} className="row">
            <span>Template one</span>
            <button type="button">Delete</button>
        </OpenRow>,
    );

    fireEvent.click(screen.getByText("Template one"));
    expect(onOpen).toHaveBeenCalledTimes(1);

    // The card's own buttons stay buttons; the row must not navigate as well.
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
});

it("leaves a click that ends a text selection to the selection", () => {
    const onOpen = vi.fn();
    render(
        <OpenRow onOpen={onOpen}>
            <p>Selectable copy</p>
        </OpenRow>,
    );

    const copy = screen.getByText("Selectable copy");
    const range = document.createRange();
    range.selectNodeContents(copy);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // A drag that highlights text fires a click on the row when it ends; it is not an open.
    fireEvent.click(copy);
    expect(onOpen).not.toHaveBeenCalled();
});
