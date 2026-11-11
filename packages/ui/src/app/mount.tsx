import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
    ApiProvider,
    HttpTransport,
    type Transport,
    type HttpTransportOptions,
} from "@av1ation/api";
import { LanPairingSchema, MediaTicketSchema } from "@av1ation/contracts";

import { App } from "./App";
import { PairingScreen } from "../features/settings/PairingScreen";
import { createAppRouter } from "./router";
import "../styles.css";

/** Mounts the same application tree against the host's transport. */
export function mountApp(transport: Transport): void {
    const container = document.getElementById("root");
    if (container === null) {
        throw new Error("The host document is missing #root.");
    }
    const router = createAppRouter();
    createRoot(container).render(
        <StrictMode>
            <ApiProvider transport={transport}>
                <App router={router} />
            </ApiProvider>
        </StrictMode>,
    );
}

/** Mounts the shared UI against a loopback or LAN service origin. */
export function mountHttpApp(origin: string, options: HttpTransportOptions = {}): void {
    mountApp(new HttpTransport(origin, options));
}

/**
 * Mounts a page served by the LAN listener, which authenticates with a bearer token.
 *
 * The token arrives in the URL fragment so it never reaches the service in a request or a
 * `Referer`, is moved into session storage once, and is removed from the address bar
 * before the shared router starts. A page without a token shows the pairing form rather
 * than a shell whose every request would be refused.
 */
export function mountBrowserApp(origin: string, tokenKey = "av1ation-lan-token"): void {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/u, ""));
    const incoming = fragment.get("t") ?? fragment.get("token");
    if (incoming !== null && incoming.length > 0) {
        window.sessionStorage.setItem(tokenKey, incoming);
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    const token = incoming ?? window.sessionStorage.getItem(tokenKey);
    if (token === null || token.length === 0) {
        renderPairingPage(origin, tokenKey);
        return;
    }
    // A video element cannot send the bearer header, so the page mints its one media
    // credential before the first screen renders; otherwise the Scenes tab would paint with
    // a source URL the listener refuses and never recompute it. The rest of the API does
    // not depend on this, so a refusal still mounts the shell — the preview says why.
    const transport = new HttpTransport(origin, { token });
    let mounted = false;
    const mount = (mediaTicket?: string) => {
        if (mounted) {
            return;
        }
        mounted = true;
        mountHttpApp(origin, mediaTicket === undefined ? { token } : { token, mediaTicket });
    };
    void transport
        .post("/api/media/ticket", {}, MediaTicketSchema)
        .then((ticket) => mount(ticket.ticket))
        .catch(() => mount());
}

/** The one pairing form for a browser that reached the service without a token. */
function renderPairingPage(origin: string, tokenKey: string): void {
    const container = document.getElementById("root");
    if (container === null) {
        throw new Error("The host document is missing #root.");
    }
    const transport = new HttpTransport(origin);
    createRoot(container).render(
        <StrictMode>
            <PairingScreen
                pair={(shortcode) => transport.post("/api/pair", { shortcode }, LanPairingSchema)}
                onPaired={(token) => {
                    window.sessionStorage.setItem(tokenKey, token);
                    window.location.reload();
                }}
            />
        </StrictMode>,
    );
}
