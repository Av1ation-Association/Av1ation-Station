// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { Sheet } from "./Sheet";

beforeAll(() => {
    // jsdom has no top layer; these are the only native dialog methods the sheet uses.
    HTMLDialogElement.prototype.showModal = function showModal() {
        this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
        this.open = false;
    };
});

afterEach(cleanup);

it("dismisses from the backdrop, not from a click inside the sheet", () => {
    const onClose = vi.fn();
    render(
        <Sheet open title="Test sheet" onClose={onClose} footer={null}>
            <p>Sheet body</p>
        </Sheet>,
    );

    const dialog = screen.getByRole("dialog", { name: "Test sheet" });
    fireEvent.click(screen.getByText("Sheet body"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
});
