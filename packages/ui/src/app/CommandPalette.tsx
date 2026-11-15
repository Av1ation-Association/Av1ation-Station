import { useProjectVideos, useProjects } from "@av1ation/api";
import { Command } from "cmdk";
import { useMatches, useNavigate } from "@tanstack/react-router";
import { FolderKanban, Info, Keyboard, Layers, ListOrdered, Settings, Video } from "lucide-react";

import { isSettingsTrail, type TrailParams } from "./route-meta";
import { PROJECT_SECTIONS } from "../shared/model/project-sections";
import { SETTINGS_TAB_SLUGS, SETTINGS_TABS } from "../features/settings/settings-tabs";
import { VIDEO_TABS } from "../features/videos/video-tabs";

const ITEM =
    "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink-secondary data-[selected=true]:bg-hover data-[selected=true]:text-ink";
const GROUP =
    "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[9.5px] [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-ink-muted [&_[cmdk-group-heading]]:uppercase";

/**
 * The 3.1.5 palette: screens, sections, and the two contexts the route already names.
 *
 * An action that needs a *selection* (a row, a scene range, a half-typed draft) stays on
 * the screen that owns it, because the palette would have to guess which one the user
 * meant. What the route itself knows — this project's videos, this video's tabs — is
 * offered here, so reaching them does not require walking back through the queue.
 */
