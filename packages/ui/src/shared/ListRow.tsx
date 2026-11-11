import type { ComponentProps, ReactNode } from "react";

import { OpenRow } from "./OpenRow";

/**
 * The one name link every management row uses. Truncation, hover and the focus ring belong
 * to the row, not to each list, so a new list cannot open with a different keyboard target.
 */
export const ROW_NAME_CLASS =
    "block min-w-0 truncate rounded-sm text-[13px] font-medium text-ink hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * A management-list entry: the whole card opens its record, its name is a real link, and the
 * controls inside it stay controls. A screen supplies the fields and the layout; this owns
 * the row element and the click surface, so projects, the queue and templates cannot each
 * answer "what does clicking this row do?" differently.
 */
export function ListRow({
    onOpen,
    name,
    detail,
    leading,
    trailing,
    below,
    className = "",
    liProps,
}: {
    onOpen: () => void;
    /** The row's name link; use `ROW_NAME_CLASS` so every list shares its focus treatment. */
    name: ReactNode;
    /** The line under the name, inside the row's click surface. */
    detail?: ReactNode;
    /** Controls before the name column: selection, reorder grip, default marker. */
    leading?: ReactNode;
    /** Controls after the name column: badges, sizes and actions. */
    trailing?: ReactNode;
    /** Content under the row but outside its click surface, such as progress or an error. */
    below?: ReactNode;
    /** The screen's layout for the row, including its padding and grid columns. */
    className?: string;
    /** Attributes for the row's `li`, such as the queue's drag and drop handlers. */
    liProps?: Omit<ComponentProps<"li">, "children">;
}) {
    const { className: liClassName = "", ...li } = liProps ?? {};
    return (
        <li className={liClassName} {...li}>
            <OpenRow
                className={`cursor-pointer transition-colors duration-150 ${className}`}
                onOpen={onOpen}
            >
                {leading}
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">{name}</div>
                    {detail}
                </div>
                {trailing}
            </OpenRow>
            {below}
        </li>
    );
}
