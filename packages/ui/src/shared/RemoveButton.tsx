import { Trash2 } from "lucide-react";

import { ExpandableActionButton } from "./ExpandableActionButton";

/**
 * The destructive row action: the shared compact action with its trash icon and danger tone.
 *
 * Rows name what is being removed in the accessible label, while the expanding label and the
 * icon stay the same everywhere.
 */
export function RemoveButton({
    target,
    label = "Remove",
    onClick,
    disabled = false,
}: {
    target: string;
    label?: string;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <ExpandableActionButton
            label={label}
            ariaLabel={`${label} ${target}`}
            icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
            onClick={onClick}
            disabled={disabled}
            tone="danger"
        />
    );
}
