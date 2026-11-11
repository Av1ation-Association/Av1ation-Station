import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { subscribeToEvents } from "./event-stream";

type Listener = (event: Event) => void;

class FakeEventSource {
    readonly #listeners = new Map<string, Set<Listener>>();
    closed = false;

    constructor(readonly url: string) {}

    addEventListener(type: string, listener: Listener): void {
        const listeners = this.#listeners.get(type) ?? new Set<Listener>();
        listeners.add(listener);
        this.#listeners.set(type, listeners);
    }

    close(): void {
        this.closed = true;
    }

    emit(type: string, event: Event): void {
        for (const listener of this.#listeners.get(type) ?? []) {
            listener(event);
        }
    }
}

function encodeEvent(value: string, lastEventId: string): Event {
    return { data: JSON.stringify({ value }), lastEventId } as MessageEvent<string>;
}

async function flush(): Promise<void> {
    for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
    }
}

const schema = z.object({ value: z.string() });

describe("subscribeToEvents", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("mints a fresh ticket and resumes after the last accepted event", async () => {
        vi.useFakeTimers();
        let ticketNumber = 0;
        const mintTicket = vi.fn(async () => {
            ticketNumber += 1;
            return `ticket-${ticketNumber}`;
        });
        const sources: FakeEventSource[] = [];
        const received: string[] = [];
        const close = subscribeToEvents(
            {
                baseUrl: "http://service",
                path: "/api/events",
                eventSourceFactory: (url) => {
                    const source = new FakeEventSource(url);
                    sources.push(source);
                    return source as unknown as EventSource;
                },
                mintTicket,
            },
            schema,
            (event) => received.push(event.value),
        );

        await flush();
        expect(mintTicket).toHaveBeenCalledTimes(1);
        expect(sources).toHaveLength(1);
        expect(sources[0]?.url).toBe("http://service/api/events?ticket=ticket-1");

        sources[0]?.emit("encode", encodeEvent("first", "12"));
        expect(received).toEqual(["first"]);

        sources[0]?.emit("error", {} as Event);
        expect(sources[0]?.closed).toBe(true);
        await vi.advanceTimersByTimeAsync(1_000);
        await flush();

        expect(mintTicket).toHaveBeenCalledTimes(2);
        expect(sources).toHaveLength(2);
        expect(sources[1]?.url).toBe("http://service/api/events?ticket=ticket-2&since=13");

        sources[1]?.emit("encode", encodeEvent("second", "13"));
        expect(received).toEqual(["first", "second"]);

        close();
        expect(sources[1]?.closed).toBe(true);
        await vi.advanceTimersByTimeAsync(30_000);
        await flush();
        expect(sources).toHaveLength(2);
    });

    it("keeps retrying when the ticket exchange fails", async () => {
        vi.useFakeTimers();
        let attempts = 0;
        const mintTicket = vi.fn(async () => {
            attempts += 1;
            if (attempts === 1) {
                throw new Error("ticket unavailable");
            }
            return "ticket";
        });
        const sources: FakeEventSource[] = [];
        const close = subscribeToEvents(
            {
                baseUrl: "http://service",
                path: "/api/events",
                eventSourceFactory: (url) => {
                    const source = new FakeEventSource(url);
                    sources.push(source);
                    return source as unknown as EventSource;
                },
                mintTicket,
            },
            schema,
            () => undefined,
        );

        await flush();
        expect(mintTicket).toHaveBeenCalledTimes(1);
        expect(sources).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(1_000);
        await flush();
        expect(mintTicket).toHaveBeenCalledTimes(2);
        expect(sources).toHaveLength(1);
        expect(sources[0]?.url).toBe("http://service/api/events?ticket=ticket");

        close();
    });
});
