import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError } from "./types";
import { HttpTransport } from "./http";

const payload = z.object({ value: z.string() });

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

async function flush(): Promise<void> {
    for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
    }
}

class FakeEventSource {
    closed = false;
    readonly listeners = new Map<string, Set<(event: Event) => void>>();

    constructor(readonly url: string) {}

    addEventListener(type: string, listener: (event: Event) => void): void {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
    }

    close(): void {
        this.closed = true;
    }

    emit(type: string, event: Event): void {
        for (const listener of this.listeners.get(type) ?? []) {
            listener(event);
        }
    }
}

class FakeWebSocket {
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    static last: FakeWebSocket | null = null;
    static readonly instances: FakeWebSocket[] = [];

    readonly listeners = new Map<string, Set<(event: Event) => void>>();
    readonly sent: string[] = [];
    readyState = 0;

    constructor(readonly url: string) {
        FakeWebSocket.last = this;
        FakeWebSocket.instances.push(this);
        queueMicrotask(() => {
            this.readyState = FakeWebSocket.OPEN;
            this.emit("open");
        });
    }

    addEventListener(type: string, listener: (event: Event) => void): void {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
    }

    send(message: string): void {
        this.sent.push(message);
    }

    close(): void {
        this.readyState = FakeWebSocket.CLOSED;
        this.emit("close");
    }

