/**
 * A transient identity for client-only rows.
 *
 * `crypto.randomUUID` is restricted to secure contexts, so a LAN page served over plain
 * HTTP does not have it. These keys are not credentials; `getRandomValues` is available in
 * an insecure context, and the timestamp fallback keeps an old runtime usable.
 */
export function randomId(): string {
    const webCrypto = globalThis.crypto;
    if (typeof webCrypto?.randomUUID === "function") {
        return webCrypto.randomUUID();
    }
    if (typeof webCrypto?.getRandomValues === "function") {
        const bytes = webCrypto.getRandomValues(new Uint8Array(16));
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
