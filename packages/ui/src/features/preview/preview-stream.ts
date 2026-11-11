/**
 * A MediaSource session for one growing fragmented-MP4 preview proxy.
 *
 * A `<video src>` pointed at a proxy that is still being written cannot seek into bytes it
 * already played: the element owns the network request, the file has no final duration, and
 * a byte range that starts past zero makes the service wait for the finished cache file.
 * MediaSource moves the bytes into the page, where they stay seekable for as long as the
 * player retains them — a backward seek is a buffer lookup, not a new request.
 *
 * The session also means a window or scene boundary is an *append*, not a source swap. The
 * player hands the next segment to `append` with its offset on the element's timeline while
 * the current one is still playing, so the picture crosses the boundary without remounting
 * the element or waiting for a new file.
 *
 * The segment bytes themselves are untouched: this appends what the service produced, so a
 * Decoded frame is still the decoder's own output and an Encoded frame is still the run's
 * own encoder output.
 */

export type PreviewStreamEvents = {
    /** The first segment's init data is accepted; the element can now show frames. */
    onPlayable?: () => void;
    /** How much of the element's timeline is retained, in seconds. */
    /** The element's retained range, in its own timeline: what a seek can answer now. */
    onBuffered?: (range: { start: number; end: number }) => void;
    /** An unsupported codec or a transport failure; the caller should show its error state. */
    onError?: (message: string) => void;
};

/** A segment of the proxy and where its first frame sits on the element's timeline. */
type Segment = {
    url: string;
    offset: number;
};

/** Seconds of media to keep buffered ahead of the playhead before pausing the read. */
const MAX_AHEAD_SECONDS = 5;

/**
 * Seconds of played media to keep behind the playhead so a backward seek is still a hit.
 *
 * Chromium caps one `SourceBuffer` at roughly 150 MB. The proxy is a few megabits a second,
 * but a long retention window plus several prefetched windows could still reach that cap on
 * a large source, and the append that hits it fails the whole preview. Thirteen seconds of
 * buffer is three reachable seeks back and one window ahead.
 */
const RETAIN_BEHIND_SECONDS = 8;

/** A byte view backed by a plain ArrayBuffer, which is what the media APIs accept. */
type Bytes = Uint8Array<ArrayBuffer>;

const EMPTY: Bytes = new Uint8Array(0);

/**
 * The proxy's codec is real but this browser's MediaSource will not accept it.
 *
 * MediaSource is stricter than the media element: Chromium plays H.264 High 10 from a plain
 * `<video src>` but does not offer it through `isTypeSupported`. That is not a broken
 * preview, so the session hands the URL straight back to the element instead of failing.
 */
class UnsupportedCodec extends Error {}

/**
 * The service's reason for refusing a proxy, in words the user can act on.
 *
 * A preview that cannot be built (an encoder that will not take the source's pixel format,
 * for example) is a `422` whose body carries the engine's own diagnostic. Reporting only the
 * status turns the one useful sentence in that exchange into "could not be opened (422)".
 */
export async function previewRefusal(response: Response): Promise<string> {
    try {
        const body: unknown = await response.json();
        if (typeof body === "object" && body !== null && "message" in body) {
            const { message } = body;
            if (typeof message === "string" && message.trim().length > 0) {
                return message;
            }
        }
    } catch {
        // A refusal without a JSON body still gets the status-only message.
    }
    return `The preview could not be prepared (${String(response.status)}).`;
}

function concat(left: Bytes, right: Bytes): Bytes {
    if (left.length === 0) {
        return right;
    }
    if (right.length === 0) {
        return left;
    }
    const joined = new Uint8Array(left.length + right.length);
    joined.set(left, 0);
    joined.set(right, left.length);
    return joined;
}

function u32(bytes: Bytes, at: number): number {
    return (
        (((bytes[at] ?? 0) << 24) |
            ((bytes[at + 1] ?? 0) << 16) |
            ((bytes[at + 2] ?? 0) << 8) |
            (bytes[at + 3] ?? 0)) >>>
        0
    );
}

type Box = {
    type: string;
    /** First byte of the body (after the size/type header). */
    body: number;
    /** One past the last byte of the box. */
    end: number;
};

