import { useCallback, useRef } from "react";

import { useTransport } from "@av1ation/api";
import { toast } from "sonner";

import { isTextEntryTarget, useShortcut } from "../shared/shortcuts";
import { clampZoom, steppedZoom } from "../shared/webview-zoom";

/**
 * The desktop window's zoom keys.
 *
 * This is a host capability, not page styling: the host changes the webview's own scale, so
 * fixed pixel chrome, Monaco, and the preview all scale together. A browser has no
 * `setZoom`, so it keeps its native zoom and this component stays dormant.
 */
export function WebviewZoom() {
    const transport = useTransport();
    // Repeated keydowns can arrive before React commits a render, so the next step reads the
    // value this component last sent instead of a stale state value.
    const current = useRef(1);
    const setZoomOnHost = transport.setZoom;
    const available = setZoomOnHost !== undefined;

    const apply = useCallback(
        (next: number) => {
            const factor = clampZoom(next);
            const previous = current.current;
            current.current = factor;
            if (setZoomOnHost === undefined) {
                return;
            }
            void setZoomOnHost(factor).catch(() => {
                // The next press retries from the last value the host accepted.
                current.current = previous;
                toast.error("The window could not change zoom.");
            });
        },
        [setZoomOnHost],
    );

    // Typing owns its keys: a text field and Monaco keep their own zoom and text commands.
    const when = useCallback((event: KeyboardEvent) => !isTextEntryTarget(event.target), []);

    useShortcut("zoomIn", () => apply(steppedZoom(current.current, "in")), {
        enabled: available,
        when,
    });
    useShortcut("zoomOut", () => apply(steppedZoom(current.current, "out")), {
        enabled: available,
        when,
    });
    useShortcut("zoomReset", () => apply(1), { enabled: available, when });

    return null;
}
