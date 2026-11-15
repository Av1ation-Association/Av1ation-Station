import { createContext, useContext } from "react";

/**
 * Internal docs navigation. MDX links cannot own the router, so the layout provides the
 * one function every page uses; modifier clicks stay with the browser.
 */
export const DocsNavigationContext = createContext<(href: string) => void>(() => undefined);

export function useDocsNavigate(): (href: string) => void {
    return useContext(DocsNavigationContext);
}
