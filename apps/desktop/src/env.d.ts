/// <reference types="vite/client" />

interface Window {
    /** Loopback origin of the embedded service, injected before the SPA loads. */
    __AV1ATION_SERVICE_ORIGIN__?: string;
    /** Tauri's IPC bridge. Present only inside a native webview, never in a browser tab. */
    __TAURI_INTERNALS__?: unknown;
}
