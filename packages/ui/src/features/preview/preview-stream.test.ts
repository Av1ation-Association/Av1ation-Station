import { afterEach, describe, expect, it, vi } from "vitest";

import { RETAIN_BEHIND_SECONDS } from "./preview-buffer-plan";
import { PreviewStream, previewCodec, previewRefusal } from "./preview-stream";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

type Bytes = Uint8Array<ArrayBuffer>;

function u32(value: number): Bytes {
    return new Uint8Array([
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff,
    ]);
}

function concat(parts: Bytes[]): Bytes {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const joined = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
        joined.set(part, at);
        at += part.length;
    }
    return joined;
}

function box(type: string, ...payload: Bytes[]): Bytes {
    const body = concat(payload);
    const header = new Uint8Array(8);
    header.set(u32(body.length + 8), 0);
    for (let index = 0; index < 4; index += 1) {
        header[4 + index] = type.charCodeAt(index);
    }
    return concat([header, body]);
}

/** A visual sample entry with a 78-byte fixed body, as an MP4 track stores one. */
function sampleEntry(type: string, ...children: Bytes[]): Bytes {
    return box(type, new Uint8Array(78), ...children);
}

/** `stsd` is a full box: version/flags, then the entry count. */
function init(...entries: Bytes[]): Bytes {
    const stsd = new Uint8Array(8);
    stsd.set(u32(0), 0);
    stsd.set(u32(entries.length), 4);
    const moov = box(
        "moov",
        box("trak", box("mdia", box("minf", box("stbl", box("stsd", stsd, ...entries))))),
    );
    return concat([box("ftyp", new Uint8Array([0x69, 0x73, 0x6f, 0x6d])), moov]);
}

describe("previewCodec", () => {
    it("names an H.264 profile from its decoder configuration", () => {
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))));

        expect(previewCodec(bytes)).toBe("avc1.640028");
    });

    it("names an AV1 profile, level, tier, and depth", () => {
        const config = new Uint8Array([0x81, 0x04, 0x4c]);
        const bytes = init(sampleEntry("av01", box("av1C", config)));

        expect(previewCodec(bytes)).toBe("av01.0.04M.10");
    });

    it("names a VP9 profile, level, and depth", () => {
        const config = new Uint8Array([1, 0, 0, 0, 0, 10, 0x82]);
        const bytes = init(sampleEntry("vp09", box("vpcC", config)));

        expect(previewCodec(bytes)).toBe("vp09.00.10.08");
    });

    it("names an HEVC profile with its reversed compatibility bits", () => {
        const config = new Uint8Array([1, 0x01, 0x60, 0, 0, 0, 0xb0, 0, 0, 0, 0, 0, 93]);
        const bytes = init(sampleEntry("hvc1", box("hvcC", config)));

        expect(previewCodec(bytes)).toBe("hvc1.1.6.L93.B0");
    });

    it("waits for the whole index instead of guessing at a partial one", () => {
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x4d, 0x40, 0x1f]))));

        // Everything up to and including `moov`'s header is complete but the box is not.
        expect(previewCodec(bytes.subarray(0, bytes.length - 4))).toBeNull();
        expect(previewCodec(bytes)).toBe("avc1.4d401f");
    });

    it("reports nothing when the index has no readable track", () => {
        expect(previewCodec(concat([box("ftyp", new Uint8Array(4))]))).toBeNull();
        expect(previewCodec(init())).toBeNull();
    });
});

describe("previewRefusal", () => {
    it("keeps the encoder's own diagnostic from the refusal", async () => {
        const response = new Response(
            JSON.stringify({
                code: "engine_failed",
                message:
                    "The encoder could not produce the scene preview: Svt[error]: SVT-AV1-Essential only supports 10-bit encoding by design",
                detail: null,
                hint: "The source or encoder may not support a preview.",
            }),
            { status: 422, headers: { "content-type": "application/json" } },
        );

        expect(await previewRefusal(response)).toBe(
            "The encoder could not produce the scene preview: Svt[error]: SVT-AV1-Essential only supports 10-bit encoding by design",
        );
    });

    it("falls back to the status when the refusal is not JSON", async () => {
        const response = new Response("<html>proxy error</html>", { status: 503 });

        expect(await previewRefusal(response)).toBe("The preview could not be prepared (503).");
    });
});

