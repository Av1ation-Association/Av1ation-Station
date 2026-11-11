import { useEffect, useState, type ReactNode } from "react";

import { useProject, useSettings, useVideo } from "@av1ation/api";
import { Link, Outlet, useMatches, useRouterState } from "@tanstack/react-router";
import { ChevronRight, LayoutGrid, Settings } from "lucide-react";

import {
    isSettingsTrail,
    type BackTarget,
    type CrumbParams,
    type CrumbPath,
    type ScriptOwner,
    type TrailKind,
    type TrailParams,
} from "./route-meta";
import { sectionLabel } from "../shared/model/project-sections";
import { shortcutHint, useShortcut } from "../shared/shortcuts";
import { BackMark } from "./BackMark";
import { CommandPalette } from "./CommandPalette";
import { LogoMark } from "./LogoMark";
import { QuitGuard } from "./QuitGuard";
import { RunChip } from "./RunChip";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { TopBarTargetContext } from "../shared/TopBarActions";
import { UnsavedChangesProvider } from "../shared/UnsavedChanges";

const iconAction =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary transition-colors duration-150 hover:bg-hover hover:text-ink";

const CRUMB_LINK =
    "min-w-0 truncate rounded-sm text-ink-secondary transition-colors duration-150 hover:text-ink";

/**
 * The one up control, at the head of the bar.
 *
 * The top-left corner is where every application puts the way out of a screen, so the
 * control sits before the mark rather than at the end of a trail. Its icon is the mark
 * mirrored; the label appears above and below the contrails, never inside the icon, so
 * nothing is clipped as it arrives.
 */
function BackControl({ target }: { target: BackTarget }) {
    const projectId = target.params?.projectId ?? "";
    const videoId = target.params?.videoId ?? "";
    const templateId = target.params?.templateId ?? "";
    // A section goes back to its project, a video subpage to its video, and a template
    // section to its template, so the label names the document above. The queries are
    // already cached by the trail, and an irrelevant one never runs.
    const project = useProject(projectId, target.parentSource === "project");
    const video = useVideo(projectId, videoId, target.parentSource === "video");
    const settings = useSettings(target.parentSource === "template");
    const template =
        target.parentSource === "template"
            ? settings.data?.project_templates.find((entry) => entry.id === templateId)
            : undefined;
    const parent =
        target.parentSource === "project"
            ? (project.data?.name ?? target.parent)
            : target.parentSource === "video"
              ? (video.data?.name ?? target.parent)
              : target.parentSource === "template"
                ? (template?.name ?? target.parent)
                : target.parent;

    return (
        <Link
            to={target.to}
            {...(target.params === undefined ? {} : { params: target.params })}
            {...(target.hash === undefined ? {} : { hash: target.hash })}
            aria-label={target.label}
            className="group/back -ml-1 flex h-10 shrink-0 items-center rounded-md pr-0.5 pl-1 text-ink-secondary transition-colors duration-150 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
            <BackMark className="h-6 w-auto shrink-0" />
            {/* The trails run the whole label width and sit above the text, so the two lines
                rise out from behind them instead of arriving beside them. A reserved width
                keeps the mark still while they do. */}
            <span className="relative ml-1 flex h-10 w-16 shrink-0 flex-col justify-center">
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 -left-1 z-10 flex w-[calc(100%+0.25rem)] -translate-y-1/2 flex-col gap-[3px]"
                >
                    <span className="relative block h-[1.5px] w-full">
                        <Contrail />
                    </span>
                    <span className="relative block h-[1.5px] w-full">
                        <Contrail />
                    </span>
                </span>
                <span
                    aria-hidden="true"
                    className="z-0 translate-y-1.5 truncate text-[10.5px] leading-none font-medium text-ink opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover/back:translate-y-0 group-hover/back:opacity-100 group-focus-visible/back:translate-y-0 group-focus-visible/back:opacity-100 motion-reduce:transition-none"
                >
                    Back to
                </span>
                <span
                    aria-hidden="true"
                    className="z-0 mt-[11px] -translate-y-1.5 truncate text-[10.5px] leading-none text-ink-secondary opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover/back:translate-y-0 group-hover/back:opacity-100 group-focus-visible/back:translate-y-0 group-focus-visible/back:opacity-100 motion-reduce:transition-none"
                >
                    {parent}
                </span>
            </span>
        </Link>
    );
}