/** Capped so a 900-video project does not build 900 palette rows on every keystroke. */
const MAX_PALETTE_VIDEOS = 25;
export function CommandPalette({
    open,
    onOpenChange,
    onShowShortcuts,
    inline = false,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Opens the reference dialog; the shell sequences it after this palette closes. */
    onShowShortcuts: () => void;
    /** Render the palette in the documentation card rather than as a page modal. */
    inline?: boolean;
}) {
    const navigate = useNavigate();
    const matches = useMatches();
    const active = matches[matches.length - 1];
    const trail = active?.staticData.trail;
    const params: TrailParams = active?.params ?? {};
    const projectId = params.projectId;
    const videoId = params.videoId;
    const projects = useProjects();

    // Settings names its tab in the hash; in that context the palette lists the same tabs
    // the strip does, so a jump between them does not need the strip on screen.
    const onSettings = trail !== undefined && isSettingsTrail(trail);
    const projectName = projects.data?.find((project) => project.id === projectId)?.name;
    const videos = useProjectVideos(projectId ?? "");
    const currentVideo = videos.data?.find((video) => video.id === videoId);
    const listed = (videos.data ?? []).slice(0, MAX_PALETTE_VIDEOS);

    const choose = (action: () => void) => {
        onOpenChange(false);
        if (inline) {
            return;
        }
        action();
    };

    const body = (
        <>
            <Command.Input
                autoFocus={!inline}
                placeholder="Go to a screen or configuration section…"
                className="h-11 w-full border-b border-line bg-transparent px-4 font-sans text-[13px] text-ink outline-none placeholder:text-ink-muted"
            />
            <Command.List className={inline ? "p-2" : "max-h-[340px] overflow-y-auto p-2"}>
                <Command.Empty className="px-3 py-8 text-center text-[12px] text-ink-muted">
                    Nothing matches that name.
                </Command.Empty>

                <Command.Group heading="Go" className={GROUP}>
                    <Command.Item
                        value="Projects home"
                        className={ITEM}
                        onSelect={() => {
                            choose(() => void navigate({ to: "/" }));
                        }}
                    >
                        <FolderKanban
                            aria-hidden="true"
                            className="h-4 w-4 text-ink-muted"
                            strokeWidth={1.6}
                        />
                        Projects
                    </Command.Item>
                    <Command.Item
                        value="Settings"
                        className={ITEM}
                        onSelect={() => {
                            choose(() => void navigate({ to: "/settings" }));
                        }}
                    >
                        <Settings
                            aria-hidden="true"
                            className="h-4 w-4 text-ink-muted"
                            strokeWidth={1.6}
                        />
                        Settings
                    </Command.Item>
                    <Command.Item
                        value="About licenses"
                        className={ITEM}
                        onSelect={() => {
                            choose(() => void navigate({ to: "/settings", hash: "about" }));
                        }}
                    >
                        <Info
                            aria-hidden="true"
                            className="h-4 w-4 text-ink-muted"
                            strokeWidth={1.6}
                        />
                        About
                    </Command.Item>
                    <Command.Item
                        value="Keyboard Shortcuts help keyboard chords"
                        className={ITEM}
                        onSelect={onShowShortcuts}
                    >
                        <Keyboard
                            aria-hidden="true"
                            className="h-4 w-4 text-ink-muted"
                            strokeWidth={1.6}
                        />
                        Keyboard Shortcuts
                    </Command.Item>
                </Command.Group>

                {onSettings ? (
                    <Command.Group heading="Settings tabs" className={GROUP}>
                        {SETTINGS_TABS.map((tab) => (
                            <Command.Item
                                key={tab}
                                value={`Settings tab ${tab} ${SETTINGS_TAB_SLUGS[tab]}`}
                                className={ITEM}
                                onSelect={() => {
                                    choose(
                                        () =>
                                            void navigate({
                                                to: "/settings",
                                                hash: SETTINGS_TAB_SLUGS[tab],
                                                replace: true,
                                            }),
                                    );
                                }}
                            >
                                <span
                                    aria-hidden="true"
                                    className="ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong"
                                />
                                {tab}
                            </Command.Item>
                        ))}
                    </Command.Group>
                ) : null}

                {videoId === undefined || currentVideo === undefined ? null : (
                    <Command.Group heading={`${currentVideo.name} · video`} className={GROUP}>
                        {VIDEO_TABS.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <Command.Item
                                    key={tab.id}
                                    value={`${tab.label} this video ${tab.id}`}
                                    className={ITEM}
                                    onSelect={() => {
                                        choose(
                                            () =>
                                                void navigate({
                                                    to: tab.to,
                                                    params: { projectId: projectId ?? "", videoId },
                                                }),
                                        );
                                    }}
                                >
                                    <Icon
                                        aria-hidden="true"
                                        className="h-4 w-4 text-ink-muted"
                                        strokeWidth={1.6}
                                    />
                                    {tab.label}
                                </Command.Item>
                            );
                        })}
                    </Command.Group>
                )}

                {projectId === undefined ? null : (
                    <Command.Group heading={projectName ?? "Current project"} className={GROUP}>
                        <Command.Item
                            value="General project overview"
                            className={ITEM}
                            onSelect={() => {
                                choose(
                                    () =>
                                        void navigate({
                                            to: "/projects/$projectId",
                                            params: { projectId },
                                        }),
                                );
                            }}
                        >
                            <Layers
                                aria-hidden="true"
                                className="h-4 w-4 text-ink-muted"
                                strokeWidth={1.6}
                            />
                            General
                        </Command.Item>
                        <Command.Item
                            value="Queue videos"
                            className={ITEM}
                            onSelect={() => {
                                choose(
                                    () =>
                                        void navigate({
                                            to: "/projects/$projectId",
                                            params: { projectId },
                                            hash: "queue",
                                        }),
                                );
                            }}
                        >
                            <ListOrdered
                                aria-hidden="true"
                                className="h-4 w-4 text-ink-muted"
                                strokeWidth={1.6}
                            />
                            Queue
                        </Command.Item>
                        {PROJECT_SECTIONS.filter((section) => section.id !== "general").map(
                            (section) => (
                                <Command.Item
                                    key={section.id}
                                    value={`${section.label} configuration ${section.id}`}
                                    className={ITEM}
                                    onSelect={() => {
                                        choose(
                                            () =>
                                                void navigate({
                                                    to: "/projects/$projectId/config/$section",
                                                    params: { projectId, section: section.id },
                                                }),
                                        );
                                    }}
                                >
                                    <span
                                        aria-hidden="true"
                                        className="ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong"
                                    />
                                    {section.label}
                                </Command.Item>
                            ),
                        )}
                    </Command.Group>
                )}

                {projectId === undefined || listed.length === 0 ? null : (
                    <Command.Group heading="Videos in this project" className={GROUP}>
                        {listed.map((video) => (
                            <Command.Item
                                key={video.id}
                                value={`${video.name} video ${video.id}`}
                                className={ITEM}
                                onSelect={() => {
                                    choose(
                                        () =>
                                            void navigate({
                                                to: "/projects/$projectId/videos/$videoId",
                                                params: { projectId, videoId: video.id },
                                            }),
                                    );
                                }}
                            >
                                <Video
                                    aria-hidden="true"
                                    className="h-4 w-4 shrink-0 text-ink-muted"
                                    strokeWidth={1.6}
                                />
                                <span className="min-w-0 flex-1 truncate">{video.name}</span>
                                <span className="shrink-0 font-mono text-[9.5px] text-ink-muted">
                                    #{video.order + 1}
                                </span>
                            </Command.Item>
                        ))}
                    </Command.Group>
                )}
            </Command.List>
            <div className="flex items-center gap-3 border-t border-line px-4 py-2 font-mono text-[10.5px] text-ink-muted">
                <kbd className="rounded border border-line px-1">↑↓</kbd>
                move
                <kbd className="rounded border border-line px-1">Enter</kbd>
                open
                <kbd className="rounded border border-line px-1">Esc</kbd>
                close
            </div>
        </>
    );

    if (inline) {
        return (
            <Command
                label="Command palette"
                className="w-full overflow-hidden rounded-xl border border-line-strong bg-surface font-sans text-ink shadow-elevation-2"
            >
                {body}
            </Command>
        );
    }

    return (
        <Command.Dialog
            open={open}
            onOpenChange={onOpenChange}
            label="Command palette"
            overlayClassName="fixed inset-0 z-50 bg-black/60"
            contentClassName="fixed top-[16vh] left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-line-strong bg-surface font-sans text-ink shadow-elevation-3"
        >
            {body}
        </Command.Dialog>
    );
}
