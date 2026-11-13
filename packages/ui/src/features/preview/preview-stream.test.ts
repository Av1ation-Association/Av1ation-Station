import { afterEach, describe, expect, it, vi } from "vitest";

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
        timestampOffset = 0;
        appended: Uint8Array[] = [];
        appendBuffer = vi.fn((bytes: Uint8Array) => {
            this.appended.push(bytes);
            queueMicrotask(() => this.dispatchEvent(new Event("updateend")));
        });
        remove = vi.fn((_start: number, _end: number) => undefined);
    }
    const buffer = new Buffer();
    class Media extends EventTarget {
        static isTypeSupported = () => true;
        readyState = "open";
        addSourceBuffer = () => buffer;
        constructor() {
            super();
            queueMicrotask(() => this.dispatchEvent(new Event("sourceopen")));
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
    it("opens a MediaSource, appends the init segment, and reports it playable", async () => {
        const { buffer } = installMediaSource();
        const bytes = init(sampleEntry("avc1", box("avcC", new Uint8Array([1, 0x64, 0x00, 0x28]))));
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(bytes, { headers: { "content-type": "video/mp4" } })),
        );
        const element = fakeVideo();
        const onPlayable = vi.fn();
        const onError = vi.fn();
        const stream = new PreviewStream(element, { onPlayable, onError });

        stream.open("http://service/api/media/1");
        await vi.waitFor(() => expect(onPlayable).toHaveBeenCalledOnce());

        expect(onError).not.toHaveBeenCalled();
        expect(stream.started).toBe(true);
        expect(stream.idle).toBe(true);
        expect(stream.supportsAppend).toBe(true);
        expect(buffer.appended.some((chunk) => chunk.length > 0)).toBe(true);
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