    emit(type: string, event: Event = {} as Event): void {
        for (const listener of this.listeners.get(type) ?? []) {
            listener(event);
        }
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("HttpTransport", () => {
    it("uses one base URL and the method each façade call promises", async () => {
        const calls: Array<{ url: string; init: RequestInit }> = [];
        const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            calls.push({ url: String(input), init: init ?? {} });
            return json({ value: "ok" });
        });
        const transport = new HttpTransport("http://service/", {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        await transport.get("/api/get", payload);
        await transport.post("/api/post", { one: 1 }, payload);
        await transport.put("/api/put", { two: 2 });
        await transport.putJson("/api/put-json", { three: 3 }, payload);
        await transport.patchJson("/api/patch", { four: 4 }, payload);
        await transport.delete("/api/delete");

        expect(calls.map((call) => call.url)).toEqual([
            "http://service/api/get",
            "http://service/api/post",
            "http://service/api/put",
            "http://service/api/put-json",
            "http://service/api/patch",
            "http://service/api/delete",
        ]);
        expect(calls.map((call) => call.init.method)).toEqual([
            "GET",
            "POST",
            "PUT",
            "PUT",
            "PATCH",
            "DELETE",
        ]);
        expect(new Headers(calls[1]?.init.headers).get("content-type")).toBe("application/json");
        expect(calls[1]?.init.body).toBe(JSON.stringify({ one: 1 }));
        expect(calls[0]?.init.body).toBeUndefined();
    });

    it("adds the LAN bearer to every request and scopes media URLs to a ticket", () => {
        const fetchImpl = vi.fn(async () => json({ value: "ok" }));
        const transport = new HttpTransport("http://service", {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            token: "bearer",
            mediaTicket: "ticket value",
        });

        expect(transport.mediaUrl?.("/api/media/clip")).toBe(
            "http://service/api/media/clip?media=ticket%20value",
        );
        expect(transport.mediaUrl?.("/api/media/clip?range=1")).toBe(
            "http://service/api/media/clip?range=1&media=ticket%20value",
        );
        expect(new HttpTransport("http://service", { token: "bearer" }).mediaUrl).toBeUndefined();
        expect(new HttpTransport("http://service").mediaUrl?.("/api/media/clip")).toBe(
            "http://service/api/media/clip",
        );

        void transport.get("/api/get", payload);
        return flush().then(() => {
            const headers = new Headers(
                (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
            );
            expect(headers.get("authorization")).toBe("Bearer bearer");
        });
    });

    it("keeps a structured service error, including Retry-After", async () => {
        const fetchImpl = vi.fn(async () =>
            json({ code: "LOCKED", message: "The project is read-only during a run." }, 423, {
                "retry-after": "7",
            }),
        );
        const transport = new HttpTransport("http://service", {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        await expect(transport.get("/api/locked", payload)).rejects.toMatchObject({
            name: "ApiError",
            status: 423,
            message: "The project is read-only during a run.",
            retryAfter: 7,
            body: { code: "LOCKED" },
        });
    });

    it("reports an unreachable service and a response without the promised shape", async () => {
        const unreachable = new HttpTransport("http://service", {
            fetchImpl: (async () => {
                throw new Error("connection refused");
            }) as typeof fetch,
        });
        await expect(unreachable.get("/api/health", payload)).rejects.toMatchObject({
            status: 0,
            body: null,
            retryAfter: null,
        });

        const wrongShape = new HttpTransport("http://service", {
            fetchImpl: (async () => json({ other: true })) as unknown as typeof fetch,
        });
        await expect(wrongShape.get("/api/health", payload)).rejects.toMatchObject({
            status: 200,
            message: "The service returned an unexpected shape.",
        });
    });

    it("uses the status fallback when an error has no JSON envelope", async () => {
        const fetchImpl = vi.fn(async () => new Response("not json", { status: 502 }));
        const transport = new HttpTransport("http://service", {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        await expect(transport.get("/api/health", payload)).rejects.toMatchObject({
            status: 502,
            body: null,
            message: "The service returned HTTP 502.",
        });
    });

    it("returns no value for a 204 without trying to parse one", async () => {
        const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
        const transport = new HttpTransport("http://service", {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        await expect(transport.get("/api/delete", payload)).resolves.toBeUndefined();
    });

    it("mints a fresh ticket for a LAN event stream and closes it on unsubscribe", async () => {
        const fetchImpl = vi.fn(async () => json({ ticket: "one-use" }));
        const sources: FakeEventSource[] = [];
        const transport = new HttpTransport("http://service", {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            token: "bearer",
            eventSourceFactory: (url) => {
                const source = new FakeEventSource(url);
                sources.push(source);
                return source as unknown as EventSource;
            },
        });

        const close = transport.subscribe("/api/events", payload, () => undefined);
        await flush();

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(String((fetchImpl.mock.calls[0] as unknown as [string])[0])).toBe(
            "http://service/api/events/ticket",
        );
        expect(sources[0]?.url).toBe("http://service/api/events?ticket=one-use");
        close();
        expect(sources[0]?.closed).toBe(true);
    });

    it("opens the language server with a ticket when the transport is paired", async () => {
        vi.stubGlobal("WebSocket", FakeWebSocket);
        const fetchImpl = vi.fn(async () => json({ ticket: "socket-ticket" }));
        const transport = new HttpTransport("http://service", {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            token: "bearer",
        });

        const channel = await transport.openLanguageServer?.();
        expect(channel).toBeDefined();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(FakeWebSocket.last?.url).toBe("ws://service/api/editor/lsp?ticket=socket-ticket");

        channel?.send('{"jsonrpc":"2.0"}');
        expect(FakeWebSocket.last?.sent).toEqual(['{"jsonrpc":"2.0"}']);
        const messages: string[] = [];
        channel?.onMessage((message) => messages.push(message));
        FakeWebSocket.last?.emit("message", { data: "hello" } as MessageEvent);
        expect(messages).toEqual(["hello"]);
        const closed = vi.fn();
        channel?.onClose(closed);
        channel?.close();
        expect(closed).toHaveBeenCalledTimes(1);
    });

    it("opens an unpaired language server without a ticket", async () => {
        vi.stubGlobal("WebSocket", FakeWebSocket);
        const transport = new HttpTransport("http://service");

        const channel = await transport.openLanguageServer?.();
        expect(channel).toBeDefined();
        expect(FakeWebSocket.last?.url).toBe("ws://service/api/editor/lsp");
    });

    it("rejects an unavailable language-server bridge with a transport error", async () => {
        class RefusingWebSocket {
            static readonly OPEN = 1;
            readonly #listeners = new Map<string, Set<(event: Event) => void>>();

            constructor() {
                queueMicrotask(() => {
                    for (const listener of this.#listeners.get("error") ?? []) {
                        listener({} as Event);
                    }
                });
            }

            addEventListener(type: string, listener: (event: Event) => void): void {
                const listeners = this.#listeners.get(type) ?? new Set();
                listeners.add(listener);
                this.#listeners.set(type, listeners);
            }

            close(): void {}
        }
        vi.stubGlobal("WebSocket", RefusingWebSocket);
        const transport = new HttpTransport("http://service");

        await expect(transport.openLanguageServer?.()).rejects.toMatchObject({
            status: 0,
            body: null,
        });
    });

    it("turns a constructor rejection into an ApiError", async () => {
        class RejectingWebSocket {
            constructor() {
                throw new Error("no socket");
            }
        }
        vi.stubGlobal("WebSocket", RejectingWebSocket);
        const transport = new HttpTransport("http://service");

        await expect(transport.openLanguageServer?.()).rejects.toBeInstanceOf(ApiError);
    });
});
