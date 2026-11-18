// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { QuitGuard } from "./QuitGuard";

const mocks = vi.hoisted(() => {
    const handlers: (() => void)[] = [];
    return {
        handlers,
        activeRun: null as unknown,
        quit: vi.fn(() => Promise.resolve()),
        setQuitGuard: vi.fn(() => Promise.resolve()),
        onQuitRequest: vi.fn((handler: () => void) => {
            handlers.push(handler);
            return () => undefined;
        }),
    };
});

vi.mock("@av1ation/api", () => ({
    useActiveRun: () => mocks.activeRun,
    useTransport: () => ({
        onQuitRequest: mocks.onQuitRequest,
        setQuitGuard: mocks.setQuitGuard,
        quit: mocks.quit,
    }),
}));

beforeEach(() => {
    mocks.handlers.length = 0;
    mocks.activeRun = null;
    mocks.quit.mockClear();
    mocks.setQuitGuard.mockClear();
    mocks.onQuitRequest.mockClear();
});

afterEach(cleanup);

function requestQuit() {
    const handler = mocks.handlers.at(-1);
    if (handler === undefined) {
        throw new Error("the host did not subscribe to quit requests");
    }
    act(() => handler());
}

it("quits immediately when no run can be cancelled", () => {
    render(<QuitGuard />);

    requestQuit();

    expect(mocks.setQuitGuard).toHaveBeenCalledWith(false);
    expect(mocks.quit).toHaveBeenCalledTimes(1);
    expect(document.querySelector("dialog")?.open).toBe(false);
});

it("asks before quitting while a run is active", () => {
    mocks.activeRun = {
        projectId: "project",
        videoId: "video",
        live: {},
    };
    render(<QuitGuard />);

    requestQuit();

    expect(mocks.setQuitGuard).toHaveBeenCalledWith(true);
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(document.querySelector("dialog")?.open).toBe(true);
});
