/**
 * True when a page is served by the machine's own loopback listener.
 *
 * The loopback listener is the local service and needs no credential; the LAN listener is
 * a separate authenticated origin. A local browser reviewing the built SPA must therefore
 * use the same transport as the desktop window, while a page opened from the network still
 * shows the pairing form.
 */
export function isLoopbackOrigin(origin: string): boolean {
    try {
        const host = new URL(origin).hostname;
        return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
    } catch {
        return false;
    }
}
