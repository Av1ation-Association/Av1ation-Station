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
 * The lossless proxy is large: on the two 1080p 10-bit test projects a six-second window
 * measured 73.5-117.3 MiB, which is too close to Chromium's roughly 150 MB `SourceBuffer`
 * cap once more than one is retained. A two-second window measured 25.3-31.8 MiB. The
 * player's buffer plan spends a fixed byte budget at the measured lossless rate, so the
 * lead grows on a cheaper source and shrinks on a dearer one, and it sizes the prebuilt
 * runway from the measured build time. The service opens the decode graph once per source
 * and reuses it across windows; a window costs a lossless encode and a mux (about
 * 1.2-1.4 s on the measured projects). Those warm builds overlap the picture, and the
 * append that reaches one reads the finished file instead of waiting at the seam.
 */
export const DECODED_WINDOW_SECONDS = 2;

export const SOURCES: Record<PreviewSource, { label: string; detail: string; icon: typeof Film }> =
    {
        original: {
            label: "Original",
            detail: "The source this video decodes",
            icon: Film,
        },
        decoded: {
            label: "Decoded",
            detail: "The Parallel Encoder's frames, losslessly at the source resolution",
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
