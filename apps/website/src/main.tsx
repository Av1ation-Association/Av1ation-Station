import { MockTransport } from "@av1ation/api";
import { mountApp, PairingScreen } from "@av1ation/ui";
import { createRoot } from "react-dom/client";

import type { GalleryMode } from "./gallery-fixtures";
import { galleryMediaUrl } from "./gallery-media";

async function start(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    // A LAN browser with no token sees the pairing form before any shell mounts. The
    // capture-only route mounts the real form without exposing a destination in the demo.
    if (params.get("capture") === "pairing") {
        document.documentElement.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)")
            .matches
            ? "dark"
            : "light";
        const root = document.getElementById("root");
        if (root !== null) {
            createRoot(root).render(
                <PairingScreen
                    pair={() => Promise.resolve({ token: "gallery-pairing-token" })}
                    onPaired={() => undefined}
                />,
            );
        }
        return;
    }
    const transport = new MockTransport({ mediaUrl: galleryMediaUrl });
    const gallery = params.get("gallery");
    // The public demo opens on the captured run rather than an empty first-run state; a
    // screenshot or test can still request a specific gallery mode with `?gallery=`.
    const mode = gallery !== null && isGalleryMode(gallery) ? gallery : "populated";
    // The screenshot fixtures are large, so they stay in their own chunk instead of the
    // site bundle. The demo page is a separate entry and is not part of the website budget.
    const { seedGallery } = await import("./gallery-fixtures");
    seedGallery(transport, mode);
    mountApp(transport, { hashHistory: true });
}

void start().catch((error: unknown) => {
    console.error("The website demo could not start.", error);
    const root = document.getElementById("root");
    if (root !== null) {
        root.textContent = "The website demo could not start.";
    }
});

function isGalleryMode(value: string): value is GalleryMode {
    return (
        value === "populated" ||
        value === "empty" ||
        value === "empty-queue" ||
        value === "empty-scenes" ||
        value === "failing" ||
        value === "loading" ||
        value === "running" ||
        value === "failed" ||
        value === "blocked" ||
        value === "missing-dependency" ||
        value === "lan-off" ||
        value === "invalid-scenes" ||
        value === "concat-inventory"
    );
}
