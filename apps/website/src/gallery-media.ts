/** The gallery media is generated into the website's public directory before the build. */
const MEDIA_VERSION = "conway-life-1";

export function galleryMediaUrl(path: string): string {
    const thumbnail = /\/videos\/[^/]+\/thumbnails\/(\d+)/u.exec(path);
    if (thumbnail !== null) {
        return `/gallery/thumbs/${thumbnail[1]}.jpg?v=${MEDIA_VERSION}`;
    }
    if (path.includes("/frame?")) {
        return `/gallery/frame.jpg?v=${MEDIA_VERSION}`;
    }
    if (/\/media(?:\?|$)/u.test(path)) {
        return `/gallery/demo.webm?v=${MEDIA_VERSION}`;
    }
    return "";
}
