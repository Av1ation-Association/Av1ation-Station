// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiProvider, MockTransport } from "@av1ation/api";
import { EncoderDescriptorSchema } from "@av1ation/contracts";

import { AddForkSheet } from "./AddForkSheet";

beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
        this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
        this.open = false;
    };
});

afterEach(cleanup);

describe("AddForkSheet", () => {
    it("probes the executable before saving a build", async () => {
        const transport = new MockTransport();
        const encoders = await transport.get("/api/encoders", EncoderDescriptorSchema.array());
        const families = encoders.filter((encoder) => !encoder.fork);
        const saved = vi.fn();

        render(
            <ApiProvider transport={transport}>
                <AddForkSheet open families={families} onClose={() => {}} onSaved={saved} />
            </ApiProvider>,
        );

        const dialog = screen.getByRole("dialog", { name: "Add a build" });
        fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
            target: { value: "Studio build" },
        });
        fireEvent.change(within(dialog).getByRole("textbox", { name: "Executable" }), {
            target: { value: "C:/Tools/Encoders/SvtAv1EncApp.exe" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Probe help output" }));

        await within(dialog).findByText(/parameters parsed/u);
        fireEvent.click(within(dialog).getByRole("button", { name: "Save build" }));

        await waitFor(() => expect(saved).toHaveBeenCalledWith("fork-1"));
    });
});
