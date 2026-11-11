// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ParameterDescriptor } from "@av1ation/contracts";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ParameterSheet } from "./ParameterSheet";

beforeAll(() => {
    // jsdom has no top layer; the sheet's native dialog API is the only gap.
    HTMLDialogElement.prototype.showModal = function showModal() {
        this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
        this.open = false;
    };
});

afterEach(cleanup);

function renderSheet({
    initial = null,
    taken = new Set<string>(),
}: {
    initial?: { key: string; descriptor: ParameterDescriptor } | null;
    taken?: ReadonlySet<string>;
} = {}) {
    const apply = vi.fn();
    render(
        <ParameterSheet
            open
            initial={initial}
            taken={taken}
            encoderLabel="SVT-AV1"
            onClose={() => {}}
            onApply={apply}
        />,
    );
    return { apply, dialog: screen.getByRole("dialog", { name: "Add parameter" }) };
}

describe("ParameterSheet", () => {
    it("validates a duplicate key before applying", () => {
        const { apply, dialog } = renderSheet({ taken: new Set(["--crf"]) });

        fireEvent.change(within(dialog).getByLabelText("Key name"), {
            target: { value: "crf" },
        });
        fireEvent.change(within(dialog).getByLabelText("Label"), {
            target: { value: "Constant Rate Factor" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Add parameter" }));

        expect(apply).not.toHaveBeenCalled();
        expect(within(dialog).getByRole("alert").textContent).toContain("already exists");
    });

    it("builds a text descriptor from the edited key and label", () => {
        const { apply, dialog } = renderSheet();

        fireEvent.change(within(dialog).getByLabelText("Key name"), {
            target: { value: "qp" },
        });
        fireEvent.change(within(dialog).getByLabelText("Label"), {
            target: { value: "Quantizer" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Add parameter" }));

        expect(apply).toHaveBeenCalledTimes(1);
        const [key, descriptor] = apply.mock.calls[0] as [string, { label: string; kind: unknown }];
        expect(key).toBe("--qp");
        expect(descriptor.label).toBe("Quantizer");
        expect(descriptor.kind).toMatchObject({ Text: { format: null } });
    });
});
