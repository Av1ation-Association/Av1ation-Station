import { createContext, useContext, useMemo, type ReactNode } from "react";

const DemoModeContext = createContext(false);

/** The host surface an embedded demo owns, or `null` in the desktop application. */
export interface EmbeddedDemoHost {
    /** The element every overlay portals into, keeping the marketing page outside it. */
    readonly portalContainer: HTMLElement | null;
}

const EmbeddedDemoHostContext = createContext<EmbeddedDemoHost | null>(null);

const HostShortcutsContext = createContext(true);

/**
 * Whether this tree answers document-level chords.
 *
 * A bounded documentation frame sets this false: the guide is a reading aid, so Save, Undo,
 * the command palette, and Run must not answer keys aimed at the page or its search field.
 * Every other host keeps the default.
 */
export function HostShortcutsProvider({
    enabled,
    children,
}: {
    children: ReactNode;
    enabled: boolean;
}) {
    return (
        <HostShortcutsContext.Provider value={enabled}>{children}</HostShortcutsContext.Provider>
    );
}

export function useHostShortcuts(): boolean {
    return useContext(HostShortcutsContext);
}

/** Marks a screen tree as the public, read-only demo rather than the desktop application. */
export function DemoModeProvider({
    children,
    enabled = true,
    embedded = false,
    portalContainer = null,
}: {
    children: ReactNode;
    enabled?: boolean;
    /** True when the demo is mounted inside a host page rather than as the whole document. */
    embedded?: boolean;
    /** The overlay host inside the demo frame; only used when `embedded` is true. */
    portalContainer?: HTMLElement | null;
}) {
    const host = useMemo(
        () => (embedded ? { portalContainer } : null),
        [embedded, portalContainer],
    );
    return (
        <DemoModeContext.Provider value={enabled}>
            <EmbeddedDemoHostContext.Provider value={host}>
                {children}
            </EmbeddedDemoHostContext.Provider>
        </DemoModeContext.Provider>
    );
}

/**
 * Whether this tree is the public demo.
 *
 * The demo shows the real screens, but its navigation is one tab strip: configuration cards
 * do not open their section pages, and no action may move the reader outside Configuration,
 * Scenes, History, and Logs.
 */
export function useDemoMode(): boolean {
    return useContext(DemoModeContext);
}

/**
 * The embedded host's overlay boundary.
 *
 * Overlays in the marketing embed must not become page-level modals: a scroll lock or an
 * `aria-hidden` sweep would affect the surrounding article. The host therefore supplies a
 * portal element inside the application frame, and the shared primitives switch to
 * non-modal behavior when this context is present.
 */
export function useEmbeddedDemoHost(): EmbeddedDemoHost | null {
    return useContext(EmbeddedDemoHostContext);
}
