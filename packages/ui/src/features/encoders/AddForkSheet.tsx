import { useState } from "react";

import { useCreateEncoderFork, usePickExecutable, useProbeEncoderFork } from "@av1ation/api";
import type { EncoderDescriptor } from "@av1ation/contracts";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { Sheet } from "../../shared/Sheet";
import { FIELD } from "./encoder-fields";

/** A new saved build of one catalogue encoder. */
export function AddForkSheet({
    open,
    families,
    onClose,
    onSaved,
}: {
    open: boolean;
    families: EncoderDescriptor[];
    onClose: () => void;
    onSaved: (id: string) => void;
}) {
    const probe = useProbeEncoderFork();
    const create = useCreateEncoderFork();
    const pick = usePickExecutable();
    const [label, setLabel] = useState("");
    const [base, setBase] = useState(families[0]?.base ?? "svt-av1");
    const [path, setPath] = useState("");

    const request = { label: label.trim(), base, path: path.trim() };
    const canSubmit = label.trim() !== "" && path.trim() !== "";

    const locate = () => {
        if (pick === null) {
            return;
        }
        void pick()
            .then((picked) => {
                if (picked === null) {
                    return;
                }
                setPath(picked);
                probe.reset();
                // Locating a build is the request to identify it; the name and family are
                // already chosen above, so probe immediately instead of asking for a second
                // click.
                if (label.trim() !== "" && picked.trim() !== "") {
                    probe.mutate({ label: label.trim(), base, path: picked });
                }
            })
            .catch((error: unknown) =>
                toast.error(
                    error instanceof Error
                        ? `The file picker could not open: ${error.message}`
                        : "The file picker could not open.",
                ),
            );
    };

    return (
        <Sheet
            open={open}
            eyebrow="NEW CATALOGUE ENTRY"
            title="Add a build"
            description="A fork is another build of an encoder the engine already knows. Projects can select it; the built-in provider stays where it is."
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={!canSubmit || create.isPending}
                        onClick={() =>
                            create.mutate(request, {
                                onSuccess: (fork) => {
                                    toast.success(
                                        `${fork.label} added with ${Object.keys(fork.parameters).length} parameters`,
                                    );
                                    onSaved(fork.id);
                                },
                            })
                        }
                    >
                        {create.isPending ? "Saving…" : "Save build"}
                    </Button>
                </>
            }
        >
            <div className="grid gap-4">
                <label className="grid gap-1 text-[11px] text-ink-secondary">
                    Name
                    <input
                        value={label}
                        onChange={(event) => {
                            setLabel(event.target.value);
                            probe.reset();
                        }}
                        placeholder="SVT-AV1 (my fork)"
                        className={FIELD}
                    />
                </label>
                <label className="grid gap-1 text-[11px] text-ink-secondary">
                    Based on
                    <select
                        value={base}
                        onChange={(event) => {
                            setBase(event.target.value);
                            probe.reset();
                        }}
                        className="h-9 rounded-md border border-line-strong bg-raised px-2 text-[12px] text-ink"
                    >
                        {families.map((family) => (
                            <option key={family.id} value={family.base}>
                                {family.label}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="grid gap-1 text-[11px] text-ink-secondary">
                    <span>Executable</span>
                    <span className="flex flex-wrap gap-2">
                        <input
                            aria-label="Executable"
                            value={path}
                            onChange={(event) => {
                                setPath(event.target.value);
                                probe.reset();
                            }}
                            placeholder="C:/tools/svt-av1.exe"
                            spellCheck={false}
                            className={`${FIELD} min-w-[200px] flex-1 font-mono text-[11px]`}
                        />
                        {pick === null ? null : (
                            <Button
                                variant="secondary"
                                className="h-9 px-2.5 text-[12px]"
                                onClick={locate}
                            >
                                <FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />
                                Locate…
                            </Button>
                        )}
                    </span>
                </div>
                <Button
                    variant="secondary"
                    className="h-8 w-fit px-2.5 text-[11.5px]"
                    disabled={!canSubmit || probe.isPending}
                    onClick={() => probe.mutate(request)}
                >
                    {probe.isPending ? "Probing…" : "Probe help output"}
                </Button>
                {probe.data ? (
                    <div className="rounded-lg border border-line-subtle bg-sunken p-3">
                        <p
                            className={`m-0 text-[11.5px] font-medium ${
                                probe.data.available ? "text-ink" : "text-danger"
                            }`}
                        >
                            {probe.data.available
                                ? `${Object.keys(probe.data.parameters).length} parameters parsed`
                                : "The executable was rejected"}
                            {probe.data.version === undefined ? "" : ` · ${probe.data.version}`}
                        </p>
                        {probe.data.profile === undefined ? null : (
                            <p className="m-0 mt-1 text-[10.5px] leading-relaxed text-ink-secondary">
                                Detected shipped profile{" "}
                                <span className="font-mono text-ink">{probe.data.profile}</span>.
                                Its table is the starting point for this build.
                            </p>
                        )}
                        <details className="mt-1">
                            <summary className="cursor-pointer text-[10.5px] text-ink-muted">
                                Show probe output
                            </summary>
                            <pre className="mt-2 max-h-56 overflow-auto font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-ink-secondary">
                                {probe.data.detail}
                            </pre>
                        </details>
                    </div>
                ) : null}
                {probe.isError ? (
                    <p role="alert" className="m-0 text-[11.5px] leading-relaxed text-danger">
                        {probe.error instanceof Error
                            ? `The probe failed: ${probe.error.message}`
                            : "The probe failed."}
                    </p>
                ) : null}
                {create.isError ? (
                    <p role="alert" className="m-0 text-[11.5px] leading-relaxed text-danger">
                        {create.error instanceof Error
                            ? `The build could not be saved: ${create.error.message}`
                            : "The build could not be saved."}
                    </p>
                ) : null}
            </div>
        </Sheet>
    );
}
