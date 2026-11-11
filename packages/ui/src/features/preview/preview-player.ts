import { useEffect, useRef } from "react";
import { Cpu, Film, Layers } from "lucide-react";

/**
 * Which frames the player is attached to.
 *
 * `decoded` is the Parallel Encoder's input graph and `encode` is that encoder's own output.
 * The service prepares only the requested window or scene, either of which can start before
 * a run exists. The encoded source needs detected scenes because it reproduces one chunk
 * from the scene's own first frame.
 */
export type PreviewSource = "original" | "decoded" | "encode";

/**
 * The length of one Decoded stream, in seconds of source video.
 *
 * Long enough that a window boundary is rare during review, short enough that the encode
 * finishes in seconds and the cache file stays small: 15 s of 10-bit 1080p is about 50 MB
 * on disk, where an open-ended stream of the same source reached 1.5 GB in four minutes.
 */
export const DECODED_WINDOW_SECONDS = 6;

export const SOURCES: Record<PreviewSource, { label: string; detail: string; icon: typeof Film }> =
    {
        original: {
            label: "Original",
            detail: "The source this video decodes",
            icon: Film,
        },
        decoded: {
            label: "Decoded",
            detail: "The Parallel Encoder's frames, visually lossless on demand",
            icon: Layers,
        },
        encode: {
            label: "Encoded",
            detail: "The scene's own chunk, produced by the run's exact encoder. A scene already previewed plays instantly; a new one appears as it encodes.",
            icon: Cpu,
        },
    };

/**
 * Dismiss a transport popover when the pointer goes elsewhere or Escape is pressed.
 *
 * The trigger and its panel share the returned root, so a click on either keeps it open. A
 * full-screen scrim, which the source menu used, would sit over the video and swallow the
 * click that resumes playback.
 */
export function usePopover(open: boolean, close: () => void) {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) {
            return;
        }
        const dismiss = (event: PointerEvent) => {
            if (root.current !== null && !root.current.contains(event.target as Node)) {
                close();
            }
        };
        const escape = (event: globalThis.KeyboardEvent) => {
            if (event.key === "Escape") {
                close();
            }
        };
        document.addEventListener("pointerdown", dismiss);
        window.addEventListener("keydown", escape);
        return () => {
            document.removeEventListener("pointerdown", dismiss);
            window.removeEventListener("keydown", escape);
        };
    }, [open, close]);
    return root;
}
