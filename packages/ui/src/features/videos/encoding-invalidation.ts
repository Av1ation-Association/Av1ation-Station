import type { SceneView } from "@av1ation/contracts";

import { getIn } from "../../shared/schema/config-schema";
import { sameValue } from "../../shared/structural-equality";

/** What an Encoding-section save changes about the frames each chunk was built from. */
export type EncodingInvalidationReason = "encoder" | "input";

export interface EncodingInvalidation {
    /** Why the save invalidates chunks; `null` means it does not. */
    reason: EncodingInvalidationReason | null;
    /** Scenes whose retained chunk the save invalidates. */
    scenes: readonly SceneView[];
}

/** No invalidation, shared so a section that cannot change an encode reuses one value. */
export const NO_INVALIDATION: EncodingInvalidation = { reason: null, scenes: [] };

/**
 * The scenes an Encoding-section save invalidates.
 *
 * The encoder document decides how a chunk is encoded; `sequences.parallel_encoder.input`
 * decides which frames it encodes. A changed input invalidates every chunk, including one
 * belonging to a scene with its own encoder: the write leaves that scene's document alone,
 * but the next run still reads the new frames. A changed video encoder invalidates only the
 * scenes that still inherit it, because the write rewrites exactly those documents. The
 * worker count changes neither, so it invalidates nothing.
 */
export function encodingInvalidation(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    scenes: readonly SceneView[],
): EncodingInvalidation {
    const input = ["sequences", "parallel_encoder", "input"];
    if (!sameValue(getIn(before, input), getIn(after, input))) {
        return { reason: "input", scenes };
    }
    if (!sameValue(before.encoder, after.encoder)) {
        return {
            reason: "encoder",
            scenes: scenes.filter((scene) => !scene.encoder_custom),
        };
    }
    return NO_INVALIDATION;
}