/**
 * The boxes that are completely present, and whether the last one was cut off.
 *
 * A proxy is parsed while it is still arriving, so the tail box is normally partial. The
 * complete prefix is still what the caller wants: the codec lives in `moov`, which arrives
 * before the first media fragment. Returning only complete boxes is what keeps a partial
 * `moof` from hiding an index that is already fully readable.
 */
type BoxList = { found: Box[]; complete: boolean };

function boxes(bytes: Bytes, from: number, to: number): BoxList {
    const found: Box[] = [];
    let at = from;
    while (at + 8 <= to) {
        const size = u32(bytes, at);
        const type = String.fromCharCode(
            bytes[at + 4] ?? 0,
            bytes[at + 5] ?? 0,
            bytes[at + 6] ?? 0,
            bytes[at + 7] ?? 0,
        );
        let body = at + 8;
        let end: number;
        if (size === 1) {
            if (at + 16 > to) {
                return { found, complete: false };
            }
            // A 64-bit size is written big-endian; the high word is zero for any preview.
            const high = u32(bytes, at + 8);
            const low = u32(bytes, at + 12);
            if (high !== 0) {
                return { found, complete: false };
            }
            body = at + 16;
            end = body + low;
        } else if (size === 0) {
            // "To the end of the file": only a tail box in a non-fragmented file.
            end = to;
        } else {
            end = at + size;
        }
        if (size !== 0 && end > to) {
            return { found, complete: false };
        }
        if (end <= at) {
            return { found, complete: false };
        }
        found.push({ type, body, end });
        at = end;
        if (size === 0) {
            break;
        }
    }
    return { found, complete: at === to };
}

function child(bytes: Bytes, parent: Box, type: string): Box | null {
    return boxes(bytes, parent.body, parent.end).found.find((entry) => entry.type === type) ?? null;
}

function hex2(value: number): string {
    return value.toString(16).padStart(2, "0");
}

/** The `avcC` fields that name an H.264 profile, compatibility, and level. */
function avcCodec(config: Bytes, fourcc: string): string | null {
    if (config.length < 4) {
        return null;
    }
    return `${fourcc}.${hex2(config[1] ?? 0)}${hex2(config[2] ?? 0)}${hex2(config[3] ?? 0)}`;
}

/** `av01.<profile>.<level><tier>.<bit depth>`, from the AV1 decoder configuration. */
function av1Codec(config: Bytes): string | null {
    if (config.length < 3) {
        return null;
    }
    const profile = ((config[1] ?? 0) >> 5) & 0x07;
    const level = (config[1] ?? 0) & 0x1f;
    const tier = ((config[2] ?? 0) >> 7) & 0x01;
    const highBitDepth = ((config[2] ?? 0) >> 6) & 0x01;
    const twelveBit = ((config[2] ?? 0) >> 5) & 0x01;
    const depth = twelveBit === 1 ? 12 : highBitDepth === 1 ? 10 : 8;
    return `av01.${String(profile)}.${String(level).padStart(2, "0")}${tier === 1 ? "H" : "M"}.${String(depth).padStart(2, "0")}`;
}

/** Reverse the 32 compatibility bits, which HEVC names least-significant first. */
function reverseBits(value: number): number {
    let flipped = 0;
    for (let bit = 0; bit < 32; bit += 1) {
        flipped = (flipped << 1) | ((value >>> bit) & 1);
    }
    return flipped >>> 0;
}

/** `hvc1.<profile>.<compatibility>.<level>.<constraints>`, from the HEVC decoder config. */
function hevcCodec(config: Bytes, fourcc: string): string | null {
    if (config.length < 13) {
        return null;
    }
    const profile = config[1] ?? 0;
    const space = (profile >> 6) & 0x03;
    const profileIdc = profile & 0x1f;
    const compatibility = reverseBits(u32(config, 2));
    const level = config[12] ?? 0;
    const constraints: string[] = [];
    for (let index = 6; index < 12; index += 1) {
        constraints.push(hex2(config[index] ?? 0));
    }
    while (constraints.length > 0 && constraints[constraints.length - 1] === "00") {
        constraints.pop();
    }
    const spaceLetter = ["", "A", "B", "C"][space] ?? "";
    const suffix = constraints.length === 0 ? "" : `.${constraints.join("").toUpperCase()}`;
    return `${fourcc}.${spaceLetter}${String(profileIdc)}.${compatibility.toString(16)}.L${String(level)}${suffix}`;
}

