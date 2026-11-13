// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { ApiError, MockTransport } from "@av1ation/api";

import { renderWithApi } from "../../test/render";
import { NetworkPanel } from "./NetworkPanel";

const SESSION_ONE = {
    address: "192.168.1.31",
    created_at: "2026-11-12T10:00:00Z",
    id: "session-one",
    label: "Pixel 9",
    last_seen: "2026-11-12T10:05:00Z",
    shortcode: "ABCD-EFGH",
    token: "token-one",
};

const SESSION_TWO = {
    created_at: "2026-11-12T10:10:00Z",
    id: "session-two",
    label: "MacBook",
    last_seen: null,
    shortcode: "IJKL-MNOP",
    token: "token-two",
};

function enabledTransport() {
    const transport = new MockTransport();
    transport.routes.set("/api/lan", {
        bind: "0.0.0.0",
        enabled: true,
        port: 41234,
        url: "http://192.168.1.20:41234",
        token: "token-two",
        sessions: [SESSION_ONE, SESSION_TWO],
    });
    return transport;
}

it("shows the listener, pairing code, sessions, and copies the advertised credentials", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
    });
    renderWithApi(<NetworkPanel />, { transport: enabledTransport() });

    expect(await screen.findByText("Connected sessions · 2")).toBeTruthy();
    expect(screen.getByText("ABCD-EFGH")).toBeTruthy();
    expect(screen.getByText("token-one")).toBeTruthy();
    expect(screen.getByText("41234")).toBeTruthy();
    expect(screen.getByText("Pixel 9")).toBeTruthy();
    expect(screen.getByText("MacBook")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Copy pairing code"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ABCD-EFGH"));
    fireEvent.click(screen.getByText("Copy pairing link"));
    await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith("http://192.168.1.20:41234/#t=token-one"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("token-one"));
});

it("shows a disabled listener with no sessions and no pairing link", async () => {
    const transport = new MockTransport();
    transport.routes.set("/api/lan", {
        bind: "127.0.0.1",
        enabled: false,
        port: null,
        sessions: [],
    });
    renderWithApi(<NetworkPanel />, { transport });

    expect(await screen.findByText("No browser has paired yet.")).toBeTruthy();
    expect(screen.getByText("Not listening")).toBeTruthy();
    expect(screen.queryByText("Copy pairing link")).toBeNull();
    expect(screen.getByText("Turn on LAN access to create a pairing code.")).toBeTruthy();
});

it("explains that a paired browser cannot manage the listener it is using", async () => {
    const transport = new MockTransport();
    transport.get = vi.fn(async () => {
        throw new ApiError(403, null, "The LAN host owns this control.");
    }) as unknown as typeof transport.get;
    renderWithApi(<NetworkPanel />, { transport });

    expect(await screen.findByText("This browser is connected through LAN access")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
});
