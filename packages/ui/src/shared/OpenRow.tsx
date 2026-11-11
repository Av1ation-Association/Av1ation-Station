import type { ReactNode } from "react";

/**
 * Descendants that activate on their own. A click that lands on one of them belongs to it,
 * not to the row that contains it, so the row must not navigate as well.
 */
const OWN_CONTROL = "a,button,input,select,textarea,label,summary";

/**
 * A whole-row pointer target.
 *
 * Every list — projects, the video queue, project templates, configuration sections — opens
 * its entry from anywhere on the card, not just its name. The row's own link remains the
 * accessible and middle-clickable target; this widens the pointer target without turning the
 * card into an anchor, which could not legally contain the controls beside the name.
 *
 * Two clicks are deliberately not row clicks: one that ends a text selection, so a drag
 * across the card's copy highlights it instead of navigating, and one on a control, so the
 * star, rename, menu and delete buttons keep working.
 */
export function OpenRow({
    as: Element = "div",
    onOpen,
    className = "",
    children,
}: {
    as?: "article" | "div" | "li";
    onOpen: () => void;
    className?: string;
    children: ReactNode;
}) {
    return (
        <Element
            className={`cursor-pointer ${className}`}
            onClick={(event) => {
                if (event.defaultPrevented) {
                    return;
                }
                if ((event.target as HTMLElement).closest(OWN_CONTROL) !== null) {
                    return;
                }
                if (!window.getSelection()?.isCollapsed) {
                    return;
                }
                onOpen();
            }}
        >
            {children}
        </Element>
    );
}
