import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import {
    buildRunNotification,
    subscribeRunLifecycle,
    type RunLifecycleEvent,
} from "../run-notifications";
import { useTransport } from "./client";
import { queryKeys } from "./keys";
import { useSettings } from "./system";

/**
 * Sends the run notifications the settings permit through the host's OS surface.
 *
 * The host checks focus and permission, because only it can see whether the window is in the
 * background. This hook owns what the shared UI can decide: the event choices, one start per
 * run, and the last project/video names. It subscribes once so a settings save cannot open a
 * gap in the event stream.
 */
export function useRunNotifications(): void {
    const transport = useTransport();
    const settings = useSettings();
    const queryClient = useQueryClient();
    const latest = useRef({
        notify: transport.notify,
        settings: settings.data?.desktop_notifications,
    });
    latest.current = {
        notify: transport.notify,
        settings: settings.data?.desktop_notifications,
    };
    const seen = useRef(new Set<string>());

    useEffect(() => {
        const send = (event: RunLifecycleEvent) => {
            const notify = latest.current.notify;
            const choices = latest.current.settings;
            if (notify === undefined || choices === undefined) {
                return;
            }
            // One start and one terminal notification per run. The terminal key is shared
            // by finish and failure, so a repeated terminal event cannot send twice.
            const key = `${event.kind === "started" ? "started" : "terminal"}:${event.runId}`;
            if (seen.current.has(key)) {
                return;
            }
            seen.current.add(key);
            const project = queryClient.getQueryData<{ name?: string }>(
                queryKeys.project(event.projectId),
            );
            const video = queryClient.getQueryData<{ name?: string }>(
                queryKeys.video(event.projectId, event.videoId),
            );
            const notification = buildRunNotification(event, choices, {
                project: project?.name,
                video: video?.name,
            });
            if (notification !== null) {
                // A notification is best-effort: an OS refusal must not disturb the run.
                void notify(notification).catch(() => undefined);
            }
        };
        return subscribeRunLifecycle(send);
    }, [queryClient]);
}