function fakeVideo() {
    const element = new EventTarget() as unknown as HTMLVideoElement & {
        buffered: { length: number; start: () => number; end: () => number };
        currentTime: number;
        paused: boolean;
        src: string;
        load: () => void;
        removeAttribute: () => void;
    };
    element.buffered = { length: 1, start: () => 0, end: () => 20 };
    element.currentTime = 0;
    element.paused = true;
    element.load = vi.fn();
    element.removeAttribute = vi.fn();
    return element;
}

/** A MediaSource/SourceBuffer pair that finishes an append on the next microtask. */
function installMediaSource() {
    class Buffer extends EventTarget {
        offset = 0;
        updating = false;
        /** Offset writes and appends in the order the stream issued them. */
        operations: string[] = [];
        get timestampOffset() {
            return this.offset;
        }
        set timestampOffset(value: number) {
            this.offset = value;
            this.operations.push(`offset:${String(value)}`);
        }
        appended: Bytes[] = [];
        appendBuffer = vi.fn((bytes: Bytes) => {
            this.operations.push("append");
            this.appended.push(bytes);
            queueMicrotask(() => this.dispatchEvent(new Event("updateend")));
        });
        remove = vi.fn((_start: number, _end: number) => {
            queueMicrotask(() => this.dispatchEvent(new Event("updateend")));
        });
    }
    const buffer = new Buffer();
    class Media extends EventTarget {
        static isTypeSupported = () => true;
        readyState: "closed" | "open" | "ended" = "closed";
        addSourceBuffer = () => buffer;
        constructor() {
            super();
            queueMicrotask(() => {
                this.readyState = "open";
                this.dispatchEvent(new Event("sourceopen"));
            });
        }
    }
    vi.stubGlobal("MediaSource", Media);
    Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn(() => "blob:preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: vi.fn(),
    });
    return { buffer };
}

