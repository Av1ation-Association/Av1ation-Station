// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import type { ZodType } from "zod";

import { MockTransport } from "@av1ation/api";
import type { TimelineRecord } from "@av1ation/contracts";

import { renderRoute } from "../../test/render";
import { HistoryScreen } from "./HistoryScreen";

const HISTORY = "/api/projects/demo/videos/demo-video/history";

const ENTRIES: TimelineRecord[] = [
    {
        run_id: "demo-run-1",
        sequence: "SceneDetector",
        started_at: "2026-10-30T14:22:31Z",
        ended_at: "2026-10-30T14:23:00Z",
        outcome: "completed",
        frames_processed: 1_000,
        frames_total: 1_000,
        fps: 3.33,
        message: null,
    },
    {
        run_id: "demo-run-1",
        sequence: null,
        started_at: "2026-10-30T14:22:31Z",
        ended_at: "2026-10-30T14:24:02Z",
        outcome: "unknown",
        frames_processed: null,
        frames_total: null,
        fps: null,
        message: "The runner stopped for a reason this build does not name.",
    },
];

/** The demo has no timeline; this run's terminal record names an outcome History cannot. */
class HistoryTransport extends MockTransport {
    readonly deleted: string[] = [];

    override async get<T>(path: string, schema: ZodType<T>): Promise<T> {
        if (path === HISTORY) {
            return schema.parse({ entries: ENTRIES });
        }
        return super.get(path, schema);
    }

    override async delete(path: string): Promise<void> {
        this.deleted.push(path);
        return await super.delete(path);
    }
}

function renderHistory(transport = new HistoryTransport()) {
    renderRoute(<HistoryScreen />, {
        route: "/projects/$projectId/videos/$videoId/history",
        initialEntry: "/projects/demo/videos/demo-video/history",
        stubs: [
            "/projects/$projectId/videos/$videoId",
            "/projects/$projectId/videos/$videoId/scenes",
            "/projects/$projectId/videos/$videoId/logs",
        ],
        transport,
    });
}

it("shows Unknown for a terminal outcome the UI does not recognize", async () => {
    renderHistory();

    const chip = await screen.findByText("Unknown");
    expect(chip.className).toContain("text-ink-secondary");
    expect(screen.getByText("demo-run-1")).toBeTruthy();
});

it("deletes a run only after its confirmation dialog", async () => {
    const transport = new HistoryTransport();
    renderHistory(transport);

    await screen.findByText("demo-run-1");
    fireEvent.click(screen.getByRole("button", { name: "Delete run demo-run-1" }));

    const dialog = await screen.findByRole("dialog", { name: "Delete this run?" });
    expect(dialog.textContent).toContain("history entries and the log");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete run" }));

    await waitFor(() =>
        expect(transport.deleted).toEqual(["/api/projects/demo/videos/demo-video/runs/demo-run-1"]),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
