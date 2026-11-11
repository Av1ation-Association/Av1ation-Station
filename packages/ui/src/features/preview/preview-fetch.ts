/**
 * Read a proxy response to its end, so the build it is streaming finishes and is cached.
 *
 * A prefetch that hangs up after the first chunk would let the service stop the build when
 * its last viewer leaves, which defeats the point of preparing the next window or scene.
 */
export async function drainPreview(response: Response): Promise<void> {
    if (!response.ok || response.body === null) {
        return;
    }
    const reader = response.body.getReader();
    for (;;) {
        const { done } = await reader.read();
        if (done) {
            return;
        }
    }
}
