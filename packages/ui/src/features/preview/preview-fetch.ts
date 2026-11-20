/**
 * Read a proxy response to its end, so the build it is streaming finishes and is cached.
 *
 * A prefetch that hangs up after the first chunk would let the service stop the build when
 * its last viewer leaves, which defeats the point of preparing the next window or scene.
 * The byte count is what lets the player learn the source's lossless rate from a response
 * that has no `Content-Length`; callers that only need the side effect ignore it.
 */
export async function drainPreview(response: Response): Promise<number> {
    if (!response.ok || response.body === null) {
        return 0;
    }
    const reader = response.body.getReader();
    let bytes = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            return bytes;
        }
        bytes += value?.length ?? 0;
    }
}
