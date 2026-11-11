import { RefreshCw } from "lucide-react";

import { Button } from "../../shared/Button";

/** The empty panel a failed request leaves behind, with the one action that can help. */
export function LogErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="rounded-lg border border-danger/30 bg-surface px-5 py-6" role="alert">
            <p className="m-0 text-sm font-semibold text-ink">The log could not be opened</p>
            <p className="mt-1 mb-4 max-w-[80ch] text-[12px] leading-relaxed text-ink-secondary">
                {message}
            </p>
            <Button variant="secondary" onClick={onRetry}>
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                Retry
            </Button>
        </div>
    );
}