function sampleEntryCodec(bytes: Bytes, entry: Box, fourcc: string): string | null {
    // A visual sample entry has a fixed 78-byte body before its child boxes, so the decoder
    // configuration does not sit at the entry's body.
    const children = entry.body + 78;
    if (children >= entry.end) {
        return null;
    }
    const configFor = (type: string): Bytes | null => {
        const found = boxes(bytes, children, entry.end).found.find((box) => box.type === type);
        return found === undefined ? null : bytes.subarray(found.body, found.end);
    };
    if (fourcc === "avc1" || fourcc === "avc3") {
        const config = configFor("avcC");
        return config === null ? null : avcCodec(config, fourcc);
    }
    if (fourcc === "av01") {
        const config = configFor("av1C");
        return config === null ? null : av1Codec(config);
    }
    if (fourcc === "hvc1" || fourcc === "hev1") {
        const config = configFor("hvcC");
        return config === null ? null : hevcCodec(config, fourcc);
    }
    return null;
}

/**
 * The codec string of the proxy's video track, or `null` while the init segment is still
 * incomplete.
 *
 * MediaSource will not accept `video/mp4` without a codec, and guessing one for a 10-bit
 * H.264 or an AV1 profile the browser lacks turns a playable proxy into a parse error. The
 * decoder configuration in the track's sample entry is the only authoritative source, and
 * it is already in the bytes the element is about to receive.
 */
export function previewCodec(bytes: Bytes): string | null {
    const moov = boxes(bytes, 0, bytes.length).found.find((entry) => entry.type === "moov");
    if (moov === undefined) {
        return null;
    }
    const tracks = boxes(bytes, moov.body, moov.end).found;
    for (const trak of tracks.filter((entry) => entry.type === "trak")) {
        const mdia = child(bytes, trak, "mdia");
        const minf = mdia === null ? null : child(bytes, mdia, "minf");
        const stbl = minf === null ? null : child(bytes, minf, "stbl");
        const stsd = stbl === null ? null : child(bytes, stbl, "stsd");
        if (stsd === null) {
            continue;
        }
        // A full box: version and flags, then the entry count.
        const entries = boxes(bytes, stsd.body + 8, stsd.end).found;
        const entry = entries[0];
        if (entry === undefined) {
            continue;
        }
        if (entry.type === "encv") {
            // An encrypted track has no codec this player can decode.
            return null;
        }
        const codec = sampleEntryCodec(bytes, entry, entry.type);
        if (codec !== null) {
            return codec;
        }
    }
    return null;
}

/**
 * One MediaSource session, from the first fragment to the last appended window.
 *
 * `open` starts the session at a proxy URL; `append` adds another proxy (a prefetched
 * window or the next scene's chunk) at its offset on the same timeline. Everything the
 * session has appended stays seekable until it is deliberately trimmed behind the playhead.
 */
export class PreviewStream {
    readonly #element: HTMLVideoElement;
    readonly #events: PreviewStreamEvents;
    #media: MediaSource | null = null;
    #objectUrl: string | null = null;
    #buffer: SourceBuffer | null = null;
    #segments: Segment[] = [];
    #pumping = false;
    #closed = false;
    #abort: AbortController | null = null;
    /** Resolved by the next `timeupdate`, which is when the playhead has moved. */
    #demand: (() => void) | null = null;
    /** The buffer operation in flight; appends and trims never overlap. */
    #operation: Promise<void> = Promise.resolve();
    #lastTrim = 0;
    /** The session handed the URL to the element because MediaSource refused its codec. */
    #direct = false;

