import { useRef, useState } from "react";

import type { ChunkScene } from "./SceneEncoderChunkGuard";

/** Keep the chunks, delete them, or cancel the save without writing anything. */
export type ChunkGuardDecision = boolean | null;

interface PendingGuard {
    scenes: readonly ChunkScene[];
    eyebrow: string;
    reason: "encoder" | "input";
}

/**
 * The deferred decision behind a chunk-invalidating save.
 *
 * The save callback awaits `ask` instead of writing first, so the dialog is the only thing
 * that decides whether the request is sent. `true` keeps the chunks, `false` deletes them,
 * and `null` cancels the save.
 */
export function useChunkGuard() {
    const [pending, setPending] = useState<PendingGuard | null>(null);
    const resolver = useRef<((decision: ChunkGuardDecision) => void) | null>(null);

    const ask = (
        scenes: readonly ChunkScene[],
        options: { eyebrow: string; reason?: "encoder" | "input" },
    ): Promise<ChunkGuardDecision> =>
        new Promise((resolve) => {
            resolver.current = resolve;
            setPending({
                scenes,
                eyebrow: options.eyebrow,
                reason: options.reason ?? "encoder",
            });
        });

    const settle = (decision: ChunkGuardDecision) => {
        const resolve = resolver.current;
        resolver.current = null;
        setPending(null);
        resolve?.(decision);
    };

    return {
        ask,
        props: {
            open: pending !== null,
            scenes: pending?.scenes ?? [],
            eyebrow: pending?.eyebrow ?? "",
            reason: pending?.reason ?? "encoder",
            onCancel: () => settle(null),
            onSave: (keep: boolean) => settle(keep),
            saving: false,
        },
    };
}