/**
 * One contrail.
 *
 * It always tapers into the background at its tail — that is what makes it read as motion
 * rather than a rule. Hover lifts it only a step, so the tail keeps fading out instead of
 * ending as a solid bar.
 */
function Contrail() {
    return (
        <span className="absolute inset-0 rounded-full bg-current opacity-50 transition-opacity duration-200 [mask-image:linear-gradient(to_right,black,transparent)] group-hover/back:opacity-65 group-focus-visible/back:opacity-65 motion-reduce:transition-none" />
    );
}

/** One breadcrumb entry, with a separator when it follows another. */
function Crumb({
    children,
    to,
    params,
    hash,
    current = false,
}: {
    children: ReactNode;
    to?: CrumbPath;
    params?: CrumbParams;
    hash?: string;
    current?: boolean;
}) {
    return (
        <li className={`flex min-w-0 items-center gap-1.5 ${current ? "text-ink" : "shrink"}`}>
            <ChevronRight
                aria-hidden="true"
                className="h-3 w-3 shrink-0 text-ink-muted"
                strokeWidth={1.8}
            />
            {to === undefined ? (
                <span
                    {...(current ? { "aria-current": "page" as const } : {})}
                    className="min-w-0 truncate"
                >
                    {children}
                </span>
            ) : (
                <Link
                    to={to}
                    {...(params === undefined ? {} : { params })}
                    {...(hash === undefined ? {} : { hash })}
                    className={CRUMB_LINK}
                >
                    {children}
                </Link>
            )}
        </li>
    );
}

function Trail({ children }: { children: ReactNode }) {
    return (
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
            <ol className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-secondary">
                {children}
            </ol>
        </nav>
    );
}

/** The leading Projects entry, which has no separator because it starts the trail. */
function ProjectsCrumb({ current = false }: { current?: boolean }) {
    return (
        <li className={`flex min-w-0 items-center gap-1.5 ${current ? "text-ink" : ""}`}>
            {current ? (
                <span aria-current="page" className="min-w-0 truncate">
                    Projects
                </span>
            ) : (
                <Link to="/" className={CRUMB_LINK}>
                    Projects
                </Link>
            )}
        </li>
    );
}

/** The leading Settings entry, which starts every settings trail. */
function SettingsCrumb() {
    return (
        <li className="flex min-w-0 items-center gap-1.5">
            <Link to="/settings" className={CRUMB_LINK}>
                Settings
            </Link>
        </li>
    );
}

