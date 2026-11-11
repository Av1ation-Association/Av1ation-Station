import { CircleAlert, TriangleAlert } from "lucide-react";

import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "../../shared/Menu";
import type { SceneIssue } from "../../shared/model/scene-layout";

/**
 * Boundary problems as a notification, not a banner.
 *
 * The list used to be a strip between the player and the timeline, which took height from
 * the video for something that is only occasionally actionable. The same information is
 * kept behind an icon in the video's tab bar: a badge counts the issues, and opening it
 * names each one so a click can jump to the block that needs attention. Only errors disable
 * Start; a gap is listed because frames are missing, but trimming frames deliberately is
 * allowed.
 */
export function SceneValidationMenu({
    issues,
    onSelect,
    className = "",
}: {
    issues: readonly SceneIssue[];
    onSelect: (index: number) => void;
    className?: string | undefined;
}) {
    if (issues.length === 0) {
        return null;
    }

    const errors = issues.filter((issue) => issue.severity === "error").length;
    const Icon = errors > 0 ? CircleAlert : TriangleAlert;
    const tone = errors > 0 ? "text-danger" : "text-warning";
    const label =
        errors > 0
            ? `${String(errors)} scene boundary ${errors === 1 ? "issue" : "issues"}`
            : `${String(issues.length)} scene boundary ${issues.length === 1 ? "warning" : "warnings"}`;

    return (
        <div className={`relative ${className}`}>
            <Menu>
                <MenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={label}
                        data-tip={label}
                        className="relative inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
                    >
                        <Icon aria-hidden="true" className={`h-4 w-4 ${tone}`} strokeWidth={1.9} />
                        <span
                            aria-hidden="true"
                            className={`rounded-full px-1 py-px font-mono text-[9px] leading-none tabular-nums ${
                                errors > 0
                                    ? "bg-danger-soft text-danger"
                                    : "bg-warning-soft text-warning"
                            }`}
                        >
                            {issues.length.toLocaleString()}
                        </span>
                    </button>
                </MenuTrigger>

                <MenuContent
                    align="end"
                    sideOffset={6}
                    aria-label="Scene boundary issues"
                    className="w-[340px] max-w-[calc(100vw-32px)]"
                >
                    <MenuLabel className="px-2 py-1.5 text-[10.5px] text-ink-secondary">
                        {errors > 0
                            ? `${String(errors)} ${errors === 1 ? "boundary needs" : "boundaries need"} fixing before Start`
                            : "Scene boundaries are usable"}
                    </MenuLabel>
                    <div className="max-h-[280px] overflow-y-auto">
                        {issues.map((issue) => (
                            <MenuItem
                                key={`${issue.kind}-${String(issue.scene)}`}
                                onSelect={() => onSelect(issue.scene)}
                                className="items-start text-[10.5px] leading-relaxed"
                            >
                                <span
                                    aria-hidden="true"
                                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                                        issue.severity === "error" ? "bg-danger" : "bg-warning"
                                    }`}
                                />
                                <span className="min-w-0">{issue.message}</span>
                            </MenuItem>
                        ))}
                    </div>
                </MenuContent>
            </Menu>
        </div>
    );
}
