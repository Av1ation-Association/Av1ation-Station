import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { Sheet } from "../../shared/Sheet";

/** The argv this encoder document would receive, shown before a run and copyable. */
export function EncoderCommandPreview({
    open,
    command,
    onClose,
}: {
    open: boolean;
    command: string;
    onClose: () => void;
}) {
    return (
        <Sheet
            open={open}
            placement="bottom"
            title="Preview command"
            eyebrow="Encoder"
            description="What this document sends the encoder for one scene. The input and output paths are supplied per chunk."
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        onClick={() => {
                            void navigator.clipboard
                                .writeText(command)
                                .then(() => toast.success("Command copied"))
                                .catch(() => toast.error("The command could not be copied."));
                        }}
                    >
                        <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                        Copy
                    </Button>
                </>
            }
        >
            <pre className="m-0 overflow-x-auto rounded-md border border-line bg-app px-3 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink">
                {command}
            </pre>
            <p className="mt-3 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                Parameters that are not set are absent, so the executable's own default applies. A
                saved build's executable replaces the PATH lookup.
            </p>
        </Sheet>
    );
}