/** One renderer for every registered route; the route match decides what it draws. */
function RouteTrail({
    trail,
    params,
    search,
}: {
    trail: TrailKind;
    params: TrailParams;
    search: ScriptOwner;
}) {
    const projectId = params.projectId ?? "";
    const videoId = params.videoId ?? "";
    const templateId = params.templateId ?? "";
    const section = params.section ?? "general";
    const owner = search.section ?? "general";
    const slot = search.part?.endsWith(".metric_input") === true ? "Metric input" : "Input";

    const project = useProject(projectId, projectId !== "");
    const video = useVideo(projectId, videoId, videoId !== "");
    const settings = useSettings(templateId !== "");
    const template = settings.data?.project_templates.find((entry) => entry.id === templateId);
    const projectName = project.data?.name ?? "Project";
    const videoName = video.data?.name ?? "Video";
    const templateName = template?.name ?? "Template";

    const projectCrumb = (
        <Crumb to="/projects/$projectId" params={{ projectId }}>
            {projectName}
        </Crumb>
    );
    const videoCrumb = (
        <Crumb to="/projects/$projectId/videos/$videoId" params={{ projectId, videoId }}>
            {videoName}
        </Crumb>
    );
    const projectTemplatesCrumb = (
        <Crumb to="/settings" hash="project-templates">
            Project Templates
        </Crumb>
    );
    const templateCrumb = (
        <Crumb to="/settings/templates/$templateId" params={{ templateId }}>
            {templateName}
        </Crumb>
    );

    switch (trail) {
        case "home":
            return (
                <Trail>
                    <ProjectsCrumb current />
                </Trail>
            );
        case "project":
            return (
                <Trail>
                    <ProjectsCrumb />
                    <Crumb current>{projectName}</Crumb>
                </Trail>
            );
        case "project-section":
            return (
                <Trail>
                    <ProjectsCrumb />
                    {projectCrumb}
                    <Crumb current>{sectionLabel(section)}</Crumb>
                </Trail>
            );
        case "project-script":
            return (
                <Trail>
                    <ProjectsCrumb />
                    {projectCrumb}
                    <Crumb
                        to="/projects/$projectId/config/$section"
                        params={{ projectId, section: owner }}
                    >
                        {sectionLabel(owner)}
                    </Crumb>
                    <Crumb>{slot}</Crumb>
                    <Crumb current>VapourSynth Script</Crumb>
                </Trail>
            );
        case "video":
            return (
                <Trail>
                    <ProjectsCrumb />
                    {projectCrumb}
                    <Crumb current>{videoName}</Crumb>
                </Trail>
            );
        case "video-section":
            return (
                <Trail>
                    <ProjectsCrumb />
                    {projectCrumb}
                    {videoCrumb}
                    <Crumb current>{sectionLabel(section)}</Crumb>
                </Trail>
            );
        case "video-script":
            return (
                <Trail>
                    <ProjectsCrumb />
                    {projectCrumb}
                    {videoCrumb}
                    <Crumb
                        to="/projects/$projectId/videos/$videoId/config/$section"
                        params={{ projectId, videoId, section: owner }}
                    >
                        {sectionLabel(owner)}
                    </Crumb>
                    <Crumb>{slot}</Crumb>
                    <Crumb current>VapourSynth Script</Crumb>
                </Trail>
            );
        case "video-logs":
        case "video-scenes":
        case "video-history":
            return (
                <Trail>
                    <ProjectsCrumb />
                    {projectCrumb}
                    {videoCrumb}
                    <Crumb current>
                        {trail === "video-logs"
                            ? "Logs"
                            : trail === "video-scenes"
                              ? "Scenes"
                              : "History"}
                    </Crumb>
                </Trail>
            );
        case "settings":
            return (
                <Trail>
                    <li className="flex min-w-0 items-center gap-1.5 text-ink">
                        <span aria-current="page" className="min-w-0 truncate">
                            Settings
                        </span>
                    </li>
                </Trail>
            );
        case "encoder-json":
            return (
                <Trail>
                    <SettingsCrumb />
                    <Crumb to="/settings" hash="encoders">
                        Encoders
                    </Crumb>
                    <Crumb current>JSON</Crumb>
                </Trail>
            );
        case "template":
            return (
                <Trail>
                    <SettingsCrumb />
                    {projectTemplatesCrumb}
                    <Crumb current>{templateName}</Crumb>
                </Trail>
            );
        case "template-section":
            return (
                <Trail>
                    <SettingsCrumb />
                    {projectTemplatesCrumb}
                    {templateCrumb}
                    <Crumb current>{sectionLabel(section)}</Crumb>
                </Trail>
            );
        case "template-script":
            return (
                <Trail>
                    <SettingsCrumb />
                    {projectTemplatesCrumb}
                    {templateCrumb}
                    <Crumb
                        to="/settings/templates/$templateId/$section"
                        params={{ templateId, section: owner }}
                    >
                        {sectionLabel(owner)}
                    </Crumb>
                    <Crumb>{slot}</Crumb>
                    <Crumb current>VapourSynth Script</Crumb>
                </Trail>
            );
    }
}

