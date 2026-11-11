// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@av1ation/api";
import type { LanPairing } from "@av1ation/contracts";

import { PairingScreen } from "./PairingScreen";

const TOKEN = "a".repeat(64);

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("PairingScreen", () => {
    it("normalizes a code and hands the accepted token to the host", async () => {
        const pair = vi.fn(async () => ({ token: TOKEN }));
        const onPaired = vi.fn();
        render(<PairingScreen pair={pair} onPaired={onPaired} />);

        fireEvent.change(screen.getByLabelText("Pairing code or link"), {
            target: { value: "abcd-efgh" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Pair" }));

        await waitFor(() => expect(onPaired).toHaveBeenCalledWith(TOKEN));
        expect(pair).toHaveBeenCalledWith("ABCDEFGH");
    });

    it("accepts a full pairing link without calling the service", () => {
        const pair = vi.fn(async () => ({ token: TOKEN }));
        const onPaired = vi.fn();
        render(<PairingScreen pair={pair} onPaired={onPaired} />);

        fireEvent.change(screen.getByLabelText("Pairing code or link"), {
            target: { value: "http://192.168.1.5:1420/#t=link-token" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Pair" }));

        expect(onPaired).toHaveBeenCalledWith("link-token");
        expect(pair).not.toHaveBeenCalled();
    });

    it("re-enables after the service's retry window elapses", async () => {
        vi.useFakeTimers();
        let rejectPair: ((error: unknown) => void) | undefined;
        const pair = vi
            .fn<(shortcode: string) => Promise<LanPairing>>()
            .mockImplementationOnce(
                () =>
                    new Promise<LanPairing>((_resolve, reject) => {
                        rejectPair = reject;
                    }),
            )
            .mockResolvedValueOnce({ token: TOKEN });
        const onPaired = vi.fn();
        render(<PairingScreen pair={pair} onPaired={onPaired} />);

        fireEvent.change(screen.getByLabelText("Pairing code or link"), {
            target: { value: "ABCD-EFGH" },
        });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Pair" }));
        });

        await act(async () => {
            rejectPair?.(new ApiError(429, null, "Too many pairing attempts.", 2));
            await Promise.resolve();
        });

        expect(screen.getByRole("alert").textContent).toContain("Try again in 2 seconds.");
        expect((screen.getByRole("button", { name: "Wait…" }) as HTMLButtonElement).disabled).toBe(
            true,
        );

        await act(async () => {
            vi.advanceTimersByTime(2_000);
        });

        expect((screen.getByRole("button", { name: "Pair" }) as HTMLButtonElement).disabled).toBe(
            false,
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Pair" }));
        });

        expect(pair).toHaveBeenCalledTimes(2);
        expect(onPaired).toHaveBeenCalledWith(TOKEN);
    });
});
