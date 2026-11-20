import type { SceneEncoderRequest, SceneView, VideoOverridesUpdate } from "@av1ation/contracts";

/** The two resources an encoder change can address. */
export type SceneEncoderScope = "video" | "scenes";

export type SceneEncoderWrite =
    { kind: "video"; body: VideoOverridesUpdate } | { kind: "scenes"; body: SceneEncoderRequest };

/**
 * Turn the chosen scope into the request that will be sent.
 *
 * A scene write sends indices rather than the documents themselves, so the server can reject
 * a selection that no longer matches the checkpoint instead of overwriting a newer one.
 * `clearChunks` travels in the same request as the encoder: deleting the chunks in a second
 * call would leave a window where a scene claims an encoder its chunk contradicts.
 */
export function encoderWrite(
    scope: SceneEncoderScope,
    scenes: readonly SceneView[],
    encoder: unknown,
    existingFields: Readonly<Record<string, unknown>>,
    clearChunks: boolean,
): SceneEncoderWrite {
    if (scope === "video") {
        return {
            kind: "video",
            body: { fields: { ...existingFields, encoder }, clear_chunks: clearChunks },
        };
    }
    return {
        kind: "scenes",
        body: {
            scenes: scenes.map((scene) => scene.index),
            encoder,
            clear_chunks: clearChunks,
        },
    };
}
