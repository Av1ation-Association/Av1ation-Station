// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ParameterDescriptor } from "@av1ation/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ParameterSheet } from "./ParameterSheet";

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

    it("adds a curated mark to a slider descriptor", () => {
        const { apply, dialog } = renderSheet();

        fireEvent.change(within(dialog).getByLabelText("Key name"), {
            target: { value: "crf" },
        });
        fireEvent.change(within(dialog).getByLabelText("Label"), {
            target: { value: "Constant Rate Factor" },
        });
        fireEvent.change(within(dialog).getByLabelText("Kind"), {
            target: { value: "Decimal" },
        });
        fireEvent.change(within(dialog).getByLabelText("Widget"), {
            target: { value: "Slider" },
        });
        fireEvent.change(within(dialog).getByLabelText("Minimum"), {
            target: { value: "1" },
        });
        fireEvent.change(within(dialog).getByLabelText("Maximum"), {
            target: { value: "70" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Add mark" }));
        fireEvent.change(within(dialog).getByLabelText("Mark 1 value"), {
            target: { value: "30" },
        });
        fireEvent.change(within(dialog).getByLabelText("Mark 1 label"), {
            target: { value: "Visually lossless" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Add parameter" }));

        expect(apply).toHaveBeenCalledTimes(1);
        const [, descriptor] = apply.mock.calls[0] as [
            string,
            { widget: { Slider: { marks: unknown[] } } },
        ];
        expect(descriptor.widget).toEqual({
            Slider: {
                step: null,
                marks: [{ value: 30, label: "Visually lossless" }],
            },
        });
    });
});
