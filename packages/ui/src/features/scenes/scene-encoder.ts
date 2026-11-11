import type { ConfigOverrides, SceneEncoderRequest, SceneView } from "@av1ation/contracts";

/** The two resources an encoder change can address. */
export type SceneEncoderScope = "video" | "scenes";

export type SceneEncoderWrite =
    { kind: "video"; body: ConfigOverrides } | { kind: "scenes"; body: SceneEncoderRequest };

/**
 * Turn the chosen scope into the request that will be sent.
 *
 * The video scope is a whole `encoder` section replacement inside the existing overrides,
 * so unrelated fields survive. The scene scope writes only the selected scene indices; it
 * never writes the video's overrides as a side effect of one slider. Keeping this mapping
 * pure makes the difference between the two resources testable without a sheet.
 */
export function encoderWrite(
    scope: SceneEncoderScope,
    scenes: readonly SceneView[],
    encoder: unknown,
    existingFields: Readonly<Record<string, unknown>>,
): SceneEncoderWrite {
    if (scope === "video") {
        return {
            kind: "video",
            body: { fields: { ...existingFields, encoder } },
        };
    }
    return {
        kind: "scenes",
        body: {
            scenes: scenes.map((scene) => scene.index),
            encoder,
        },
    };
}
