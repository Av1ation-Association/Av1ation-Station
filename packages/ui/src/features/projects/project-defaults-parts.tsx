import type { GeneralDefaults } from "@av1ation/contracts";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { SectionBadge, SectionCard } from "../../shared/SectionCard";
import {
    generalSummary,
    sectionConfigured,
    sectionSummary,
} from "../../shared/model/section-summary";
import { DEFINITIONS, type SectionDefinition } from "../../shared/model/section-definitions";

export type SectionId = "general" | SectionDefinition["id"];

export function isSection(value: string): value is SectionId {
    return value === "general" || value in DEFINITIONS;
}

export function sectionTitle(id: SectionId): string {
    return id === "general" ? "General" : DEFINITIONS[id].title;
}

/**
 * The overview and one section share this header.
 *
 * The tab strip, the breadcrumb, or the card the user clicked already names the page, so
 * the body does not repeat it. Only the sentence explaining what the page affects remains.
 */
export function SettingsHeader({
    description,
    actions,
}: {
    description: string;
    actions?: ReactNode;
}) {
    return (
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <p className="m-0 max-w-[72ch] text-[13px] leading-relaxed text-ink-secondary">
                {description}
            </p>
            {actions}
        </header>
    );
}

export function GridCard({
    id,
    templateId,
    general,
    document,
}: {
    id: SectionId;
    templateId: string;
    general: GeneralDefaults | undefined;
    document: Record<string, unknown>;
}) {
    const title = sectionTitle(id);
    const configured = id === "general" ? general !== undefined : sectionConfigured(id, document);
    return (
        <Link
            to="/settings/templates/$templateId/$section"
            params={{ templateId, section: id }}
            onClick={(event) => {
                // Selecting the card's text is a selection, not a request to open it.
                if (!window.getSelection()?.isCollapsed) {
                    event.preventDefault();
                }
            }}
            className="group block min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
            <SectionCard
                title={title}
                lines={id === "general" ? generalSummary(general) : sectionSummary(id, document)}
                badge={
                    <SectionBadge tone={configured ? "custom" : "neutral"}>
                        {configured ? "Set" : "Engine default"}
                    </SectionBadge>
                }
            />
        </Link>
    );
}
