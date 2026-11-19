// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { AppSettings, EncodeEvent, NotificationSettings } from "@av1ation/contracts";
import { describe, expect, it, vi } from "vitest";

import { ApiProvider } from "./api/client";
import { useRunNotifications } from "./api/notifications";
import { useSettings } from "./api/system";
import { publishRunLifecycle } from "./run-notifications";
import { MockTransport } from "./transport/mock";
import type { DesktopNotification } from "./transport/types";

const ENABLED: NotificationSettings = {
    enabled: true,
    started: true,
    finished: true,
    failed: true,
};

function transportWith(
    settings: NotificationSettings,
    notify: (notification: DesktopNotification) => Promise<void>,
) {
    const transport = new MockTransport({}, { notify });
    const current = structuredClone(transport.routes.get("/api/settings") as AppSettings);
    current.desktop_notifications = settings;
    transport.routes.set("/api/settings", current);
    return transport;
}

function Harness() {
    const settings = useSettings();
    useRunNotifications();
    return <span>{settings.data === undefined ? "loading" : "ready"}</span>;
}

function renderNotifications(transport: MockTransport) {
    return render(
        <ApiProvider
            transport={transport}
            queryClient={
                new QueryClient({
                    defaultOptions: { queries: { retry: false } },
                })
            }
        >
            <Harness />
        </ApiProvider>,
    );
}

function event(kind: "started" | "finished", runId = "run"): EncodeEvent {
    return {
        at: "2026-11-19T10:00:00Z",
        kind,
        message: kind === "started" ? "Starting" : "Done",
        project_id: "project",
        video_id: "video",
        run_id: runId,
    } as EncodeEvent;
}

describe("useRunNotifications", () => {
    it("sends one start and one terminal notification per run", async () => {
        const notify = vi.fn(async (_notification: DesktopNotification) => undefined);
        const transport = transportWith(ENABLED, notify);
        renderNotifications(transport);
        await screen.findByText("ready");

        act(() => {
            publishRunLifecycle(event("started"));
            publishRunLifecycle(event("started"));
            publishRunLifecycle(event("finished"));
            publishRunLifecycle(event("finished"));
        });

        await waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
        expect(notify.mock.calls.map(([notification]) => notification.title)).toEqual([
            "Encoding started",
            "Encoding finished",
        ]);
    });

    it("sends nothing while the master preference is off", async () => {
        const notify = vi.fn(async (_notification: DesktopNotification) => undefined);
        const transport = transportWith({ ...ENABLED, enabled: false }, notify);
        renderNotifications(transport);
        await screen.findByText("ready");

        act(() => {
            publishRunLifecycle(event("started"));
        });
        expect(notify).not.toHaveBeenCalled();
    });
});
