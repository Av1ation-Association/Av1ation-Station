/**
 * Drive a throttled peer's remaining wait down one second at a time.
 *
 * The pairing page owns the DOM and this owns the timer, so a second attempt cannot leave
 * two intervals racing and the caller never has to derive the wait from a sentence.
 * Returns a stop function for when the page or the wait goes away.
 */
export function pairingCountdown(
    seconds: number,
    onTick: (remaining: number) => void,
    onDone: () => void,
    timers: Pick<typeof globalThis, "setInterval" | "clearInterval"> = globalThis,
): () => void {
    let remaining = Math.max(1, Math.ceil(seconds));
    let timer: ReturnType<typeof timers.setInterval> | undefined;
    const stop = () => {
        if (timer !== undefined) {
            timers.clearInterval(timer);
            timer = undefined;
        }
    };
    onTick(remaining);
    timer = timers.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            stop();
            onDone();
            return;
        }
        onTick(remaining);
    }, 1000);
    return stop;
}
