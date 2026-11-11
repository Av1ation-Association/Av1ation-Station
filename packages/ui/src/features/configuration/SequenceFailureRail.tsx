import { AlertTriangle } from "lucide-react";

import { failureSummary } from "../../shared/model/video-status";

/**
 * The failure of the run that reached this sequence.
 *
 * It is a band inside the card rather than a second alert in the page: the sequence is the
 * subject, and its name is the first thing the reader needs. The full engine message stays
 * available through the title, while the line itself is the first non-empty message line.
 */
export function SequenceFailureRail({
    sequence,
    message,
    wide = false,
}: {
    sequence: string;
    message: string;
    wide?: boolean;
}) {
    return (
        <div
            role="alert"
            className={`${wide ? "border-b px-4 sm:px-5" : "border-y px-4"} border-danger/20 bg-danger-soft py-2`}
        >
            <div className="flex min-w-0 items-start gap-2">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-danger" />
                <div className="min-w-0">
                    <p className="m-0 text-[10.5px] leading-relaxed font-medium text-danger">
                        {sequence} failed.
                    </p>
                    <p
                        className="mt-0.5 mb-0 line-clamp-2 text-[10.5px] leading-relaxed break-words text-ink-secondary"
                        title={message}
                    >
                        {failureSummary(message)}
                    </p>
                </div>
            </div>
        </div>
    );
}
