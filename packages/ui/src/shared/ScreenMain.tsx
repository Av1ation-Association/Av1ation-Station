import type { ComponentPropsWithoutRef } from "react";

import { useEmbeddedDemoHost } from "./demo-mode";

/**
 * The screen's scroll and landmark root.
 *
 * The desktop application owns the document, so one `<main id="main">` per screen is the
 * landmark the skip link targets. The marketing site already has its own `<main>` and mounts
 * these screens inside it; a second main would split the document's landmark tree. The
 * embedded demo therefore renders a plain block with the same layout class.
 */
export function ScreenMain({ children, ...props }: ComponentPropsWithoutRef<"main">) {
    const embedded = useEmbeddedDemoHost() !== null;
    if (embedded) {
        return (
            <div {...props} id={undefined} data-screen-main>
                {children}
            </div>
        );
    }
    return (
        <main {...props} id="main" data-screen-main>
            {children}
        </main>
    );
}
