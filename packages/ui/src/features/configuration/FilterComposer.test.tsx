// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { JsonSchema } from "../../shared/schema/config-schema";
import { FilterComposer } from "./FilterComposer";

afterEach(cleanup);

const SCHEMA: JsonSchema = {
    $defs: {
        Scaler: { type: "string", enum: ["bicubic", "lanczos"] },
    },
    oneOf: [
        {
            type: "object",
            properties: {
                OutputFormat: {
                    type: "object",
                    properties: {
                        bit_depth: { type: ["integer", "null"] },
                        format: { anyOf: [{ $ref: "#/$defs/Scaler" }, { type: "null" }] },
                    },
                },
                Resize: {
                    type: "object",
                    properties: {
                        width: { type: ["integer", "null"] },
                        height: { type: ["integer", "null"] },
                        scaler: { anyOf: [{ $ref: "#/$defs/Scaler" }, { type: "null" }] },
                    },
                },
            },
        },
    ],
};

function composer(overrides: Partial<Parameters<typeof FilterComposer>[0]> = {}) {
    const onClose = vi.fn();
    const onCommit = vi.fn();
    const view = render(
        <FilterComposer
            open
            target="ffms2"
            schema={SCHEMA}
            initial={null}
            onClose={onClose}
            onCommit={onCommit}
            {...overrides}
        />,
    );
    return { ...view, onClose, onCommit };
}

it("builds a resize filter from presets and commits engine-shaped numbers", () => {
    const { onClose, onCommit } = composer();

    fireEvent.click(screen.getByRole("button", { name: /Resize/u }));
    expect(screen.getByRole("heading", { name: "Resize" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1080p" }));
    expect((screen.getByLabelText("Width") as HTMLInputElement).value).toBe("1920");
    expect((screen.getByLabelText("Height") as HTMLInputElement).value).toBe("1080");

    // The aspect button only changes the draft's lock; the preset still owns both values.
    fireEvent.click(screen.getByRole("button", { name: "Aspect locked" }));
    expect(screen.getByRole("button", { name: "Aspect unlocked" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));

    expect(onCommit).toHaveBeenCalledWith({ Resize: { width: 1920, height: 1080 } }, false);
    expect(onClose).toHaveBeenCalledOnce();
});

it("keeps the sheet open and clears the fields when Add another is checked", () => {
    const { onClose, onCommit } = composer();

    fireEvent.click(screen.getByRole("button", { name: /Resize/u }));
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "640" } });
    fireEvent.change(screen.getByLabelText("Height"), { target: { value: "360" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));

    expect(onCommit).toHaveBeenCalledWith({ Resize: { width: 640, height: 360 } }, true);
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Width") as HTMLInputElement).value).toBe("");
});

it("opens an existing filter with its stored fields and saves an edit", () => {
    const { onCommit } = composer({ initial: { Resize: { width: 1280, height: 720 } } });

    expect((screen.getByLabelText("Width") as HTMLInputElement).value).toBe("1280");
    expect((screen.getByLabelText("Height") as HTMLInputElement).value).toBe("720");
    fireEvent.click(screen.getByRole("button", { name: "Save filter" }));

    expect(onCommit).toHaveBeenCalledWith({ Resize: { width: 1280, height: 720 } }, false);
});

it("turns an empty field into no property and filters the type pane by name", () => {
    const { onCommit } = composer();

    fireEvent.click(screen.getByRole("button", { name: /Output format/u }));
    fireEvent.change(screen.getByLabelText("Bit Depth"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    expect(onCommit).toHaveBeenCalledWith({ OutputFormat: { bit_depth: 10 } }, false);

    fireEvent.change(screen.getByPlaceholderText("Filter type"), {
        target: { value: "not-a-filter" },
    });
    expect(screen.getByText("No filter matches that name.")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Filter type"), {
        target: { value: "resize" },
    });
    expect(screen.getByRole("button", { name: /Resize/u })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Output format/u })).toBeNull();
});
