import type { ZodType } from "zod";

export interface EventStreamOptions {
    baseUrl: string;
    path: string;
    eventSourceFactory: (url: string) => EventSource;
    /** Exchange the LAN bearer token for a fresh one-use ticket on each attempt. */
    mintTicket?: (() => Promise<string>) | undefined;
    initialRetryMs?: number;
    maximumRetryMs?: number;
}

/**
 * Owns one server-sent-event subscription for its whole lifetime.
 *
 * The service's LAN ticket is deliberately one-use, but EventSource retries the same URL by
 * itself. This module closes that gap: every attempt mints a fresh ticket, and a reconnect
 * carries the sequence after the last parsed event so the service can replay the gap. It is
 * also the only place that decides when a stream is closed, so an unmount cannot leave a
 * retry timer behind.
 */
export function subscribeToEvents<T>(
    options: EventStreamOptions,
    schema: ZodType<T>,
    onEvent: (event: T) => void,
): () => void {
    const initialRetryMs = options.initialRetryMs ?? 1_000;
    const maximumRetryMs = options.maximumRetryMs ?? 30_000;
    const mintTicket = options.mintTicket;

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = initialRetryMs;
    let closed = false;
    let connecting = false;
    let lastEventId: string | null = null;

    const listener = (event: Event) => {
        const message = event as MessageEvent<string>;
        try {
            const payload: unknown = JSON.parse(message.data);
            const parsed = schema.safeParse(payload);
            if (!parsed.success) {
                return;
            }
            // The id belongs to the event we accepted, not to an event a future schema might
            // reject. Keeping it here lets a reconnect start at the very next sequence.
            if (message.lastEventId !== "") {
                lastEventId = message.lastEventId;
            }
            onEvent(parsed.data);
        } catch {
            // A malformed event must not tear down the stream; the next event is independent.
        }
    };

    const scheduleRetry = () => {
        if (closed || retryTimer !== null) {
            return;
        }
        const delay = retryDelay;
        retryDelay = Math.min(retryDelay * 2, maximumRetryMs);
        retryTimer = setTimeout(() => {
            retryTimer = null;
            void connect();
        }, delay);
    };

    const connect = async () => {
        if (closed || connecting) {
            return;
        }
        connecting = true;
        try {
            const ticket = mintTicket === undefined ? null : await mintTicket();
            if (closed) {
                return;
            }
            const next = sourceUrl(options, ticket, nextSince(lastEventId));
            const opened = options.eventSourceFactory(next);
            source = opened;
            opened.addEventListener("open", () => {
                retryDelay = initialRetryMs;
            });
            opened.addEventListener("encode", listener);
            opened.addEventListener("error", () => {
                if (closed || source !== opened) {
                    return;
                }
                source = null;
                opened.close();
                scheduleRetry();
            });
        } catch {
            if (!closed) {
                scheduleRetry();
            }
        } finally {
            connecting = false;
        }
    };

    void connect();
    return () => {
        if (closed) {
            return;
        }
        closed = true;
        if (retryTimer !== null) {
            clearTimeout(retryTimer);
            retryTimer = null;
        }
        source?.close();
        source = null;
    };
}

/**
 * The service replays `seq >= since`, so a reconnect starts one past the last event the
 * client accepted. A non-numeric id belongs to another stream kind; omit the cursor rather
 * than send a query the service cannot parse.
 */
function nextSince(lastEventId: string | null): string | null {
    if (lastEventId === null || lastEventId === "") {
        return null;
    }
    const sequence = Number(lastEventId);
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence === Number.MAX_SAFE_INTEGER) {
        return null;
    }
    return String(sequence + 1);
}

function sourceUrl(
    options: EventStreamOptions,
    ticket: string | null,
    since: string | null,
): string {
    const params: string[] = [];
    if (ticket !== null) {
        params.push(`ticket=${encodeURIComponent(ticket)}`);
    }
    if (since !== null) {
        params.push(`since=${encodeURIComponent(since)}`);
    }
    if (params.length === 0) {
        return `${options.baseUrl}${options.path}`;
    }
    const separator = options.path.includes("?") ? "&" : "?";
    return `${options.baseUrl}${options.path}${separator}${params.join("&")}`;
}