    constructor(element: HTMLVideoElement, events: PreviewStreamEvents = {}) {
        this.#element = element;
        this.#events = events;
        element.addEventListener("timeupdate", this.#onTimeUpdate);
        // A read that was throttled because the buffer was ahead is waiting for the
        // playhead to move. A pause or a seek stops the playhead instead, so it has to
        // release that wait too: otherwise a hold for a starved picture deadlocked the
        // very append that would have fed it.
        element.addEventListener("pause", this.#onDemand);
        element.addEventListener("seeking", this.#onDemand);
    }

    /** True when this browser can host a MediaSource session at all. */
    static available(): boolean {
        return typeof MediaSource !== "undefined" && typeof URL.createObjectURL === "function";
    }

    /** True once the first segment has produced a playable source buffer. */
    get started(): boolean {
        return this.#buffer !== null;
    }

    /**
     * Whether every segment handed to the session has been loaded and nothing is queued.
     *
     * This is how the player tells a source that has run out from one that is still
     * arriving: the last window or chunk of a video must not be held open waiting for a
     * segment that does not exist.
     */
    get idle(): boolean {
        return !this.#pumping && this.#segments.length === 0;
    }

    /**
     * Whether later proxies can be appended to this session at an offset.
     *
     * False when the session fell back to a direct source, where a second URL is a second
     * element state and the caller must use its own prefetch path.
     */
    get supportsAppend(): boolean {
        return !this.#direct;
    }

    /** Start the session on `url`, whose first frame is the element's time zero. */
    open(url: string): void {
        if (!PreviewStream.available() || this.#closed) {
            return;
        }
        const media = new MediaSource();
        this.#media = media;
        this.#objectUrl = URL.createObjectURL(media);
        media.addEventListener("sourceopen", () => {
            if (this.#closed) {
                return;
            }
            void this.#pump();
        });
        // `sourceended` and `sourceclose` leave the element without a buffer; reporting it as
        // a failure keeps the loading overlay from hanging.
        media.addEventListener("error", () => this.#events.onError?.("The media source failed."));
        this.#element.src = this.#objectUrl;
        this.#element.load();
        this.#segments.push({ url, offset: 0 });
        void this.#pump();
    }

    /**
     * Append another proxy at `offset` seconds on the element's timeline.
     *
     * The offset is what turns independent files into one continuous picture: every proxy
     * starts its own clock at zero, so the second window is shifted to where the first one
     * ended instead of overwriting it.
     */
    append(url: string, offset: number): void {
        if (this.#closed || this.#direct) {
            return;
        }
        this.#segments.push({ url, offset });
        void this.#pump();
    }

    close(): void {
        this.#closed = true;
        this.#abort?.abort();
        this.#abort = null;
        this.#demand?.();
        this.#demand = null;
        this.#element.removeEventListener("timeupdate", this.#onTimeUpdate);
        this.#element.removeEventListener("pause", this.#onDemand);
        this.#element.removeEventListener("seeking", this.#onDemand);
        if (this.#objectUrl !== null) {
            URL.revokeObjectURL(this.#objectUrl);
            this.#objectUrl = null;
        }
        this.#segments = [];
        this.#buffer = null;
        this.#media = null;
        try {
            this.#element.removeAttribute("src");
            this.#element.load();
        } catch {
            // A detached element cannot be reloaded; nothing is left to release.
        }
    }

    /** Release a throttled read: the playhead moved, paused, or jumped. */
    #onDemand = () => {
        this.#demand?.();
        this.#demand = null;
    };

    #onTimeUpdate = () => {
        this.#onDemand();
        const now = performance.now();
        if (now - this.#lastTrim > 500) {
            this.#lastTrim = now;
            this.#trim();
        }
        this.#reportBuffered();
    };

    #reportBuffered(): void {
        const buffered = this.#element.buffered;
        if (buffered.length === 0) {
            return;
        }
        this.#events.onBuffered?.({
            start: buffered.start(0),
            end: buffered.end(buffered.length - 1),
        });
    }

