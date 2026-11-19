import type { EncodeEvent, NotificationSettings } from "@av1ation/contracts";

import type { DesktopNotification } from "./transport/types";

/** One lifecycle transition a desktop notification may describe. */
export interface RunLifecycleEvent {
    projectId: string;
    videoId: string;
    runId: string;
    kind: "started" | "finished" | "failed";
    message: string;
}

/** The names a notification needs, read from the already-cached project and video. */
export interface RunNotificationNames {
    project?: string | undefined;
    video?: string | undefined;
}

type Listener = (event: RunLifecycleEvent) => void;

const listeners = new Set<Listener>();

/**
 * Publish one run transition to the shell's notification writer.
 *
 * This is a narrow sink rather than a second event stream: `useEncodeEvents` already owns
 * the one subscription, and it calls this before routing the event to caches. The bus keeps
 * notification timing independent of which screen opened the run.
 */
export function publishRunLifecycle(event: EncodeEvent): void {
    if (event.kind !== "started" && event.kind !== "finished" && event.kind !== "failed") {
        return;
    }
    const transition: RunLifecycleEvent = {
        projectId: event.project_id,
        videoId: event.video_id,
        runId: event.run_id,
        kind: event.kind,
        message: event.message,
    };
    for (const listener of listeners) {
        listener(transition);
    }
}

/** Subscribe to run transitions; the shell owns exactly one subscription. */
export function subscribeRunLifecycle(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** One line, bounded, so a multi-line engine dump cannot become the whole toast. */
function reason(message: string): string {
    const compact = message.replace(/\s+/gu, " ").trim();
    if (compact.length <= 140) {
        return compact;
    }
    return `${compact.slice(0, 137).trimEnd()}…`;
}

const TITLES = {
    started: "Encoding started",
    finished: "Encoding finished",
    failed: "Encoding failed",
} as const;

/**
 * Build the notification for one transition, or `null` when the user's choices exclude it.
 *
 * A run's start is represented by the first sequence's `started` event; the caller owns the
 * per-run dedupe because only it sees the sequence transitions in order. Terminal events are
 * already run-level. Cancellation never reaches this function, so it stays silent.
 */
export function buildRunNotification(
    event: RunLifecycleEvent,
    settings: NotificationSettings,
    names: RunNotificationNames,
): DesktopNotification | null {
    if (!settings.enabled || !settings[event.kind]) {
        return null;
    }
    const body = `${names.project ?? "Project"} · ${names.video ?? "Video"}`;
    const detail = event.kind === "failed" ? reason(event.message) : "";
    return {
        title: TITLES[event.kind],
        body: detail === "" ? body : `${body}\n${detail}`,
    };
}
