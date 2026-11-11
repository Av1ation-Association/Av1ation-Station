/**
 * Keeps playback frame-exact by slowing the clock instead of skipping frames.
 *
 * A video editor must not drop frames: the picture is the thing being judged, and a skipped
 * frame is a judgement made on a picture that was never shown. Chromium's media pipeline
 * presents on the media clock and drops whatever it cannot decode in time, and there is no
 * API that asks it to present every frame instead. Slowing the clock is the lever that does
 * exist: at 0.9× the decoder has more time per frame, every frame still reaches the screen in
 * order, and the timeline — which follows the same clock — stays honest about what was shown.
 *
 * The governor watches presented frames rather than the decoder, because that is the only
 * measurement that matches what the user saw. A gap larger than one frame between the
 * `mediaTime` of two callbacks means the compositor skipped at least one; the rate steps down,
 * and recovers only after a quiet period so it cannot oscillate around the threshold.
 */
export class RateGovernor {
    readonly #frameSeconds: number;
    readonly #floor: number;
    readonly #step: number;
    /** How many frame intervals a gap must exceed before it counts as a skip. */
    readonly #skipFrames: number;
    #rate = 1;
    #lastMediaTime: number | null = null;
    #cleanSince = 0;
    #changedAt = 0;

    constructor(
        frameSeconds: number,
        options: { floor?: number; step?: number; skipFrames?: number } = {},
    ) {
        this.#frameSeconds = frameSeconds > 0 ? frameSeconds : 1 / 24;
        this.#floor = options.floor ?? 0.5;
        this.#step = options.step ?? 0.05;
        this.#skipFrames = options.skipFrames ?? 1.6;
    }

    /** The rate the element should be playing at. */
    get rate(): number {
        return this.#rate;
    }

    /**
     * Record one presented frame.
     *
     * Returns the new rate when it changed and `null` when the element should be left alone,
     * so the caller only touches `playbackRate` — which glitches audio — on a real change.
     */
    frame(mediaTime: number, now: number): number | null {
        if (!Number.isFinite(mediaTime)) {
            return null;
        }
        const previous = this.#lastMediaTime;
        this.#lastMediaTime = mediaTime;
        if (previous === null) {
            this.#cleanSince = now;
            return null;
        }
        const delta = mediaTime - previous;
        // A seek moves the media clock by more than a few frames at once. It is not a
        // skipped frame, and treating it as one would slow playback for every scrub.
        if (delta < 0 || delta > this.#frameSeconds * 12) {
            this.#cleanSince = now;
            return null;
        }
        if (delta > this.#frameSeconds * this.#skipFrames) {
            // One step per quarter second: a burst of drops should not drive the rate to the
            // floor before the first correction has had any effect.
            if (now - this.#changedAt < 250) {
                return null;
            }
            const next = this.#round(Math.max(this.#floor, this.#rate - this.#step));
            this.#changedAt = now;
            this.#cleanSince = now;
            if (next === this.#rate) {
                return null;
            }
            this.#rate = next;
            return next;
        }
        if (this.#rate < 1 && now - this.#cleanSince > 2000 && now - this.#changedAt > 500) {
            const next = this.#round(Math.min(1, this.#rate + this.#step));
            this.#changedAt = now;
            this.#rate = next;
            return next;
        }
        return null;
    }

    /**
     * The compositor dropped a frame, which it reports only after the fact.
     *
     * Unlike an interval gap, this is not a hint: a frame is already gone, so the rate has
     * to fall at once rather than wait for the quarter-second gap throttle. Repeated drops
     * step again each time, which walks the rate to what the decoder can actually hold.
     */
    skip(now: number): number | null {
        if (now - this.#changedAt < 120) {
            return null;
        }
        const next = this.#round(Math.max(this.#floor, this.#rate - this.#step));
        this.#changedAt = now;
        this.#cleanSince = now;
        if (next === this.#rate) {
            return null;
        }
        this.#rate = next;
        return next;
    }

    /** Start again at full speed, for a new element or source. */
    reset(): void {
        this.#rate = 1;
        this.#lastMediaTime = null;
        this.#cleanSince = 0;
        this.#changedAt = 0;
    }

    #round(value: number): number {
        return Math.round(value * 100) / 100;
    }
}