/**
 * The one 56 px bar every screen shares. It never re-mounts on navigation; only the
 * outlet cross-fades.
 */
export function AppShell() {
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    });
    const search = useRouterState({
        select: (state) => state.location.search,
    }) as ScriptOwner;
    const matches = useMatches();
    const active = matches[matches.length - 1];
    const trail = active?.staticData.trail ?? "home";
    const params: TrailParams = active?.params ?? {};
    const onSettings = isSettingsTrail(trail);
    const back = active?.staticData.back(params, search) ?? null;
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [shortcutsQueued, setShortcutsQueued] = useState(false);
    const [topBarTarget, setTopBarTarget] = useState<HTMLDivElement | null>(null);

    // The palette is reachable from anywhere, including a focused editor, so its chord is
    // the shared one rather than a listener this shell owns alone. While the reference is
    // open, the chord belongs to that modal.
    useShortcut("palette", () => setPaletteOpen((open) => !open), {
        when: () => !shortcutsOpen,
    });

    // A Radix modal marks everything outside it hidden, so the reference opens only after
    // the palette has closed instead of behind an aria-hidden container.
    useEffect(() => {
        if (shortcutsQueued && !paletteOpen) {
            setShortcutsQueued(false);
            setShortcutsOpen(true);
        }
    }, [paletteOpen, shortcutsQueued]);

    return (
        <div className="flex min-h-full flex-col bg-app">
            <a
                href="#main"
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-on-brand"
            >
                Skip to content
            </a>

            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-app/95 px-4">
                {back === null ? null : <BackControl target={back} />}

                <Link
                    to="/"
                    aria-label="Av1ation Station — Projects"
                    className="flex shrink-0 items-center gap-2 rounded-sm"
                >
                    <LogoMark className="h-6 w-auto text-ink" />
                    <span className="hidden text-[13px] font-semibold tracking-tight text-ink sm:inline">
                        Av1ation Station
                    </span>
                </Link>

                <span
                    aria-hidden="true"
                    className="hidden h-4 w-px shrink-0 bg-line-strong sm:block"
                />

                <RouteTrail trail={trail} params={params} search={search} />

                <RunChip />

                <div ref={setTopBarTarget} className="flex min-w-0 items-center gap-2" />

                <button
                    type="button"
                    onClick={() => setPaletteOpen(true)}
                    aria-label="Command palette"
                    aria-haspopup="dialog"
                    aria-expanded={paletteOpen}
                    data-tip={`Command palette (${shortcutHint("palette")})`}
                    data-tip-align="end"
                    className={iconAction}
                >
                    <LayoutGrid aria-hidden="true" className="h-4 w-4" strokeWidth={1.6} />
                </button>

                <Link
                    to="/settings"
                    aria-label="Settings"
                    data-tip="Settings"
                    data-tip-align="end"
                    aria-current={onSettings ? "page" : undefined}
                    className={`${iconAction} ${onSettings ? "bg-raised text-ink" : ""}`}
                >
                    <Settings aria-hidden="true" className="h-4 w-4" strokeWidth={1.6} />
                </Link>
            </header>

            <CommandPalette
                open={paletteOpen}
                onOpenChange={setPaletteOpen}
                onShowShortcuts={() => {
                    setPaletteOpen(false);
                    setShortcutsQueued(true);
                }}
            />
            <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
            <QuitGuard />

            <TopBarTargetContext.Provider value={topBarTarget}>
                <UnsavedChangesProvider>
                    <div key={pathname} className="outlet-enter flex-1">
                        <Outlet />
                    </div>
                </UnsavedChangesProvider>
            </TopBarTargetContext.Provider>
        </div>
    );
}