describe("PreviewStream", () => {
    it("opens a MediaSource and appends the init segment", async () => {
        const { buffer } = installMediaSource();
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))));
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(bytes, { headers: { "content-type": "video/mp4" } })),
        );
        const element = fakeVideo();
        const onError = vi.fn();
        const stream = new PreviewStream(element, { onError });

        stream.open("http://service/api/media/1");
        await vi.waitFor(() => expect(stream.idle).toBe(true));

        expect(onError).not.toHaveBeenCalled();
        expect(stream.started).toBe(true);
        expect(stream.supportsAppend).toBe(true);
        expect(buffer.appended.some((chunk) => chunk.length > 0)).toBe(true);
        expect(buffer.operations).toEqual(["offset:0", "append"]);
        expect(element.src).toBe("blob:preview");
    });

    it("places a later proxy at its offset and closes the object URL", async () => {
        const { buffer } = installMediaSource();
        const bytes = init(sampleEntry("av01", box("av1C", new Uint8Array([0x81, 0x04, 0x4c]))));
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(bytes)),
        );
        const element = fakeVideo();
        const stream = new PreviewStream(element);

        stream.open("http://service/api/media/1");
        await vi.waitFor(() => expect(stream.started).toBe(true));
        stream.append("http://service/api/media/2", 12);
        await vi.waitFor(() => expect(stream.idle).toBe(true));
        expect(buffer.timestampOffset).toBe(12);

        stream.close();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
        expect(element.removeAttribute).toHaveBeenCalledWith("src");
        expect(stream.started).toBe(false);
    });

    it("resolves an append once its request has been issued", async () => {
        installMediaSource();
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))));
        const fetchMock = vi.fn(async () => new Response(bytes));
        vi.stubGlobal("fetch", fetchMock);
        const stream = new PreviewStream(fakeVideo());

        stream.open("http://service/api/media/1");
        await vi.waitFor(() => expect(stream.started).toBe(true));

        let release!: (value: Response) => void;
        fetchMock.mockImplementationOnce(
            () =>
                new Promise<Response>((resolve) => {
                    release = resolve;
                }),
        );
        const appended = stream.append("http://service/api/media/2", 2);
        await appended;
        expect(stream.loadingUrl).toBe("http://service/api/media/2");

        release(new Response(bytes));
        await vi.waitFor(() => expect(stream.idle).toBe(true));
    });

    it("requests the next window before the current one finishes arriving", async () => {
        installMediaSource();
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))));
        const requested: string[] = [];
        let releaseFirst!: (response: Response) => void;
        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL) => {
                const url = String(input);
                requested.push(url);
                if (url.endsWith("/1")) {
                    return new Promise<Response>((resolve) => {
                        releaseFirst = resolve;
                    });
                }
                return Promise.resolve(new Response(bytes));
            }),
        );
        const stream = new PreviewStream(fakeVideo());

        stream.open("http://service/api/media/1");
        await vi.waitFor(() => expect(stream.loadingUrl).toBe("http://service/api/media/1"));

        // The opening window is still arriving. Asking for the next one now lets the
        // service build it while the browser parses and appends the first, instead of
        // leaving the decoder idle through every seam.
        void stream.append("http://service/api/media/2", 2);
        await vi.waitFor(() =>
            expect(requested).toEqual(["http://service/api/media/1", "http://service/api/media/2"]),
        );
        expect(stream.loadingUrl).toBe("http://service/api/media/1");

        releaseFirst(new Response(bytes));
        await vi.waitFor(() => expect(stream.idle).toBe(true));
    });

    it("does not hold a window ahead when the byte budget is full", async () => {
        installMediaSource();
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))));
        const requested: string[] = [];
        let releaseFirst!: (response: Response) => void;
        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL) => {
                const url = String(input);
                requested.push(url);
                if (url.endsWith("/1")) {
                    return new Promise<Response>((resolve) => {
                        releaseFirst = resolve;
                    });
                }
                return Promise.resolve(new Response(bytes));
            }),
        );
        const stream = new PreviewStream(fakeVideo(), {}, { canPrefetchAhead: () => false });

        stream.open("http://service/api/media/1");
        await vi.waitFor(() => expect(stream.loadingUrl).toBe("http://service/api/media/1"));

        // The next request waits for the append instead of holding a second body that the
        // plan says does not fit.
        void stream.append("http://service/api/media/2", 2);
        expect(requested).toEqual(["http://service/api/media/1"]);

        releaseFirst(new Response(bytes));
        await vi.waitFor(() => expect(stream.idle).toBe(true));
        expect(requested).toEqual(["http://service/api/media/1", "http://service/api/media/2"]);
    });

    it("sends the opening window before a queued prefetch", async () => {
        installMediaSource();
        const requested: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL) => {
                requested.push(String(input));
                return new Promise<Response>(() => undefined);
            }),
        );
        const stream = new PreviewStream(fakeVideo());

        // The caller queues the next window while MediaSource is still opening; the
        // opening request must reach the service first, or the window the element is
        // waiting for queues behind a prefetch.
        stream.open("http://service/api/media/1");
        void stream.append("http://service/api/media/2", 2);

        expect(requested).toEqual([]);
        await vi.waitFor(() => expect(requested).toHaveLength(2));
        expect(requested).toEqual(["http://service/api/media/1", "http://service/api/media/2"]);
    });

    it("retains the plan's GOP-safe margin behind the playhead", async () => {
        const { buffer } = installMediaSource();
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))));
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(bytes)),
        );
        vi.spyOn(performance, "now").mockReturnValue(1000);
        const element = fakeVideo();
        element.currentTime = 10;
        const stream = new PreviewStream(
            element,
            {},
            {
                retainBehindSeconds: () => RETAIN_BEHIND_SECONDS,
            },
        );

        stream.open("http://service/api/media/1");
        // The playhead sits in the window appended at 8 s; the history before that window
        // is what a trim may drop.
        void stream.append("http://service/api/media/2", 8);
        await vi.waitFor(() => expect(stream.started).toBe(true));
        element.dispatchEvent(new Event("timeupdate"));

        await vi.waitFor(() => expect(buffer.remove).toHaveBeenCalledWith(0, 8));
    });

    it("never trims into the window the playhead is playing", async () => {
        const { buffer } = installMediaSource();
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))));
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(bytes)),
        );
        vi.spyOn(performance, "now").mockReturnValue(1000);
        const element = fakeVideo();
        // 0.34 s behind the playhead, inside the only appended window. Chromium discards
        // the whole window for that cut, which leaves the playhead outside the buffer.
        element.currentTime = 1.84;
        const stream = new PreviewStream(
            element,
            {},
            { retainBehindSeconds: () => RETAIN_BEHIND_SECONDS },
        );

        stream.open("http://service/api/media/1");
        await vi.waitFor(() => expect(stream.started).toBe(true));
        element.dispatchEvent(new Event("timeupdate"));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(buffer.remove).not.toHaveBeenCalled();
    });

    it("releases a read throttled ahead of the playhead when the element stalls", async () => {
        installMediaSource();
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))));
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(bytes)),
        );
        const element = fakeVideo();
        element.paused = false;
        const preview = new PreviewStream(element, {}, { maxAheadSeconds: () => 4 });

        preview.open("http://service/api/media/1");
        await vi.waitFor(() => expect(preview.started).toBe(true));
        // The element reports 20 s retained, so the next read is throttled. A picture that
        // has run dry must release it; otherwise the rest of the window never arrives.
        await new Promise((resolve) => setTimeout(resolve, 0));
        element.dispatchEvent(new Event("waiting"));

        await vi.waitFor(() => expect(preview.idle).toBe(true));
    });

    it("coalesces a streamed proxy into a few appends", async () => {
        const { buffer } = installMediaSource();
        const initBytes = init(
            sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))),
        );
        const media = new Uint8Array(64 * 1024 * 12);
        for (let at = 0; at < media.length; at += 1) {
            media[at] = at & 0xff;
        }
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(initBytes);
                for (let at = 0; at < media.length; at += 64 * 1024) {
                    controller.enqueue(media.subarray(at, at + 64 * 1024));
                }
                controller.close();
            },
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(stream)),
        );
        const preview = new PreviewStream(fakeVideo());

        preview.open("http://service/api/media/1");
        await vi.waitFor(() => expect(preview.idle).toBe(true));

        // Thirteen 64 KB reads must not become thirteen full `updateend` round trips.
        expect(buffer.appended.length).toBeLessThanOrEqual(4);
        const written = concat(buffer.appended);
        expect(written.length).toBe(initBytes.length + media.length);
        expect(written.subarray(initBytes.length)).toEqual(media);
    });

    it("keeps bytes the session is told not to retain behind", async () => {
        const { buffer } = installMediaSource();
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))));
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(bytes)),
        );
        vi.spyOn(performance, "now").mockReturnValue(1000);
        const element = fakeVideo();
        element.currentTime = 10;
        const preview = new PreviewStream(element, {}, { retainBehindSeconds: () => 3 });

        preview.open("http://service/api/media/1");
        void preview.append("http://service/api/media/2", 8);
        await vi.waitFor(() => expect(preview.started).toBe(true));
        element.dispatchEvent(new Event("timeupdate"));

        await vi.waitFor(() => expect(buffer.remove).toHaveBeenCalledWith(0, 6.5));
    });

    /**
     * Open a stream whose next proxy the buffer refuses twice with nothing behind the
     * playhead to trim, leaving the read parked on a quota it cannot free by itself.
     */
    async function parkOnQuota() {
        const { buffer } = installMediaSource();
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))));
        const fetchMock = vi.fn(async () => new Response(bytes));
        vi.stubGlobal("fetch", fetchMock);
        const element = fakeVideo();
        const onError = vi.fn();
        const quota = new DOMException("full", "QuotaExceededError");
        const append = buffer.appendBuffer;
        let calls = 0;
        let full = 2;
        buffer.appendBuffer = vi.fn((chunk: Bytes) => {
            calls += 1;
            // The init segment lands; the media body then hits a SourceBuffer that is
            // full with nothing behind the playhead to discard.
            if (calls >= 2 && full > 0) {
                full -= 1;
                throw quota;
            }
            append(chunk);
        });
        const stream = new PreviewStream(element, { onError });

        stream.open("http://service/api/media/1");
        await vi.waitFor(() => expect(stream.idle).toBe(true));

        fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(1024)));
        void stream.append("http://service/api/media/2", 2);
        await vi.waitFor(() => expect(buffer.appendBuffer).toHaveBeenCalledTimes(3));
        expect(stream.idle).toBe(false);

        return { buffer, element, onError, stream };
    }

    it("waits for playback instead of failing when a paused buffer is full", async () => {
        const { buffer, element, onError, stream } = await parkOnQuota();

        // The playhead moves into the second window, so the first one is free history: the
        // cut stops at its start, never inside the window the playhead is playing.
        element.currentTime = 5;
        element.dispatchEvent(new Event("timeupdate"));
        await vi.waitFor(() => expect(stream.idle).toBe(true));

        expect(onError).not.toHaveBeenCalled();
        expect(buffer.remove).toHaveBeenCalledWith(0, 2);
        expect(buffer.appendBuffer).toHaveBeenCalledTimes(4);
    });

    it("releases a quota-parked read on a paused seek, without a timeupdate", async () => {
        const { buffer, element, onError, stream } = await parkOnQuota();

        // The element is paused, so no `timeupdate` will arrive; a paused seek is the only
        // thing that moves the playhead and frees history. The read must stay parked until
        // then: a timer-based fallback would pass this test without releasing on `seeking`.
        expect(element.paused).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(stream.idle).toBe(false);

        element.currentTime = 5;
        element.dispatchEvent(new Event("seeking"));
        await vi.waitFor(() => expect(stream.idle).toBe(true));

        expect(onError).not.toHaveBeenCalled();
        expect(buffer.remove).toHaveBeenCalledWith(0, 2);
        expect(buffer.appendBuffer).toHaveBeenCalledTimes(4);
    });

    it("waits for parsing to end before setting the next window's offset", async () => {
        const { buffer } = installMediaSource();
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))));
        const fetchMock = vi.fn(async () => new Response(bytes));
        vi.stubGlobal("fetch", fetchMock);
        const onError = vi.fn();
        const stream = new PreviewStream(fakeVideo(), { onError });

        stream.open("http://service/api/media/1");
        await vi.waitFor(() => expect(stream.idle).toBe(true));

        fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(1024)));
        let parsing = false;
        let fail = true;
        let offset = 0;
        Object.defineProperty(buffer, "updating", {
            configurable: true,
            get: () => parsing,
        });
        Object.defineProperty(buffer, "timestampOffset", {
            configurable: true,
            get: () => offset,
            set: (value: number) => {
                if (fail) {
                    fail = false;
                    parsing = true;
                    // Chrome finishes parsing on a later task, after the rejected write has
                    // been observed; a microtask would fire before the wait is installed.
                    setTimeout(() => {
                        parsing = false;
                        buffer.dispatchEvent(new Event("updateend"));
                    }, 0);
                    throw new DOMException("parsing", "InvalidStateError");
                }
                offset = value;
            },
        });

        void stream.append("http://service/api/media/2", 2);
        await vi.waitFor(() => expect(stream.idle).toBe(true));

        expect(onError).not.toHaveBeenCalled();
        expect(offset).toBe(2);
    });

    it("falls back to the element source when MediaSource rejects the codec", async () => {
        installMediaSource();
        (MediaSource as unknown as { isTypeSupported: () => boolean }).isTypeSupported = () =>
            false;
        const bytes = init(sampleEntry("hvc1", box("hvcC", new Uint8Array(13))));
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(bytes)),
        );
        const element = fakeVideo();
        const stream = new PreviewStream(element);

        stream.open("http://service/api/media/1");
        await vi.waitFor(() => expect(stream.supportsAppend).toBe(false));
        expect(element.src).toBe("http://service/api/media/1");
        expect(stream.started).toBe(false);
    });

    it("reports a refused proxy with the service's own reason", async () => {
        installMediaSource();
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(JSON.stringify({ message: "The source cannot be decoded." }), {
                        status: 422,
                    }),
            ),
        );
        const onError = vi.fn();
        const stream = new PreviewStream(fakeVideo(), { onError });

        stream.open("http://service/api/media/1");
        await vi.waitFor(() =>
            expect(onError).toHaveBeenCalledWith("The source cannot be decoded."),
        );
    });
});
