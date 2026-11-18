// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MockTransport } from "@av1ation/api";
import { EncoderDescriptorSchema, type EncoderDescriptor } from "@av1ation/contracts";

import { renderWithApi } from "../../test/render";
import { ExecutableCard } from "./ExecutableCard";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

async function x265(transport: MockTransport): Promise<EncoderDescriptor> {
    const encoders = await transport.get("/api/encoders", EncoderDescriptorSchema.array());
    const encoder = encoders.find((entry) => entry.id === "x265");
    if (encoder === undefined) {
        throw new Error("the mock catalogue has no x265 entry");
    }
    return encoder;
}

describe("ExecutableCard", () => {
    it("locates a build and adopts it as the provider", async () => {
        const picked = "C:/Tools/Encoders/x265.exe";
        const transport = new MockTransport({}, { pickExecutable: async () => picked });
        const encoder = await x265(transport);
        const post = vi.spyOn(transport, "post");
        renderWithApi(<ExecutableCard encoder={encoder} onRemove={() => {}} />, { transport });

        const field = screen.getByRole("textbox", {
            name: "x265 executable",
        }) as HTMLInputElement;
        expect(field.value).toBe("");
        expect(field.placeholder).toBe("Resolved on PATH");

        fireEvent.click(screen.getByRole("button", { name: /Locate/ }));

        // The card owns the probe request; the refreshed parent query owns the placeholder.
        await waitFor(() =>
            expect(post).toHaveBeenCalledWith(
                "/api/preflight/custom",
                { kind: "x265", path: picked },
                expect.anything(),
            ),
        );
        expect(field.value).toBe("");
    });

    it("states how the provider resolves when no version was reported", async () => {
        const transport = new MockTransport();
        const encoder = { ...(await x265(transport)), version: null };
        renderWithApi(<ExecutableCard encoder={encoder} onRemove={() => {}} />, { transport });

        expect(screen.getByText("Resolved on PATH")).toBeTruthy();
    });

    it("shows the provider failure beside the card", async () => {
        const transport = new MockTransport();
        vi.spyOn(transport, "post").mockRejectedValue(new Error("The service refused this build."));
        const encoder = await x265(transport);
        renderWithApi(<ExecutableCard encoder={encoder} onRemove={() => {}} />, { transport });

        const field = screen.getByRole("textbox", {
            name: "x265 executable",
        });
        fireEvent.change(field, { target: { value: "C:/Tools/broken.exe" } });
        fireEvent.keyDown(field, { key: "Enter" });

        expect((await screen.findByRole("alert")).textContent).toContain(
            "The service refused this build.",
        );
    });
});
