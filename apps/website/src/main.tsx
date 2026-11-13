import { MockTransport } from "@av1ation/api";
import { mountApp } from "@av1ation/ui";

import { galleryMediaUrl, seedGallery, type GalleryMode } from "./gallery-fixtures";

const transport = new MockTransport({ mediaUrl: galleryMediaUrl });
const gallery = new URLSearchParams(window.location.search).get("gallery");
if (gallery !== null && isGalleryMode(gallery)) {
    seedGallery(transport, gallery);
}

mountApp(transport);

function isGalleryMode(value: string): value is GalleryMode {
    return (
        value === "populated" ||
        value === "empty" ||
        value === "empty-queue" ||
        value === "empty-scenes" ||
        value === "failing" ||
        value === "loading"
    );
}
