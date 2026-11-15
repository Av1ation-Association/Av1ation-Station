import { useEffect, useRef, useState, type FormEvent } from "react";

import { ApiError } from "@av1ation/api";
import type { LanPairing } from "@av1ation/contracts";

import { Button } from "../../shared/Button";
import { pairingCode } from "./pairing-code";
import { pairingCountdown } from "./pairing-countdown";

type Wait = { seconds: number; nonce: number };

const LINK_TOKEN = /(?:^#|[#&])t=([^&]+)/u;
const BEARER_TOKEN = /^[0-9a-f]{64}$/iu;

function waitText(remaining: number): string {
    return `Too many pairing attempts. Try again in ${remaining} ${
        remaining === 1 ? "second" : "seconds"
    }.`;
}

/**
 * The browser's standalone pairing form.
 *
 * It runs before the router because a browser without a token must not mount a shell whose
 * every request would be refused. The form owns only the token exchange; the host decides
 * where the accepted token lives and when to reload.
 */
export function PairingScreen({
    pair,
    onPaired,
    embedded = false,
}: {
    pair: (shortcode: string) => Promise<LanPairing>;
    onPaired: (token: string) => void;
    /** Render inside an article instead of taking the viewport; used by the manual sample. */
    embedded?: boolean;
}) {
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);
    const [wait, setWait] = useState<Wait | null>(null);
    const [error, setError] = useState("");
    const waitRef = useRef<Wait | null>(null);
    const nextWait = useRef(0);

    useEffect(() => {
        waitRef.current = wait;
    }, [wait]);

    const waitNonce = wait?.nonce;
    useEffect(() => {
        const current = waitRef.current;
        if (current === null) {
            return;
        }
        const nonce = current.nonce;
        return pairingCountdown(
            current.seconds,
            (seconds) => {
                if (waitRef.current?.nonce !== nonce) {
                    return;
                }
                setWait({ seconds, nonce });
            },
            () => {
                if (waitRef.current?.nonce !== nonce) {
                    return;
                }
                setWait(null);
                setError("");
            },
        );
    }, [waitNonce]);

    const startWait = (seconds: number) => {
        const remaining = Math.max(1, Math.ceil(seconds));
        nextWait.current += 1;
        setError(waitText(remaining));
        setWait({ seconds: remaining, nonce: nextWait.current });
    };

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy || wait !== null) {
            return;
        }

        const input = value.trim();
        const fromLink = LINK_TOKEN.exec(input);
        if (fromLink?.[1] !== undefined) {
            try {
                const token = decodeURIComponent(fromLink[1]);
                if (token.length === 0) {
                    setError("That pairing link is not valid.");
                    return;
                }
                onPaired(token);
            } catch {
                setError("That pairing link is not valid.");
            }
            return;
        }

        const code = pairingCode(input);
        if (code === null) {
            if (input.length === 0) {
                setError("Enter the code, token, or full link from Settings.");
                return;
            }
            // A bearer token is 64 hex characters. Anything else is a mistyped code; do not
            // store it as a token, because the resulting 401s would leave no way back to
            // this form without clearing session storage by hand.
            if (BEARER_TOKEN.test(input)) {
                onPaired(input);
                return;
            }
            setError("That is not an eight-character code or a full pairing link.");
            return;
        }

        setBusy(true);
        setError("Checking the code…");
        void pair(code)
            .then((pairing) => onPaired(pairing.token))
            .catch((failure: unknown) => {
                setBusy(false);
                if (failure instanceof ApiError && failure.retryAfter !== null) {
                    startWait(failure.retryAfter);
                    return;
                }
                setError(
                    failure instanceof Error
                        ? failure.message
                        : "The pairing service could not be reached.",
                );
            });
    };

    const locked = busy || wait !== null;
    const buttonLabel = busy ? "Pairing…" : wait === null ? "Pair" : "Wait…";

    const content = (
        <>
            <h1 className="m-0 text-xl font-semibold tracking-tight">Pair this browser</h1>
            <p className="mt-2 mb-4 text-[13px] leading-relaxed text-ink-secondary">
                Open the network link shown in Settings → Network on the desktop application, or
                enter the eight-character code from that screen.
            </p>
            <form onSubmit={submit} className="flex items-stretch gap-2">
                <label htmlFor="pair-token" className="sr-only">
                    Pairing code or link
                </label>
                <input
                    id="pair-token"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="characters"
                    placeholder="ABCD-EFGH or paste link"
                    disabled={locked}
                    aria-describedby="pair-help pair-error"
                    className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-app px-3 font-sans text-[13px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:opacity-50"
                />
                <Button type="submit" disabled={locked}>
                    {buttonLabel}
                </Button>
            </form>
            <p id="pair-help" className="mt-2.5 mb-0 text-[11px] leading-relaxed text-ink-muted">
                The code is under Pairing in Settings → Network. It expires with that browser's
                session.
            </p>
            <p
                id="pair-error"
                role="alert"
                aria-live={wait === null ? "assertive" : "off"}
                className="mt-3 mb-0 text-[12px] leading-relaxed text-danger"
            >
                {error}
            </p>
        </>
    );

    if (embedded) {
        return <div className="w-full max-w-[520px] text-ink">{content}</div>;
    }

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col justify-center px-6 py-12 text-ink">
            {content}
        </main>
    );
}
