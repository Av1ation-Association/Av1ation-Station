import type { ReactNode } from "react";

import { MenuItem } from "../../shared/Menu";

/**
 * One row action inside the queue header or the bulk-action menu.
 *
 * Both menus had identical button semantics; keeping one component means a disabled row,
 * its explanation, and the danger treatment cannot drift between them. The menu semantics
 * themselves come from the shared `MenuItem`.
 */
export function QueueMenuItem({
    children,
    onClick,
    disabled,
    reason,
    icon,
    danger = false,
}: {
    children: string;
    onClick: () => void;
    disabled?: boolean;
    reason?: string | undefined;
    icon?: ReactNode;
    danger?: boolean;
}) {
    return (
        <MenuItem
            onSelect={() => onClick()}
            disabled={disabled}
            title={reason}
            tone={danger ? "danger" : "default"}
        >
            {icon === undefined ? null : (
                <span
                    aria-hidden="true"
                    className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
                >
                    {icon}
                </span>
            )}
            {children}
        </MenuItem>
    );
}
