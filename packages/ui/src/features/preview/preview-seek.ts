/**
 * One pending seek at a time, so a gesture costs one decode walk.
 *
 * An Encoded chunk carries a single keyframe, at its scene's first frame, so every backward
 * seek into it makes the decoder walk from there. That walk is the bitstream's cost and no
 * player can shorten it — but it is easy to pay it several times over. Writing
 * `currentTime` again before the walk finishes throws the work away and starts over: a drag
 * across a scene restarted it on every tick, and opening a chunk at a frame wrote the same
 * target from `loadedmetadata`, `canplay`, and the playhead effect in turn.
 *
 * A scrubbed target is therefore coalesced — only the newest request is written, after the
 * gesture pauses — while a discrete move (a key press or the step buttons) is written at
 * once, because the user expects that one to land immediately. A request that arrives while
 * a walk is running is held and applied when the walk ends, and dropped when the walk
 * already landed on that frame.
 */
export class SeekQueue {
    readonly #write: (seconds: number) => void;
    /** How long a scrubbed target waits for the gesture to pause. */
    readonly #delayMs: number;
    /** A walk this long without a `seeked` is treated as lost, not as still running. */
    readonly #staleMs: number;
    #pending: number | null = null;
    #timer: ReturnType<typeof setTimeout> | null = null;
    #busy = false;
    #writtenAt = 0;

    constructor(write: (seconds: number) => void, delayMs = 90, staleMs = 5000) {
        this.#write = write;
        this.#delayMs = delayMs;
        this.#staleMs = staleMs;
    }

    /** The target of a scrub: many arrive per gesture, only the last one is written. */
    request(seconds: number): void {
        this.#pending = Math.max(0, seconds);
        // A `seeked` that never arrives — an element torn down mid-walk, a target the
        // element refused — must not lock the transport out of every later seek.
        if (this.#busy && Date.now() - this.#writtenAt > this.#staleMs) {
            this.#busy = false;
        }
        if (this.#busy) {
            // The walk in flight will finish at its own target; writing now would only
            // abandon it and start the same walk again.
            return;
        }
        this.#arm();
    }

    /** A discrete move, which the user expects to take effect without waiting. */
    jump(seconds: number): void {
        this.#cancel();
        this.#pending = Math.max(0, seconds);
        // An element can ignore a write without ever firing `seeked` — a target at the
        // very end of a finished file, or a seek issued while the element is still
        // attaching a new source. A jump has to recover from that the same way a scrub
        // does, or the transport stays locked on the first seek after a source switch
        // and the first frame can never be requested again.
        if (this.#busy && Date.now() - this.#writtenAt > this.#staleMs) {
            this.#busy = false;
        }
        this.#flush();
    }

    /** The element started a seek; every later request waits for it. */
    busy(): void {
        this.#busy = true;
    }

    /** The element finished a seek at `landed`, where `tolerance` seconds is one frame. */
    settle(landed: number, tolerance: number): void {
        this.#busy = false;
        if (this.#pending !== null && Math.abs(this.#pending - landed) <= tolerance) {
            this.#pending = null;
        }
        this.#flush();
    }

    /** Forget whatever is queued, for a source or element that is going away. */
    cancel(): void {
        this.#cancel();
        this.#pending = null;
        this.#busy = false;
    }

    #cancel(): void {
        if (this.#timer !== null) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }
    }

    #arm(): void {
        this.#cancel();
        this.#timer = setTimeout(() => {
            this.#timer = null;
            this.#flush();
        }, this.#delayMs);
    }

    #flush(): void {
        if (this.#busy || this.#pending === null) {
            return;
        }
        const target = this.#pending;
        this.#pending = null;
        this.#writtenAt = Date.now();
        // `busy` is left to the element's own `seeking` event rather than assumed here: a
        // write the element ignores (an unseekable stream, or the frame it is already on)
        // would otherwise hold the queue forever. The delay between the write and that
        // event is one task, far shorter than the debounce.
        this.#write(target);
    }
}
