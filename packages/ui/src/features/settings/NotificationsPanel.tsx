import { useCanNotify, useSettings, useUpdateSettings } from "@av1ation/api";
import type { NotificationSettings } from "@av1ation/contracts";

import { Switch } from "../../shared/Switch";

const EVENTS: readonly {
    key: keyof Omit<NotificationSettings, "enabled">;
    label: string;
    detail: string;
}[] = [
    {
        key: "started",
        label: "A run starts",
        detail: "The first sequence begins; later sequence transitions stay quiet.",
    },
    {
        key: "finished",
        label: "A run finishes",
        detail: "The output is complete and the run reached its normal end.",
    },
    {
        key: "failed",
        label: "A run fails",
        detail: "The toast includes a short reason from the run's error.",
    },
];

/**
 * Settings for the desktop host's run notifications.
 *
 * The window that owns the operating-system surface decides both focus and permission, so
 * this panel only writes the shared choices. A LAN or site window keeps the tab visible and
 * explains why its controls are disabled; cancellation is deliberately not a choice because
 * it is always silent.
 */
export function NotificationsPanel() {
    const canNotify = useCanNotify();
    const settings = useSettings();
    const update = useUpdateSettings();
    const choices = settings.data?.desktop_notifications;
    const enabled = choices?.enabled ?? false;
    const interactive = canNotify && choices !== undefined && !update.isPending;

    const save = (next: Partial<NotificationSettings>) => {
        if (choices === undefined) {
            return;
        }
        update.mutate({ desktop_notifications: { ...choices, ...next } });
    };

    return (
        <div className="mt-6 flex flex-col gap-5">
            <header>
                <p className="m-0 max-w-[72ch] text-[13px] leading-relaxed text-ink-secondary">
                    Notify when a run starts, finishes, or fails while the application window is in
                    the background. Cancellation never sends a notification.
                </p>
            </header>

            {!canNotify ? (
                <div
                    role="status"
                    className="rounded-lg border border-line bg-surface px-5 py-4 text-[12px] leading-relaxed text-ink-secondary"
                >
                    Desktop notifications are available in the desktop application. This window
                    cannot show operating-system notifications.
                </div>
            ) : null}

            {settings.isError ? (
                <p role="alert" className="m-0 text-[12px] text-danger">
                    Notification settings could not be loaded. Reopen Settings to try again.
                </p>
            ) : null}

            <section className="rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h2 className="m-0 text-sm font-semibold text-ink">
                                Run notifications
                            </h2>
                            <p className="mt-1 mb-0 max-w-[62ch] text-[11.5px] leading-relaxed text-ink-secondary">
                                Only while the window is unfocused or minimized. Click a
                                notification to bring the window forward.
                            </p>
                        </div>
                        <Switch
                            checked={enabled}
                            onChange={(next) => save({ enabled: next })}
                            label="Show desktop notifications for runs"
                            disabled={!interactive}
                        />
                    </div>
                </div>

                <div className="divide-y divide-line">
                    {EVENTS.map((event) => (
                        <label
                            key={event.key}
                            className={`flex items-start gap-3 px-5 py-3.5 ${
                                interactive && enabled ? "cursor-pointer" : "cursor-not-allowed"
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={choices?.[event.key] ?? false}
                                onChange={(change) =>
                                    save({ [event.key]: change.currentTarget.checked })
                                }
                                disabled={!interactive || !enabled}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-brand"
                            />
                            <span className="min-w-0">
                                <span
                                    className={`block text-[12px] font-medium ${
                                        enabled ? "text-ink" : "text-ink-muted"
                                    }`}
                                >
                                    {event.label}
                                </span>
                                <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-muted">
                                    {event.detail}
                                </span>
                            </span>
                        </label>
                    ))}
                </div>

                <div className="border-t border-line px-5 py-3.5">
                    <p className="m-0 text-[10.5px] leading-relaxed text-ink-muted">
                        The operating system owns the final permission and display settings for
                        Av1ation Station. A notification can be suppressed there even when the
                        application requests it.
                    </p>
                </div>
            </section>

            {update.isError ? (
                <p role="alert" className="m-0 text-[12px] text-danger">
                    The notification setting could not be saved.
                </p>
            ) : null}
        </div>
    );
}
