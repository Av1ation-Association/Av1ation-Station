// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ setZoom: vi.fn(() => Promise.resolve()) }));

vi.mock("@av1ation/api", () => ({
    useTransport: () => ({ setZoom: mocks.setZoom }),
}));

import { WebviewZoom } from "./WebviewZoom";

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    mocks.setZoom.mockClear();
});

it("steps the webview zoom with the primary modifier and resets it to one", () => {
    render(<WebviewZoom />);

    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    expect(mocks.setZoom).toHaveBeenLastCalledWith(1.1);

    fireEvent.keyDown(window, { key: "-", ctrlKey: true });
    expect(mocks.setZoom).toHaveBeenLastCalledWith(1);

    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    expect(mocks.setZoom).toHaveBeenLastCalledWith(1);
});

it("leaves the chord to a focused text field", () => {
    render(<WebviewZoom />);
    const field = document.createElement("input");
    field.type = "text";
    document.body.append(field);
    field.focus();

    fireEvent.keyDown(field, { key: "=", ctrlKey: true });

    expect(mocks.setZoom).not.toHaveBeenCalled();
});
