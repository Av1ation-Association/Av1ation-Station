import { Link } from "@tanstack/react-router";
import { ChevronDown, ListTree } from "lucide-react";

import { formatBytes } from "../../shared/format";
import {
    Menu,
    MenuContent,
    MenuItem,
    MenuLabel,
    MenuSeparator,
    MenuTrigger,
} from "../../shared/Menu";
import { PROJECT_SECTIONS, type ProjectSectionId } from "../../shared/model/project-sections";

/**
 * The rail is hidden below `lg`, so the same navigation becomes a full-width disclosure there.
 *
 * It uses the shared menu primitive rather than a native `<details>`: a route change closes
 * it, Escape behaves like every other menu, and the links keep menu semantics.
 */
export function SectionMenu({
    projectId,
    active,
    videoCount,
    retainedBytes,
    onAddVideos,
}: {
    projectId: string;
    active: ProjectSectionId;
    videoCount?: number | undefined;
    retainedBytes?: number | undefined;
    onAddVideos?: (() => void) | undefined;
}) {
    const activeLabel =
        PROJECT_SECTIONS.find((section) => section.id === active)?.label ?? "General";

    return (
        <div className="relative lg:hidden">
            <Menu>
                <MenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={`Sections, ${activeLabel} selected`}
                        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-line-strong bg-raised px-3 text-[11.5px] text-ink-secondary hover:bg-hover hover:text-ink"
                    >
                        <ListTree aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        <span className="shrink-0 text-ink-muted">Section</span>
                        <span className="min-w-0 flex-1 truncate text-left font-medium text-ink">
                            {activeLabel}
                        </span>
                        <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" />
                    </button>
                </MenuTrigger>
                <MenuContent
                    align="start"
                    className="w-[var(--radix-dropdown-menu-trigger-width)]"
                    aria-label="Project sections"
                >
                    {PROJECT_SECTIONS.map((section) => {
                        const current = section.id === active;
                        return (
                            <MenuItem
                                key={section.id}
                                asChild
                                className={
                                    current
                                        ? "bg-raised font-medium text-ink"
                                        : "text-ink-secondary"
                                }
                            >
                                {section.id === "general" ? (
                                    <Link
                                        to="/projects/$projectId"
                                        params={{ projectId }}
                                        activeOptions={{ exact: true }}
                                        aria-current={current ? "page" : undefined}
                                    >
                                        {section.label}
                                    </Link>
                                ) : (
                                    <Link
                                        to="/projects/$projectId/config/$section"
                                        params={{ projectId, section: section.id }}
                                        activeOptions={{ exact: true }}
                                        aria-current={current ? "page" : undefined}
                                    >
                                        {section.label}
                                    </Link>
                                )}
                            </MenuItem>
                        );
                    })}
                    <MenuSeparator />
                    <MenuItem asChild>
                        <Link
                            to="/projects/$projectId"
                            params={{ projectId }}
                            hash="queue"
                            activeOptions={{ exact: true, includeHash: true }}
                        >
                            Queue
                            {videoCount === undefined ? null : (
                                <span className="ml-auto font-mono text-[10px] text-ink-muted">
                                    {videoCount} {videoCount === 1 ? "video" : "videos"}
                                </span>
                            )}
                        </Link>
                    </MenuItem>
                    {onAddVideos === undefined ? null : (
                        <MenuItem onSelect={onAddVideos} className="text-brand-text">
                            Add videos…
                        </MenuItem>
                    )}
                    {videoCount === undefined ? null : (
                        <MenuLabel className="mt-1 border-t border-line pt-2">
                            {videoCount} {videoCount === 1 ? "video" : "videos"}
                            {retainedBytes === undefined || retainedBytes === 0
                                ? null
                                : ` · ${formatBytes(retainedBytes)} on disk`}
                        </MenuLabel>
                    )}
                </MenuContent>
            </Menu>
        </div>
    );
}
