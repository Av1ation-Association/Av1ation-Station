// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { MockTransport } from "@av1ation/api";
import { LogPageSchema, RunSummarySchema, VideoHistorySchema } from "@av1ation/contracts";

import { renderWithApi } from "../../test/render";
import { runWhen } from "../../shared/model/run-presentation";
import { DeleteRunDialog } from "./DeleteRunDialog";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

const RUNS = "/api/projects/demo/videos/demo-video/runs";
const HISTORY = "/api/projects/demo/videos/demo-video/history";
const STARTED_AT = "2026-10-30T14:22:00";

function renderDialog(transport: MockTransport, onClose: () => void, kind?: "log" | "run") {
    renderWithApi(
        <DeleteRunDialog
            projectId="demo-project"
            videoId="demo-video"
            runId="demo-run-2"
            startedAt={STARTED_AT}
            {...(kind === undefined ? {} : { kind })}
            onClose={onClose}
        />,
        { transport },
    );
}

it("names the run it will remove before anything is sent", () => {
    renderDialog(new MockTransport(), vi.fn());

    expect(
        screen.getByText(
            `This removes the log recorded for the run that started ${runWhen(STARTED_AT)}. History keeps the run, along with how it ended.`,
        ),
    ).toBeTruthy();
});

it("closes without touching the log when the user cancels", async () => {
    const transport = new MockTransport();
    const onClose = vi.fn();
    renderDialog(transport, onClose);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    const runs = await transport.get(RUNS, RunSummarySchema.array());
    expect(runs.map((run) => run.run_id)).toContain("demo-run-2");
});

it("deletes the named log and closes only after the service accepts it", async () => {
    const transport = new MockTransport();
    const onClose = vi.fn();
    renderDialog(transport, onClose);

    fireEvent.click(screen.getByRole("button", { name: "Delete log" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await expect(transport.get("/api/runs/demo-run-2/logs", LogPageSchema)).rejects.toMatchObject({
        status: 404,
    });
    const runs = await transport.get(RUNS, RunSummarySchema.array());
    expect(runs.map((run) => run.run_id)).not.toContain("demo-run-2");
});

it("deletes the run's history and log when asked for the run", async () => {
    const transport = new MockTransport();
    const onClose = vi.fn();
    renderDialog(transport, onClose, "run");

    expect(screen.getByText(/history entries and the log recorded for the run/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete run" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const runs = await transport.get(RUNS, RunSummarySchema.array());
    expect(runs.map((run) => run.run_id)).not.toContain("demo-run-2");
    // The demo's history endpoint is empty, but the request must still have been made
    // against the run route rather than the log-only one.
    await expect(transport.get(HISTORY, VideoHistorySchema)).resolves.toBeDefined();
});
