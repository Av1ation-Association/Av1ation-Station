import type { BrowserContext } from "@playwright/test";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/**
 * Abort every browser request that leaves the local services under test.
 *
 * Loopback is always allowed. A LAN host is not loopback by definition, so the test names
 * its advertised origin explicitly rather than widening the guard to every private address.
 * Blocked URLs are returned instead of only failing the request: teardown can then report
 * the exact font, image, or analytics call a product change introduced.
 */
export async function guardExternalRequests(
    context: BrowserContext,
    allowedOrigins: Iterable<string> = [],
): Promise<string[]> {
    const allowed = new Set<string>();
    for (const origin of allowedOrigins) {
        try {
            allowed.add(new URL(origin).origin);
        } catch {
            // A malformed host origin is already reported by the fixture that read it.
        }
    }

    const external: string[] = [];
    await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (LOOPBACK_HOSTS.has(url.hostname) || allowed.has(url.origin)) {
            await route.continue();
            return;
        }
        external.push(url.href);
        await route.abort("blockedbyclient");
    });
    return external;
}