    /** Drop what is far enough behind the playhead that a seek there is unlikely. */
    #trim(): void {
        const time = this.#element.currentTime;
        const ranges = this.#element.buffered;
        if (ranges.length === 0) {
            return;
        }
        if (time - ranges.start(0) <= RETAIN_BEHIND_SECONDS) {
            return;
        }
        void this.#discardTo(time - RETAIN_BEHIND_SECONDS);
    }

    /**
     * Drop the buffered picture before `end`, if there is any to drop.
     *
     * `SourceBuffer.remove` rejects a range whose end is not past its start, and a preview
     * that has just opened has no buffered seconds behind the playhead at all: the quota
     * path asked it to remove `0` to `0` and the element threw before the retry could run.
     * Trimming to a range that exists is what makes both the periodic trim and the quota
     * recovery safe.
     */
    async #discardTo(end: number): Promise<void> {
        const buffer = this.#buffer;
        const ranges = this.#element.buffered;
        if (buffer === null || ranges.length === 0) {
            return;
        }
        const from = ranges.start(0);
        const to = Math.min(end, ranges.end(ranges.length - 1));
        if (to - from < 0.05) {
            return;
        }
        await this.#run(() => buffer.remove(from, to)).catch(() => undefined);
    }

    /**
     * Move the segment on the element's timeline inside the buffer queue.
     *
     * The property throws while the buffer is processing an append or a remove, and a trim
     * triggered by playback can be in flight when the next segment starts. Running it in the
     * queue keeps a window boundary from failing a working stream, but it must not wait for
     * `updateend`: setting the property starts no operation, so no event ever follows. Waiting
     * for one left the first segment of every MediaSource session unread, with the picture
     * stuck on its loading overlay.
     */
    async #setOffset(offset: number): Promise<void> {
        const buffer = this.#buffer;
        if (buffer === null) {
            return;
        }
        await this.#run(() => {
            buffer.timestampOffset = offset;
        }, false);
    }

    /**
     * Queue one buffer operation.
     *
     * An append or a remove is only done when its `updateend` arrives, so the next operation
     * cannot be issued onto a busy buffer. A property write starts nothing and is therefore
     * queued without waiting; it still runs after the previous operation has finished.
     */
    #run(operation: () => void, waitForUpdate = true): Promise<void> {
        const next = this.#operation.then(
            () =>
                new Promise<void>((resolve, reject) => {
                    const buffer = this.#buffer;
                    if (buffer === null || this.#media?.readyState !== "open") {
                        resolve();
                        return;
                    }
                    if (!waitForUpdate) {
                        try {
                            operation();
                            resolve();
                        } catch (error) {
                            reject(error instanceof Error ? error : new Error(String(error)));
                        }
                        return;
                    }
                    const settle = (failure?: Error) => {
                        buffer.removeEventListener("updateend", done);
                        buffer.removeEventListener("error", failed);
                        if (failure === undefined) {
                            resolve();
                        } else {
                            reject(failure);
                        }
                    };
                    const done = () => settle();
                    const failed = () => settle(new Error("The media source rejected a fragment."));
                    buffer.addEventListener("updateend", done);
                    buffer.addEventListener("error", failed);
                    try {
                        operation();
                    } catch (error) {
                        settle(error instanceof Error ? error : new Error(String(error)));
                    }
                }),
        );
        this.#operation = next.catch(() => undefined);
        return next;
    }

    async #append(bytes: Bytes): Promise<void> {
        try {
            await this.#run(() => this.#buffer?.appendBuffer(bytes));
        } catch (error) {
            // Chrome refuses a fragment when its buffer is over quota. Give it room and try
            // once more rather than reporting a preview failure for a memory-pressure blip.
            if (error instanceof DOMException && error.name === "QuotaExceededError") {
                await this.#discardTo(this.#element.currentTime);
                await this.#run(() => this.#buffer?.appendBuffer(bytes));
                return;
            }
            throw error;
        }
        this.#reportBuffered();
    }

    /** Wait while the buffer is ahead of the playhead, so a chunk cannot fill memory. */
    async #appetite(): Promise<void> {
        // A paused element never fires `timeupdate`, so waiting for one here deadlocked the
        // read after eight seconds: the chunk never finished, the player never became
        // playable, and pressing Play was the only thing that could release the wait. Fill
        // while paused; one window or scene is bounded, and the cap still applies in motion.
        if (this.#element.paused) {
            return;
        }
        const ranges = this.#element.buffered;
        if (ranges.length === 0) {
            return;
        }
        const end = ranges.end(ranges.length - 1);
        if (end - this.#element.currentTime <= MAX_AHEAD_SECONDS) {
            return;
        }
        await new Promise<void>((resolve) => {
            this.#demand = resolve;
        });
    }

    async #pump(): Promise<void> {
        // MediaSource refuses a source buffer before `sourceopen`; the event handler runs
        // this again, so an early call is simply a no-op.
        if (
            this.#pumping ||
            this.#closed ||
            this.#media === null ||
            this.#media.readyState !== "open"
        ) {
            return;
        }
        this.#pumping = true;
        try {
            while (this.#segments.length > 0 && !this.#closed) {
                const segment = this.#segments[0];
                if (segment === undefined) {
                    break;
                }
                await this.#load(segment);
                this.#segments.shift();
            }
        } catch (error) {
            if (!this.#closed) {
                this.#events.onError?.(error instanceof Error ? error.message : String(error));
            }
        } finally {
            this.#pumping = false;
        }
    }

    async #load(segment: Segment): Promise<void> {
        const controller = new AbortController();
        this.#abort?.abort();
        this.#abort = controller;
        // Every proxy starts its own clock at zero, so the offset must be in place before
        // the first media fragment of this segment is appended.
        if (this.#buffer !== null) {
            await this.#setOffset(segment.offset);
        }
        const response = await fetch(segment.url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(await previewRefusal(response));
        }
        if (response.body === null) {
            throw new Error(
                `The preview stream opened without a body (${String(response.status)}).`,
            );
        }
        const reader = response.body.getReader();
        let pending = EMPTY;
        let ready = this.#buffer !== null;
        let announced = false;
        for (;;) {
            let read: Awaited<ReturnType<typeof reader.read>>;
            try {
                read = await reader.read();
            } catch (error) {
                if (
                    this.#closed ||
                    (error instanceof DOMException && error.name === "AbortError")
                ) {
                    throw error;
                }
                // The service breaks the body when a build fails, so a rejected read is how
                // a stopped encoder is told apart from a scene that simply ended. The reason
                // itself is in the service log; naming the stage is what the player can say.
                throw new Error(
                    this.#buffer === null
                        ? "The preview stopped before it produced a picture. The service log has the reason."
                        : "The preview stopped before this scene finished. The service log has the reason.",
                );
            }
            const { done, value } = read;
            if (done) {
                break;
            }
            if (value !== undefined) {
                pending = concat(pending, value);
            }
            if (!ready) {
                const codec = previewCodec(pending);
                if (codec === null) {
                    continue;
                }
                try {
                    await this.#openBuffer(codec);
                } catch (error) {
                    if (error instanceof UnsupportedCodec) {
                        this.#fallback(segment.url);
                        return;
                    }
                    throw error;
                }
                ready = true;
                const buffer = this.#buffer;
                if (buffer === null) {
                    return;
                }
                // Set the offset before the first media fragment of this segment.
                await this.#setOffset(segment.offset);
                this.#reportBuffered();
            }
            if (pending.length > 0) {
                const bytes = pending;
                pending = EMPTY;
                await this.#append(bytes);
            }
            if (!announced && this.#buffer !== null) {
                announced = true;
                this.#events.onPlayable?.();
            }
            await this.#appetite();
        }
        if (pending.length > 0 && this.#buffer !== null) {
            await this.#append(pending);
        }
        if (!ready) {
            throw new Error("The preview stream ended before its index was readable.");
        }
    }

    /**
     * Play the proxy from the element's own source, as before MediaSource existed.
     *
     * Seeking into a growing file is the slower path, so this is the fallback for a codec the
     * browser can decode but will not put in a SourceBuffer — never the default.
     */
    #fallback(url: string): void {
        this.#direct = true;
        this.#segments = [];
        this.#buffer = null;
        this.#abort?.abort();
        this.#abort = null;
        try {
            this.#element.src = url;
            this.#element.load();
        } catch {
            this.#events.onError?.("The preview stream could not be attached.");
        }
    }

    async #openBuffer(codec: string): Promise<void> {
        const media = this.#media;
        if (media === null) {
            throw new Error("The media source was closed.");
        }
        const mime = `video/mp4; codecs="${codec}"`;
        if (!MediaSource.isTypeSupported(mime)) {
            throw new UnsupportedCodec(`MediaSource does not accept ${mime}`);
        }
        this.#buffer = media.addSourceBuffer(mime);
        // The element's clock starts at zero for the session; every later segment is placed
        // by its own `timestampOffset`.
        this.#reportBuffered();
    }
}
