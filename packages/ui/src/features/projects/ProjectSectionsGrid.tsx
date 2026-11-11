import { useMemo } from "react";

import { useProject, useProjectConfig } from "@av1ation/api";
import { Link } from "@tanstack/react-router";

import { documentFromValues } from "../../shared/schema/config-schema";
import {
    generalSummary,
    sectionConfigured,
    sectionSummary,
} from "../../shared/model/section-summary";
import { PROJECT_SECTIONS } from "../../shared/model/project-sections";
import { SectionBadge, SectionCard } from "../../shared/SectionCard";

/**
 * The project's configuration map.
 *
 * Every section is a card that is itself the destination, so opening one cannot silently
 * discard another section's draft. The project overview and General use the same grid:
 * General is a card here, and the only way back to its siblings is this grid.
 */
export function ProjectSectionsGrid({
    projectId,
    active,
    locked,
}: {
    projectId: string;
    active?: "general" | undefined;
    locked: boolean;
}) {
    const project = useProject(projectId);
    const config = useProjectConfig(projectId);
    const document = useMemo(
        () => (config.data === undefined ? {} : documentFromValues(config.data.values)),
        [config.data],
    );
    const general = project.data?.general;

    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PROJECT_SECTIONS.map((entry) => {
                const configured =
                    entry.id === "general"
                        ? general !== undefined
                        : sectionConfigured(entry.id, document);
                const current = entry.id === active;
                const card = (
                    <SectionCard
                        title={entry.label}
                        lines={
                            entry.id === "general"
                                ? generalSummary(general)
                                : sectionSummary(entry.id, document)
                        }
                        badge={
                            <SectionBadge tone={configured ? "custom" : "neutral"}>
                                {configured ? "Set" : "Engine default"}
                            </SectionBadge>
                        }
                        footer={
                            locked ? (
                                <span
                                    className="text-[10.5px] text-ink-muted"
                                    data-tip="Configuration is locked while an encode runs."
                                >
                                    Locked while an encode runs
                                </span>
                            ) : current ? (
                                <span className="text-[10.5px] text-ink-secondary">Editing</span>
                            ) : undefined
                        }
                    />
                );

                return (
                    <Link
                        key={entry.id}
                        to={
                            entry.id === "general"
                                ? "/projects/$projectId/config/general"
                                : "/projects/$projectId/config/$section"
                        }
                        params={
                            entry.id === "general"
                                ? { projectId }
                                : { projectId, section: entry.id }
                        }
                        className="group block min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                        {card}
                    </Link>
                );
            })}
        </div>
    );
}
