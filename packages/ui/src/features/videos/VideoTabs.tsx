import type { ReactNode } from "react";

import { Link } from "@tanstack/react-router";

import { VIDEO_TABS, type VideoTabId } from "./video-tabs";

export { VIDEO_TABS, type VideoTabId } from "./video-tabs";

/**
 * The one tab strip for one video.
 *
 * It is rendered by every video surface rather than by the shell: the shell's bar is the
 * breadcrumb and the primary action, and a tab is the page's own navigation. The active tab
 * is the whole route, so the Configuration tab stays lit while a sequence section is open.
 */
export function VideoTabs({
    projectId,
    videoId,
    active,
    note,
    trailing,
}: {
    projectId: string;
    videoId: string;
    active: VideoTabId;
    /** A one-line fact about this video, right-aligned on wide windows. */
    note?: ReactNode;
    /** A page-owned control in the video's own bar, such as its validation menu. */
    trailing?: ReactNode;
}) {
    return (
        <div className="shrink-0 border-b border-line bg-app">
            <div className="page flex items-stretch gap-1">
                <nav aria-label="Video" className="flex min-w-0 items-stretch">
                    {VIDEO_TABS.map((tab) => {
                        const on = tab.id === active;
                        return (
                            <Link
                                key={tab.id}
                                to={tab.to}
                                params={{ projectId, videoId }}
                                aria-current={on ? "page" : undefined}
                                className={`relative flex h-11 shrink-0 items-center px-3 text-[13px] transition-colors duration-150 ${
                                    on
                                        ? "font-semibold text-ink"
                                        : "text-ink-secondary hover:text-ink"
                                }`}
                            >
                                {tab.label}
                                {on ? (
                                    <span
                                        aria-hidden="true"
                                        className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
                                    />
                                ) : null}
                            </Link>
                        );
                    })}
                </nav>
                {note === undefined && trailing === undefined ? null : (
                    <div className="ml-auto flex min-w-0 items-center gap-3 pl-4">
                        {note === undefined ? null : (
                            <p className="m-0 hidden min-w-0 items-center truncate text-[10.5px] text-ink-muted lg:flex">
                                {note}
                            </p>
                        )}
                        {trailing}
                    </div>
                )}
            </div>
        </div>
    );
}
