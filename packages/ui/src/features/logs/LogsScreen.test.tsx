// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

import { MockTransport } from "@av1ation/api";

import { renderRoute } from "../../test/render";
import { LogsScreen } from "./LogsScreen";

afterEach(() => {
    vi.restoreAllMocks();
});

/** Mount the viewer at a logs URL, with the sibling video tabs resolvable. */
function renderLogs(search: string, transport: MockTransport = new MockTransport()) {
    renderRoute(<LogsScreen />, {
        route: "/projects/$projectId/videos/$videoId/logs",
        initialEntry: `/projects/demo/videos/demo-video/logs${search}`,
        stubs: [
            "/projects/$projectId/videos/$videoId",
            "/projects/$projectId/videos/$videoId/scenes",
            "/projects/$projectId/videos/$videoId/history",
        ],
        transport,
    });
}

const RUNS = "/api/projects/demo/videos/demo-video/runs";

/** A run list whose only log predates the run-level timeline record. */
class UnrecordedRunTransport extends MockTransport {
    override async get<T>(path: string, schema: ZodType<T>): Promise<T> {
        if (path === RUNS) {
            return schema.parse([
                {
                    run_id: "demo-run-2",
                    started_at: "2026-10-30T14:22:31Z",
                    ended_at: "2026-10-30T14:24:02Z",
                    outcome: "unknown",
                    message: null,
                },
            ]);
        }
        return super.get(path, schema);
    }
}

it("opens the run a History link names instead of the newest log", async () => {
    renderLogs("?run=demo-run-1");

    const select = await screen.findByLabelText("Run");
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe("demo-run-1"));
});

it("shows no outcome chip for a run whose log predates the timeline record", async () => {
    renderLogs("", new UnrecordedRunTransport());

    const select = await screen.findByLabelText("Run");
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe("demo-run-2"));

    const option = screen.getByRole("option");
    expect(option.textContent ?? "").not.toContain("Unknown");
    expect(screen.queryByText("Unknown")).toBeNull();
    expect(screen.getByText("Run ended")).toBeTruthy();
});

it("falls back to the newest log when the linked run has none", async () => {
    renderLogs("?run=deleted-run");

    const select = await screen.findByLabelText("Run");
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe("demo-run-2"));
});

it("offers a copy action on a right click, because a virtualized row cannot be selected reliably", async () => {
    renderLogs("?run=demo-run-2");

    // The tail arrives after the run list; a row is what the menu belongs to. The viewer
    // opens at the newest line, which the demo records as the muxing sequence.
    const [message] = await screen.findAllByText(/Muxing chunk/u);
    if (message === undefined) {
        throw new Error("no log row rendered");
    }
    fireEvent.contextMenu(message);

    expect(screen.getByRole("menu", { name: "Log line actions" })).toBeDefined();

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy message" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toMatch(/Muxing chunk/u);
});
