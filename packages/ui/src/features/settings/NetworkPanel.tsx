import { useEffect, useState } from "react";

import {
    ApiError,
    useDisableLan,
    useEnableLan,
    useLanStatus,
    useRevokeLanSession,
    useRotateLanToken,
} from "@av1ation/api";
import { Check, Copy, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { Switch } from "../../shared/Switch";
import { Kicker } from "./Kicker";

/** The pairing URL as a QR image, generated locally so no third party sees the token. */
function PairingQr({ link }: { link: string }) {
    const [source, setSource] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let current = true;
        setFailed(false);
        void QRCode.toDataURL(link, {
            width: 320,
            margin: 1,
            errorCorrectionLevel: "M",
            color: { dark: "#0B0B0C", light: "#FFFFFF" },
        })
            .then((url) => {
                if (current) {
                    setSource(url);
                }
            })
            .catch(() => {
                if (current) {
                    setFailed(true);
                }
            });
        return () => {
            current = false;
        };
    }, [link]);

    if (failed) {
        return (
            <p className="m-0 rounded-md border border-line bg-sunken px-3 py-4 text-[11px] text-ink-muted">
                The QR image could not be generated. Use the link below instead.
            </p>
        );
    }
    if (source === null) {
        return (
            <div
                aria-busy="true"
                className="aspect-square w-full max-w-[240px] animate-pulse rounded-md border border-line bg-raised"
            />
        );
    }
    return (
        <img
            src={source}
            alt="QR code for the LAN pairing link"
            width={240}
            height={240}
            className="w-full max-w-[240px] rounded-md bg-white p-2"
        />
    );
}

/**
 * LAN access: an explicit second listener, per-browser tokens, and revocable links.
 *
 * The board keeps the control column on the left and the two things a user acts on —
 * the QR and the session list — on the right, so pairing does not push the address
 * details off-screen on a laptop.
 */
