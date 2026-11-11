/**
 * Write a text file to the browser's downloads.
 *
 * A host with no filesystem to save into — a LAN browser, the website demo — still has to
 * hand the bytes to the user, and naming the file is all such a host can do. The object URL
 * is revoked shortly after the click, because a document that keeps every export alive is a
 * leak; revoking immediately can cancel the navigation in some browsers.
 */
export function downloadText(text: string, filename: string, type: string): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
