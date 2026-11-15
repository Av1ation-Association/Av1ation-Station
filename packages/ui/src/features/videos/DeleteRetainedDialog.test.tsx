// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeleteRetainedDialog } from "./DeleteRetainedDialog";

function dialog(open: boolean, pending = false, error: unknown = null) {
    return (
        <DeleteRetainedDialog
            open={open}
            retainedBytes={2_400_000_000}
            pending={pending}
            error={error}
            onClose={() => undefined}
            onConfirm={() => undefined}
        />
    );
}

describe("DeleteRetainedDialog", () => {
    it("shows and closes the modal from the open prop", () => {
        const view = render(dialog(false));
        const element = view.container.querySelector("dialog");
        if (element === null) throw new Error("the dialog did not render");
        expect(element.open).toBe(false);

        view.rerender(dialog(true));
        expect(element.open).toBe(true);

        view.rerender(dialog(false));
        expect(element.open).toBe(false);
    });

    it("dismisses a backdrop click unless the delete is pending", () => {
        const onClose = vi.fn();
        const view = render(
            <DeleteRetainedDialog
                open
                retainedBytes={2_400_000_000}
                pending={false}
                error={null}
                onClose={onClose}
                onConfirm={() => undefined}
            />,
        );
        const element = view.container.querySelector("dialog");
        if (element === null) throw new Error("the dialog did not render");

        fireEvent.click(element);
        expect(onClose).toHaveBeenCalledTimes(1);

        view.rerender(
            <DeleteRetainedDialog
                open
                retainedBytes={2_400_000_000}
                pending
                error={null}
                onClose={onClose}
                onConfirm={() => undefined}
            />,
        );
        fireEvent.click(element);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("button", { name: "Deleting…" }).hasAttribute("disabled")).toBe(
            true,
        );
    });

    it("shows a service error beside the confirmation", () => {
        render(dialog(true, false, new Error("The disk is busy.")));

        expect(screen.getByRole("alert").textContent).toContain("The disk is busy.");
    });
});
