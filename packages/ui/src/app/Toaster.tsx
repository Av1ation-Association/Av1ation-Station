import { Toaster as Sonner } from "sonner";

import { useResolvedTheme } from "../shared/theme";

/**
 * Transient confirmations only. Anything a user must read or act on stays inline on the
 * screen that owns it; this surface never carries an error that needs a decision.
 */
export function Toaster() {
    const theme = useResolvedTheme();

    return (
        <Sonner
            theme={theme}
            position="bottom-right"
            closeButton
            toastOptions={{
                classNames: {
                    toast: "!rounded-lg !border !border-line-strong !bg-raised !text-ink !shadow-elevation-2",
                    title: "!text-[13px] !font-medium",
                    description: "!text-[12px] !text-ink-secondary",
                    actionButton: "!bg-brand !text-on-brand",
                    cancelButton: "!bg-hover !text-ink",
                    closeButton: "!border-line !bg-surface !text-ink-secondary",
                },
            }}
        />
    );
}
