import { useEffect, useState } from "react";

import { Plus, RotateCcw } from "lucide-react";

import { Button } from "../../shared/Button";
import { NumberField } from "../../shared/NumberField";
import { RemoveButton } from "../../shared/RemoveButton";
import { Sheet } from "../../shared/Sheet";

type Plane = "c_y" | "ccb" | "ccr";

const PLANES: Array<{ key: Plane; label: string; count: number }> = [
    // av1-grain's `NUM_Y_COEFFS` and `NUM_UV_COEFFS`; the encoder rejects any other length.
    { key: "c_y", label: "Luma", count: 24 },
    { key: "ccb", label: "Cb", count: 25 },
    { key: "ccr", label: "Cr", count: 25 },
];

function asCoefficients(value: unknown): number[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is number => typeof entry === "number")
        : [];
}

/**
 * Edits one plane's AR coefficients, one value per row.
 *
 * The count is not a preference: the AV1 grain table requires 24 luma values and 25 per
 * chroma plane, and `av1-grain` rejects any other length. The sheet therefore stages edits
 * and only applies them when every plane is either absent or exactly full.
 */
export function PhotonCoefficientsSheet({
    open,
    value,
    onClose,
    onApply,
}: {
    open: boolean;
    value: Record<string, unknown>;
    onClose: () => void;
    onApply: (next: Partial<Record<Plane, number[] | null>>) => void;
}) {
    const [plane, setPlane] = useState<Plane>("c_y");
    const [draft, setDraft] = useState<Record<Plane, number[]>>({
        c_y: [],
        ccb: [],
        ccr: [],
    });
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        setDraft({
            c_y: asCoefficients(value.c_y),
            ccb: asCoefficients(value.ccb),
            ccr: asCoefficients(value.ccr),
        });
        setError(null);
        setPlane("c_y");
    }, [open, value]);

    const active = PLANES.find((entry) => entry.key === plane) ?? {
        key: "c_y" as const,
        label: "Luma",
        count: 24,
    };
    const values = draft[plane];
    const complete = PLANES.every(
        (entry) => draft[entry.key].length === 0 || draft[entry.key].length === entry.count,
    );
    const invalidPlane = PLANES.find(
        (entry) => draft[entry.key].length !== 0 && draft[entry.key].length !== entry.count,
    );

    const update = (next: number[]) => {
        setDraft((previous) => ({ ...previous, [plane]: next }));
        setError(null);
    };

    return (
        <Sheet
            open={open}
            title="Custom photon coefficients"
            eyebrow="Photon noise"
            description="The AV1 grain table uses 24 luma coefficients and 25 on each chroma plane. A plane left empty is generated from the ISO."
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={!complete}
                        onClick={() => {
                            if (invalidPlane !== undefined) {
                                setError(
                                    `${invalidPlane.label} needs ${String(invalidPlane.count)} values or none.`,
                                );
                                return;
                            }
                            onApply({
                                c_y: draft.c_y.length === 0 ? null : draft.c_y,
                                ccb: draft.ccb.length === 0 ? null : draft.ccb,
                                ccr: draft.ccr.length === 0 ? null : draft.ccr,
                            });
                            onClose();
                        }}
                    >
                        Apply coefficients
                    </Button>
                </>
            }
        >
            <div
                role="tablist"
                aria-label="Coefficient plane"
                className="flex overflow-hidden rounded-md border border-line-strong"
            >
                {PLANES.map((entry) => (
                    <button
                        key={entry.key}
                        type="button"
                        role="tab"
                        aria-selected={entry.key === plane}
                        onClick={() => setPlane(entry.key)}
                        className={`h-8 flex-1 border-r border-line-strong px-2 text-[11px] last:border-r-0 ${
                            entry.key === plane
                                ? "bg-raised font-medium text-ink"
                                : "bg-app text-ink-muted hover:text-ink"
                        }`}
                    >
                        {entry.label}
                        <span className="ml-1.5 font-mono text-[9px] text-ink-muted">
                            {draft[entry.key].length}/{entry.count}
                        </span>
                    </button>
                ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
                <p className="m-0 text-[10.5px] leading-relaxed text-ink-muted">
                    {values.length === 0
                        ? `Empty uses the ISO-derived ${active.label.toLowerCase()} coefficients.`
                        : `${String(values.length)} of ${String(active.count)} values.`}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                    <Button
                        variant="ghost"
                        className="h-7 px-2 text-[10.5px]"
                        onClick={() => update([])}
                        disabled={values.length === 0}
                    >
                        <RotateCcw aria-hidden="true" className="h-3 w-3" />
                        From ISO
                    </Button>
                    <Button
                        variant="secondary"
                        className="h-7 px-2 text-[10.5px]"
                        disabled={values.length >= active.count}
                        onClick={() =>
                            update(
                                values.length === 0
                                    ? Array.from({ length: active.count }, () => 0)
                                    : [...values, 0],
                            )
                        }
                    >
                        <Plus aria-hidden="true" className="h-3 w-3" />
                        {values.length === 0 ? "Customise" : "Add"}
                    </Button>
                </div>
            </div>

            {values.length === 0 ? (
                <p className="mt-4 rounded-md border border-dashed border-line px-3 py-6 text-center text-[11px] text-ink-muted">
                    This plane follows the ISO.
                </p>
            ) : (
                <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-3">
                    {values.map((coefficient, index) => (
                        <li key={index} className="flex min-w-0 items-center gap-1">
                            <span className="w-5 shrink-0 text-right font-mono text-[9px] text-ink-muted">
                                {index + 1}
                            </span>
                            <NumberField
                                label={`${active.label} coefficient ${String(index + 1)}`}
                                value={coefficient}
                                min={-128}
                                max={127}
                                integer
                                onChange={(next) => {
                                    const updated = [...values];
                                    updated[index] = Math.min(127, Math.max(-128, next));
                                    update(updated);
                                }}
                                className="min-w-0 flex-1"
                            />
                            <RemoveButton
                                target={`${active.label} coefficient ${String(index + 1)}`}
                                onClick={() => update(values.filter((_, at) => at !== index))}
                            />
                        </li>
                    ))}
                </ul>
            )}

            {error === null ? null : (
                <p role="alert" className="mt-3 mb-0 text-[11px] text-danger">
                    {error}
                </p>
            )}
            {complete ? null : (
                <p className="mt-3 mb-0 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-[10.5px] leading-relaxed text-warning">
                    Apply is disabled until every edited plane has its full count. Remove the plane
                    back to empty to use the ISO instead.
                </p>
            )}
        </Sheet>
    );
}
