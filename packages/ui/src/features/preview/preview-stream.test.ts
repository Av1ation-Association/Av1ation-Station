import { describe, expect, it } from "vitest";

import { previewCodec, previewRefusal } from "./preview-stream";

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
