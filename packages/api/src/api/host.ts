/** Host capabilities: pickers, save/open actions, restart, media URLs, and the LSP bridge. */
import type { LanguageServerChannel, Transport } from "../transport/types";
import { useTransport } from "./client";

type HostCapability = Pick<
    Transport,
    | "mediaUrl"
    | "pickFile"
    | "pickSaveFile"
    | "pickExecutable"
    | "pickVideoFile"
    | "pickVideoFiles"
    | "pickDirectory"
    | "saveTextFile"
    | "pickScript"
    | "pickIndex"
    | "pickModel"
    | "revealPath"
    | "openPath"
    | "restartApp"
>;

/**
 * One capability lookup, so a host that omits it returns the same `null` every hook
 * promises. The alternative was fourteen copies of the same two lines.
 */
function useCapability<K extends keyof HostCapability>(
    key: K,
): NonNullable<HostCapability[K]> | null {
    const transport = useTransport();
    return (transport[key] ?? null) as NonNullable<HostCapability[K]> | null;
}

/**
 * Write a text file at a path the user picks in the host's save dialog.
 *
 * A browser has no host filesystem, so the screen keeps its own download fallback; this is
 * `null` exactly where that fallback applies.
 */
export function useSaveTextFile() {
    return useCapability("saveTextFile");
}

/** Returns the host's generic file picker, or `null` where the host has none. */
export function usePickFile() {
    return useCapability("pickFile");
}

/** Returns the host's save dialog for an output file, or `null` where the host has none. */
export function usePickSaveFile() {
    return useCapability("pickSaveFile");
}

/** Returns the host's native executable picker, or `null` where the host has none. */
export function usePickExecutable() {
    return useCapability("pickExecutable");
}

/** Returns the host's VapourSynth script picker, or `null` where the host has none. */
export function usePickScript() {
    return useCapability("pickScript");
}

/** Returns the host's FFMS2 index picker, or `null` where the host has none. */
export function usePickIndex() {
    return useCapability("pickIndex");
}

/** Returns the host's TransNetV2 model picker, or `null` where the host has none. */
export function usePickModel() {
    return useCapability("pickModel");
}

/** Returns the host's process-restart action, or `null` where it has none. */
export function useRestartApp() {
    return useCapability("restartApp");
}

/** Returns the host's video picker, or `null` where the host has none. */
export function usePickVideoFile() {
    return useCapability("pickVideoFile");
}

/** Returns the host's multi-video picker, or `null` where the host has none. */
export function usePickVideoFiles() {
    return useCapability("pickVideoFiles");
}

/** Returns the host's directory picker, or `null` where the host has none. */
export function usePickDirectory() {
    return useCapability("pickDirectory");
}

/** Returns the host's file-manager reveal, or `null` where the host has none. */
export function useRevealPath() {
    return useCapability("revealPath");
}

/** Returns the host's default-handler open, or `null` where the host has none. */
export function useOpenPath() {
    return useCapability("openPath");
}

/**
 * A media-element URL for one service path, or `null` where the host cannot stream.
 *
 * A `<video>` cannot attach the transport's bearer token, so the façade owns this decision:
 * the loopback host returns a direct URL, the LAN and demo hosts return `null` and the
 * player renders why instead of a broken element.
 */
export function useMediaUrl(path: string): string | null {
    return useCapability("mediaUrl")?.(path) ?? null;
}

/** Open the host's language-server channel, `undefined` where the host cannot own one. */
export function useLanguageServerChannel():
    (() => Promise<LanguageServerChannel | null>) | undefined {
    const transport = useTransport();
    return transport.openLanguageServer;
}