export function NetworkPanel() {
    const lan = useLanStatus();
    const enable = useEnableLan();
    const disable = useDisableLan();
    const rotate = useRotateLanToken();
    const revoke = useRevokeLanSession();
    const [copied, setCopied] = useState<"link" | "token" | "code" | null>(null);
    const [selectedSession, setSelectedSession] = useState<string | null>(null);

    if (lan.isPending) {
        return (
            <div className="mt-8 space-y-2" aria-busy="true">
                <div className="h-8 w-48 animate-pulse rounded bg-raised" />
                <div className="h-40 animate-pulse rounded-lg border border-line bg-surface" />
            </div>
        );
    }

    if (lan.isError) {
        // A paired browser is served through the very listener this panel manages, so the
        // control routes are refused there by design; that is a state, not a failure, and
        // retrying would never succeed.
        const refused = lan.error instanceof ApiError && lan.error.status === 403;
        if (refused) {
            return (
                <section className="mt-8 max-w-[760px]" aria-label="Local network">
                    <p className="m-0 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-secondary">
                        Local network access for other phones, tablets, and computers.
                    </p>
                    <div className="mt-6 rounded-lg border border-line bg-surface px-5 py-4">
                        <p className="m-0 text-[12.5px] font-medium text-ink">
                            This browser is connected through LAN access
                        </p>
                        <p className="mt-1 mb-0 text-[11.5px] leading-relaxed text-ink-secondary">
                            Enabling, pairing, and revoking browsers are done in the desktop window
                            on the host machine, so a paired browser cannot cut itself off.
                            Everything else on this screen applies here as it does there.
                        </p>
                    </div>
                </section>
            );
        }
        return (
            <section className="mt-8 max-w-[760px]" aria-label="Local network">
                <div
                    role="alert"
                    className="mt-6 rounded-lg border border-line bg-surface px-5 py-4"
                >
                    <p className="m-0 text-[12.5px] font-medium text-ink">
                        Network status could not be loaded
                    </p>
                    <p className="mt-1 mb-3 text-[11.5px] leading-relaxed text-ink-secondary">
                        {lan.error instanceof Error
                            ? lan.error.message
                            : "The local service did not respond."}
                    </p>
                    <Button variant="secondary" onClick={() => void lan.refetch()}>
                        Retry
                    </Button>
                </div>
            </section>
        );
    }

    const status = lan.data;
    if (status === undefined) {
        return null;
    }
    const url = status.url ?? undefined;
    const session =
        status.sessions.find((entry) => entry.id === selectedSession) ?? status.sessions[0];
    const token = session?.token ?? status.token ?? undefined;
    const shortcode = session?.shortcode;
    const link =
        status.enabled && url !== undefined && token !== undefined
            ? `${url}/#t=${encodeURIComponent(token)}`
            : null;
    const pending = enable.isPending || disable.isPending || rotate.isPending || revoke.isPending;
    const failure = enable.error ?? disable.error ?? rotate.error ?? revoke.error;

    const copy = (kind: "link" | "token" | "code", value: string) => {
        void navigator.clipboard
            .writeText(value)
            .then(() => {
                setCopied(kind);
                toast.success(
                    kind === "link"
                        ? "Pairing link copied"
                        : kind === "code"
                          ? "Pairing code copied"
                          : "Token copied",
                );
            })
            .catch(() => toast.error("Clipboard access was refused by the host."));
    };

    const toggle = (next: boolean) => {
        if (next) {
            enable.mutate(undefined, {
                onSuccess: (updated) => {
                    setSelectedSession(updated.sessions[0]?.id ?? null);
                    toast.success("LAN access enabled");
                },
            });
        } else {
            disable.mutate(undefined, { onSuccess: () => toast.success("LAN access disabled") });
        }
    };

    return (
        <section className="mt-8" aria-label="Local network">
            <p className="m-0 max-w-[78ch] text-[12.5px] leading-relaxed text-ink-secondary">
                Local network access for other phones, tablets, and computers.
            </p>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-4">
                    <section className="rounded-lg border border-line bg-surface px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="m-0 text-sm font-semibold text-ink">LAN access</h2>
                                <p className="mt-1 mb-0 max-w-[68ch] text-[11.5px] leading-relaxed text-ink-secondary">
                                    When on, the service binds to the selected interface and every
                                    request requires a pairing token. It is not a trusted-network
                                    mode.
                                </p>
                            </div>
                            <Switch
                                checked={status.enabled}
                                disabled={pending}
                                label="LAN access"
                                onChange={toggle}
                            />
                        </div>
                        <p className="mt-3 mb-0 border-t border-line-subtle pt-3 text-[10.5px] leading-relaxed text-ink-muted">
                            Turning this off closes every connected session and revokes every token.
                            Loopback continues to work without one. Only one transport is exposed:
                            the same HTTP + SSE API the desktop window uses.
                        </p>
                    </section>

                    <section className="rounded-lg border border-line bg-surface px-5 py-4">
                        <h2 className="m-0 text-sm font-semibold text-ink">Bound address</h2>
                        <p className="mt-1 mb-0 text-[11.5px] leading-relaxed text-ink-secondary">
                            The advertised address is derived from the chosen interface, never
                            guessed.
                        </p>
                        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                            {[
                                ["Bind", status.enabled ? status.bind : "127.0.0.1"],
                                ["Port", status.port === null ? "—" : String(status.port)],
                                [
                                    "Reachable at",
                                    status.enabled && status.port !== null
                                        ? `${status.bind === "127.0.0.1" ? "127.0.0.1" : url === undefined ? status.bind : new URL(url).hostname}:${String(status.port)}`
                                        : "Loopback only",
                                ],
                            ].map(([label, value]) => (
                                <div key={label} className="min-w-0">
                                    <dt className="font-mono text-[8.5px] tracking-[0.12em] text-ink-muted uppercase">
                                        {label}
                                    </dt>
                                    <dd className="m-0 mt-1 truncate rounded-md border border-line bg-app px-2 py-1.5 font-mono text-[10.5px] text-ink-secondary">
                                        {value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        <p className="mt-3 mb-0 flex items-center gap-1.5 text-[10.5px] text-ink-muted">
                            <span
                                aria-hidden="true"
                                className={`h-1.5 w-1.5 rounded-full ${
                                    status.enabled ? "bg-success" : "bg-ink-muted"
                                }`}
                            />
                            {status.enabled ? "Listening · started with the app" : "Not listening"}
                        </p>
                        <p className="mt-1 mb-0 text-[10px] leading-relaxed text-ink-muted">
                            Firewall: allow TCP {status.port ?? "—"}. On Windows the rule is per
                            network profile; on macOS the application firewall covers it, not a port
                            rule.
                        </p>
                    </section>

                    <section className="rounded-lg border border-line bg-surface px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="m-0 text-sm font-semibold text-ink">Pairing</h2>
                                <p className="mt-1 mb-0 text-[11.5px] leading-relaxed text-ink-secondary">
                                    One token per browser. Revoking a session invalidates only that
                                    token.
                                </p>
                            </div>
                            <Button
                                variant="secondary"
                                className="h-8 px-2.5 text-[12px]"
                                disabled={!status.enabled || pending}
                                onClick={() =>
                                    rotate.mutate(undefined, {
                                        onSuccess: (updated) => {
                                            setSelectedSession(updated.sessions[0]?.id ?? null);
                                            toast.success("A new pairing token was issued");
                                        },
                                    })
                                }
                            >
                                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                                New token
                            </Button>
                        </div>

                        <div className="mt-3 rounded-md border border-line-strong bg-raised px-3 py-2.5">
                            <div className="flex items-center gap-3">
                                <div className="min-w-0 flex-1">
                                    <Kicker>Pairing code</Kicker>
                                    <code className="mt-1 block font-mono text-[16px] tracking-[0.16em] text-ink">
                                        {shortcode ?? "—"}
                                    </code>
                                </div>
                                <button
                                    type="button"
                                    disabled={shortcode === undefined}
                                    aria-label="Copy pairing code"
                                    onClick={() => {
                                        if (shortcode !== undefined) {
                                            copy("code", shortcode);
                                        }
                                    }}
                                    className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-hover hover:text-ink disabled:opacity-40"
                                >
                                    {copied === "code" ? (
                                        <Check aria-hidden="true" className="h-3 w-3" />
                                    ) : (
                                        <Copy aria-hidden="true" className="h-3 w-3" />
                                    )}
                                    Copy
                                </button>
                            </div>
                            <p className="mt-1.5 mb-0 text-[10px] leading-relaxed text-ink-muted">
                                Type this on the other device. It exchanges for the session’s token
                                and expires with the session.
                            </p>
                        </div>

                        <div className="mt-2 flex items-center gap-2 rounded-md border border-line-subtle bg-sunken px-3 py-2">
                            <Kicker>Token</Kicker>
                            <code className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-secondary">
                                {token ?? "—"}
                            </code>
                            <button
                                type="button"
                                disabled={token === undefined}
                                onClick={() => {
                                    if (token !== undefined) {
                                        copy("token", token);
                                    }
                                }}
                                className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-hover hover:text-ink disabled:opacity-40"
                            >
                                {copied === "token" ? (
                                    <Check aria-hidden="true" className="h-3 w-3" />
                                ) : (
                                    <Copy aria-hidden="true" className="h-3 w-3" />
                                )}
                                Copy
                            </button>
                        </div>
                        <p className="mt-2 mb-0 text-[10px] leading-relaxed text-ink-muted">
                            The token and code are shown here so access remains recoverable. Neither
                            is written to a log. The session expires 24 hours after creation.
                        </p>
                    </section>
                </div>

                <aside className="min-w-0 space-y-4">
                    <section className="rounded-lg border border-line bg-surface px-5 py-4">
                        <Kicker>Scan to pair</Kicker>
                        <h2 className="mt-1 mb-0 text-base font-semibold text-ink">
                            Open on another device
                        </h2>
                        <div className="mt-3 flex justify-center">
                            {link === null ? (
                                <div className="flex aspect-square w-full max-w-[240px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-sunken px-4 text-center text-[11px] text-ink-muted">
                                    {status.enabled
                                        ? "No token is issued. Create one to pair a browser."
                                        : "Turn on LAN access to create a pairing code."}
                                    {status.enabled ? (
                                        <Button
                                            className="h-7 px-2.5 text-[11px]"
                                            disabled={pending}
                                            onClick={() =>
                                                rotate.mutate(undefined, {
                                                    onSuccess: (updated) => {
                                                        setSelectedSession(
                                                            updated.sessions[0]?.id ?? null,
                                                        );
                                                        toast.success(
                                                            "A new pairing token was issued",
                                                        );
                                                    },
                                                })
                                            }
                                        >
                                            {rotate.isPending ? "Issuing…" : "Create pairing code"}
                                        </Button>
                                    ) : null}
                                </div>
                            ) : (
                                <PairingQr link={link} />
                            )}
                        </div>
                        {link === null ? null : (
                            <>
                                <code className="mt-3 block truncate font-mono text-[10px] text-brand-text">
                                    {link}
                                </code>
                                <button
                                    type="button"
                                    onClick={() => copy("link", link)}
                                    className="mt-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-ink-muted hover:bg-hover hover:text-ink"
                                >
                                    {copied === "link" ? (
                                        <Check aria-hidden="true" className="h-3 w-3" />
                                    ) : (
                                        <Copy aria-hidden="true" className="h-3 w-3" />
                                    )}
                                    Copy pairing link
                                </button>
                            </>
                        )}
                        <p className="mt-2 mb-0 text-[10px] leading-relaxed text-ink-muted">
                            Scanning opens the same UI. A keyboard user can enter the code instead.
                            Either way the token is bound to that browser and can be revoked without
                            touching the others.
                        </p>
                    </section>

                    <section className="rounded-lg border border-line bg-surface px-5 py-4">
                        <Kicker>Connected sessions · {status.sessions.length}</Kicker>
                        {status.sessions.length === 0 ? (
                            <p className="mt-2 mb-0 text-[11px] leading-relaxed text-ink-muted">
                                No browser has paired yet.
                            </p>
                        ) : (
                            <ul className="m-0 mt-2 list-none space-y-1.5 p-0">
                                {status.sessions.map((entry) => (
                                    <li
                                        key={entry.id}
                                        className={`flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 ${
                                            entry.id === session?.id
                                                ? "border-line-strong bg-raised"
                                                : "border-line bg-sunken"
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setSelectedSession(entry.id)}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <span className="block truncate text-[10.5px] font-medium text-ink">
                                                {entry.label}
                                            </span>
                                            <span className="block truncate font-mono text-[9px] text-ink-muted">
                                                {entry.address ?? "address unknown"}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Revoke ${entry.label}`}
                                            disabled={pending}
                                            onClick={() =>
                                                revoke.mutate(entry.id, {
                                                    onSuccess: () => {
                                                        setSelectedSession(null);
                                                        toast.success("That browser was revoked");
                                                        // Revoking the last session while
                                                        // LAN access is on left the panel
                                                        // with no token to show at all. LAN
                                                        // access itself is still on, so a
                                                        // fresh code keeps it usable.
                                                        if (status.sessions.length === 1) {
                                                            rotate.mutate(undefined, {
                                                                onSuccess: (updated) =>
                                                                    setSelectedSession(
                                                                        updated.sessions[0]?.id ??
                                                                            null,
                                                                    ),
                                                            });
                                                        }
                                                    },
                                                })
                                            }
                                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                                        >
                                            Revoke
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </aside>
            </div>

            {failure === null || failure === undefined ? null : (
                <p role="alert" className="mt-3 mb-0 text-[11.5px] leading-relaxed text-danger">
                    {failure instanceof Error
                        ? failure.message
                        : "The network setting could not be changed."}
                </p>
            )}

            <p className="mt-4 mb-0 max-w-[92ch] text-[10.5px] leading-relaxed text-ink-muted">
                The QR contains the token; screenshot it only if you intend to share access. Pairing
                over the internet is out of scope — this is LAN-only, over plain HTTP on a trusted
                network.
            </p>
        </section>
    );
}
