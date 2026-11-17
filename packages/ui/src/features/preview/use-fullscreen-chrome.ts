import { useCallback, useEffect, useRef, useState } from "react";

/** How long a still pointer may leave the fullscreen chrome on screen. */
const HIDE_DELAY_MS = 3000;

/**
 * Keep the fullscreen player chrome out of the picture until it is needed.
 *
 * The controls start visible so the fullscreen button has an obvious way back. A pointer
 * move or a focus event resets the idle timer; after it expires the transport slides away
 * and stops taking pointer events, leaving the whole stage to the picture. Outside
 * fullscreen the chrome is always visible and no timer runs.
 */
export function useFullscreenChrome(fullscreen: boolean): {
    visible: boolean;
    reveal: () => void;
} {
    const [visible, setVisible] = useState(true);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearTimer = useCallback(() => {
        if (timer.current !== null) {
            clearTimeout(timer.current);
            timer.current = null;
        }
    }, []);
    const schedule = useCallback(() => {
        clearTimer();
        if (fullscreen) {
            timer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
        }
    }, [clearTimer, fullscreen]);

    useEffect(() => {
        setVisible(true);
        schedule();
        return clearTimer;
    }, [schedule, clearTimer]);

    const reveal = useCallback(() => {
        setVisible(true);
        schedule();
    }, [schedule]);

    return { visible: !fullscreen || visible, reveal };
}
