import type { EncodeEvent, NotificationSettings } from "@av1ation/contracts";
import { describe, expect, it, vi } from "vitest";

import {
    buildRunNotification,
    publishRunLifecycle,
    subscribeRunLifecycle,
    type RunLifecycleEvent,
} from "./run-notifications";

const SETTINGS: NotificationSettings = {
    enabled: true,
    started: true,
    finished: true,
    failed: true,
};

const NAMES = { project: "Documentary", video: "Reel 01" };

function event(overrides: Partial<RunLifecycleEvent> = {}): RunLifecycleEvent {
    return {
        projectId: "project",
        videoId: "video",
        runId: "run",
        kind: "started",
        message: "Starting",
        ...overrides,
    };
}

describe("buildRunNotification", () => {
    it("returns nothing while the master preference is off", () => {
        expect(buildRunNotification(event(), { ...SETTINGS, enabled: false }, NAMES)).toBeNull();
    });

    it("honours each event choice", () => {
        expect(buildRunNotification(event(), { ...SETTINGS, started: false }, NAMES)).toBeNull();
        expect(
            buildRunNotification(
                event({ kind: "finished" }),
                { ...SETTINGS, finished: false },
                NAMES,
            ),
        ).toBeNull();
        expect(
            buildRunNotification(
                event({ kind: "failed", message: "encoder exited" }),
                { ...SETTINGS, failed: false },
                NAMES,
            ),
        ).toBeNull();
    });

    it("names the project/video and includes a bounded failure reason", () => {
        expect(buildRunNotification(event(), SETTINGS, NAMES)).toEqual({
            title: "Encoding started",
            body: "Documentary · Reel 01",
        });
        expect(
            buildRunNotification(
                event({ kind: "failed", message: "x".repeat(300) }),
                SETTINGS,
                NAMES,
            ),
        ).toEqual({
            title: "Encoding failed",
            body: `Documentary · Reel 01\n${"x".repeat(137)}…`,
        });
    });
});

describe("run lifecycle bus", () => {
    it("forwards only the selected transitions and unsubscribes cleanly", () => {
        const listener = vi.fn();
        const stop = subscribeRunLifecycle(listener);
        publishRunLifecycle({
            kind: "cancelled",
            project_id: "project",
            video_id: "video",
            run_id: "run",
            message: "Stopped",
        } as EncodeEvent);
        expect(listener).not.toHaveBeenCalled();

        publishRunLifecycle({
            kind: "started",
            project_id: "project",
            video_id: "video",
            run_id: "run",
            message: "Starting",
        } as EncodeEvent);
        expect(listener).toHaveBeenCalledWith(event());

        stop();
        publishRunLifecycle({
            kind: "finished",
            project_id: "project",
            video_id: "video",
            run_id: "run",
            message: "Done",
        } as EncodeEvent);
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
