// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HostPathField } from "./HostPathField";
import type { HostPathFieldState } from "./useHostPathField";

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

function field(overrides: Partial<HostPathFieldState<unknown>> = {}): HostPathFieldState<unknown> {
    return {
        path: "C:/stored.exe",
        fieldError: null,
        saveError: null,
        result: null,
        pending: false,
        canPick: true,
        edit: vi.fn(),
        locate: vi.fn(),
        submit: vi.fn(),
        ...overrides,
    };
}

describe("HostPathField", () => {
    it("wires the input, picker, and Save to the hook", () => {
        const current = field();
        render(<HostPathField field={current} label="Executable path" placeholder="Path" />);

        const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Executable path" });
        expect(input.value).toBe("C:/stored.exe");

        fireEvent.change(input, { target: { value: "C:/typed.exe" } });
        expect(current.edit).toHaveBeenCalledWith("C:/typed.exe");

        fireEvent.click(screen.getByRole("button", { name: /Locate/ }));
        expect(current.locate).toHaveBeenCalledWith("C:/stored.exe");

        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(current.submit).toHaveBeenCalled();
    });

    it("hides Save but still submits the form on Enter when showSave is false", () => {
        const current = field();
        render(
            <HostPathField
                field={current}
                label="Executable path"
                placeholder="Path"
                showSave={false}
            />,
        );

        expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
        const input = screen.getByRole("textbox", { name: "Executable path" });
        const form = input.closest("form");
        if (form === null) {
            throw new Error("The field input is not inside a form.");
        }
        fireEvent.submit(form);
        expect(current.submit).toHaveBeenCalled();
    });

    it("disables the field and shows the pending labels while saving", () => {
        const current = field({ pending: true });
        render(
            <HostPathField
                field={current}
                label="Executable path"
                placeholder="Path"
                pickPendingLabel="Probing…"
            />,
        );

        expect(
            screen.getByRole<HTMLInputElement>("textbox", { name: "Executable path" }).disabled,
        ).toBe(true);
        expect(screen.getByRole<HTMLButtonElement>("button", { name: /Probing/ }).disabled).toBe(
            true,
        );
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Saving…" }).disabled).toBe(
            true,
        );
    });

    it("renders both failure channels", () => {
        render(
            <HostPathField
                field={field({ fieldError: "The picker failed.", saveError: "The save failed." })}
                label="Executable path"
                placeholder="Path"
            />,
        );

        expect(screen.getAllByRole("alert")).toHaveLength(2);
        screen.getByText("The picker failed.");
        screen.getByText("The save failed.");
    });

    it("renders the footer and the result slot", () => {
        render(
            <HostPathField
                field={field()}
                label="Executable path"
                placeholder="Path"
                footer={<p>Helper copy</p>}
                result={<p>Probe verdict</p>}
            />,
        );

        screen.getByText("Helper copy");
        screen.getByText("Probe verdict");
    });

    it("disables the controls when the caller has not loaded settings", () => {
        render(
            <HostPathField field={field()} label="Executable path" placeholder="Path" disabled />,
        );

        expect(
            screen.getByRole<HTMLInputElement>("textbox", { name: "Executable path" }).disabled,
        ).toBe(true);
        expect(screen.getByRole<HTMLButtonElement>("button", { name: /Locate/ }).disabled).toBe(
            true,
        );
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Save" }).disabled).toBe(true);
    });

    it("hides Locate on a host with no picker", () => {
        render(
            <HostPathField
                field={field({ canPick: false })}
                label="Executable path"
                placeholder="Path"
            />,
        );

        expect(screen.queryByRole("button", { name: /Locate/ })).toBeNull();
        screen.getByRole("button", { name: "Save" });
    });
});
