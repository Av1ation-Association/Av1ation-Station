import { useEffect, useState } from "react";

import { usePickDirectory, usePickFile } from "@av1ation/api";
import type { ParameterDescriptor, TextFormat } from "@av1ation/contracts";
import { FolderOpen } from "lucide-react";

import { readOption } from "./encoder-options";
import { isSwitchNumber } from "./parameter-summary";
import { Switch } from "../../shared/Switch";

/** The one text field style; every parameter widget and the encoder form share it. */
export const FIELD =
    "h-8 min-w-0 rounded-md border border-line-strong bg-transparent px-2 font-mono text-[10.5px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:opacity-50";

/**
 * A numeric field that keeps the user's text while it is being typed.
 *
 * Committing `Number("")` on the keystroke that clears the field wrote zero into the
 * document, which then replaced itself in the input. The stored value changes only when the
 * text parses; clearing and leaving restores the value that was there.
 */
function TypingNumber({
    label,
    value,
    min,
    max,
    step,
    integer,
    disabled,
    onChange,
    slider = false,
}: {
    label: string;
    value: string | number | boolean;
    min: number | undefined;
    max: number | undefined;
    step: number | "any" | undefined;
    integer: boolean;
    disabled: boolean;
    onChange: (next: number) => void;
    slider?: boolean;
}) {
    const numeric = typeof value === "number" ? value : Number(value);
    const [text, setText] = useState(
        typeof value === "number" || typeof value === "string" ? String(value) : "",
    );
    useEffect(() => {
        setText(typeof value === "number" || typeof value === "string" ? String(value) : "");
    }, [value]);

    const commit = (raw: string) => {
        setText(raw);
        if (raw.trim() === "") {
            return;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
            return;
        }
        onChange(integer ? Math.trunc(parsed) : parsed);
    };

    return (
        <div className="flex min-w-0 items-center gap-1.5">
            {slider && min !== undefined && max !== undefined ? (
                <input
                    type="range"
                    aria-label={`${label} slider`}
                    min={min}
                    max={max}
                    step={step ?? 1}
                    value={Number.isFinite(numeric) ? numeric : min}
                    disabled={disabled}
                    onChange={(event) => commit(event.target.value)}
                    className="h-1.5 min-w-0 flex-1 accent-[var(--brand-default)]"
                />
            ) : null}
            <input
                type="text"
                inputMode={integer ? "numeric" : "decimal"}
                aria-label={label}
                value={text}
                disabled={disabled}
                onChange={(event) => commit(event.target.value)}
                onBlur={() => {
                    if (text.trim() === "" || !Number.isFinite(Number(text))) {
                        setText(
                            typeof value === "number" || typeof value === "string"
                                ? String(value)
                                : "",
                        );
                    }
                }}
                className={`${FIELD} ${slider ? "w-[68px] shrink-0 text-right" : "w-full"}`}
            />
        </div>
    );
}

/** The first user-facing problem with a text value, or `null` when it is acceptable. */
function textIssue(format: TextFormat | null | undefined, value: string): string | null {
    if (format === null || format === undefined || value.trim() === "") {
        return null;
    }
    if (format === "Email") {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim())
            ? null
            : "Enter an email address such as name@example.com.";
    }
    if (format === "Url") {
        try {
            new URL(value.trim());
            return null;
        } catch {
            return "Enter a full URL, including its scheme.";
        }
    }
    if (format === "DateTime") {
        const iso =
            /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u;
        return iso.test(value.trim()) && !Number.isNaN(Date.parse(value.trim()))
            ? null
            : "Use an ISO-8601 date or date-time, such as 2026-11-01T18:30:00Z.";
    }
    return null;
}

/** The control one parameter's kind calls for. Shared with the Target-quality probe options. */
export function ParameterControl({
    descriptor,
    parameter,
    onChange,
    disabled,
}: {
    descriptor: ParameterDescriptor | undefined;
    parameter: unknown;
    onChange: (next: string | number | boolean) => void;
    disabled: boolean;
}) {
    const current = readOption(parameter);
    const value = current?.value ?? "";
    const pickFile = usePickFile();
    const pickDirectory = usePickDirectory();
    const [browseError, setBrowseError] = useState<string | null>(null);

    if (descriptor?.kind === "Flag" || current?.kind === "Bool") {
        const on = value === true;
        return (
            <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={descriptor?.label ?? "Flag"}
                disabled={disabled}
                onClick={() => onChange(!on)}
                className={`h-7 shrink-0 rounded-md border px-2.5 text-[10.5px] transition-colors duration-150 disabled:opacity-50 ${
                    on
                        ? "border-brand bg-brand-soft text-brand-text"
                        : "border-line-strong bg-sunken text-ink-muted hover:text-ink"
                }`}
            >
                {on ? "On" : "Off"}
            </button>
        );
    }

    if (descriptor !== undefined && "Path" in descriptor.kind) {
        const spec = descriptor.kind.Path;
        const browse = async () => {
            setBrowseError(null);
            try {
                const selected = spec.directory
                    ? await pickDirectory?.()
                    : await pickFile?.({
                          ...(spec.accept.length === 0 ? {} : { extensions: spec.accept }),
                          title: `Choose ${descriptor.label}`,
                      });
                if (selected !== null && selected !== undefined) {
                    onChange(selected);
                }
            } catch (error) {
                setBrowseError(
                    error instanceof Error ? error.message : "The file picker could not open.",
                );
            }
        };
        const canBrowse = spec.directory ? pickDirectory !== null : pickFile !== null;
        return (
            <div className="min-w-0">
                <div className="relative">
                    <input
                        aria-label={descriptor.label}
                        value={String(value)}
                        disabled={disabled}
                        onChange={(event) => onChange(event.target.value)}
                        spellCheck={false}
                        className={`${FIELD} w-full font-mono ${canBrowse ? "pr-20" : ""}`}
                    />
                    {canBrowse ? (
                        <button
                            type="button"
                            aria-label={`Browse for ${descriptor.label}`}
                            disabled={disabled}
                            onClick={() => void browse()}
                            className="absolute inset-y-0 right-1 my-auto inline-flex h-6 items-center gap-1 rounded bg-raised px-1.5 text-[10px] text-ink-secondary transition-colors duration-150 hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-50"
                        >
                            <FolderOpen aria-hidden="true" className="h-3 w-3" />
                            Browse
                        </button>
                    ) : null}
                </div>
                {browseError === null ? null : (
                    <p role="alert" className="mt-1 mb-0 text-[10px] leading-relaxed text-danger">
                        {browseError}
                    </p>
                )}
            </div>
        );
    }

    if (descriptor !== undefined && "Choice" in descriptor.kind) {
        const options = descriptor.kind.Choice.options as Array<{
            label: string;
            value: string | number | boolean | null;
            description?: string | null;
        }>;
        const known = options.some((option) => String(option.value) === String(value));
        const selectedOption = options.find((option) => String(option.value) === String(value));
        const widget = descriptor.widget;
        const presentation =
            typeof widget === "object" && "ChoiceInput" in widget
                ? widget.ChoiceInput.presentation
                : "Auto";
        // `Auto` is the documented rule: radio or segmented up to four options, a dropdown
        // above. A descriptor that names its presentation keeps it. A stored value the
        // catalogue no longer offers keeps the dropdown so it is not silently replaced.
        const segmented = presentation === "Segmented";
        const radios =
            known &&
            (presentation === "Radio" ||
                segmented ||
                (presentation === "Auto" && options.length <= 4));
        if (radios) {
            return (
                <div className="min-w-0">
                    <div
                        role="radiogroup"
                        aria-label={descriptor.label}
                        className={segmented ? "flex flex-wrap" : "flex flex-wrap gap-1"}
                    >
                        {options.map((option) => {
                            const selected = String(option.value) === String(value);
                            return (
                                <button
                                    key={String(option.value)}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    title={option.description ?? undefined}
                                    disabled={disabled}
                                    onClick={() => {
                                        if (
                                            typeof option.value === "string" ||
                                            typeof option.value === "number" ||
                                            typeof option.value === "boolean"
                                        ) {
                                            onChange(option.value);
                                        }
                                    }}
                                    className={`h-7 min-w-0 truncate border px-2 text-[10.5px] transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 ${
                                        segmented
                                            ? "-ml-px rounded-none first:ml-0 first:rounded-l-md last:rounded-r-md"
                                            : "rounded-md"
                                    } ${
                                        selected
                                            ? "border-brand bg-brand-soft font-medium text-brand-text"
                                            : "border-line-strong bg-sunken text-ink-muted hover:text-ink"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                    {selectedOption?.description ? (
                        <p className="mt-1 mb-0 text-[10px] leading-relaxed text-ink-muted">
                            {selectedOption.description}
                        </p>
                    ) : null}
                </div>
            );
        }
        return (
            <div className="min-w-0">
                <select
                    aria-label={descriptor.label}
                    value={String(value)}
                    disabled={disabled}
                    onChange={(event) => {
                        const chosen = options.find(
                            (option) => String(option.value) === event.target.value,
                        );
                        if (
                            chosen !== undefined &&
                            (typeof chosen.value === "string" ||
                                typeof chosen.value === "number" ||
                                typeof chosen.value === "boolean")
                        ) {
                            onChange(chosen.value);
                        }
                    }}
                    className={`${FIELD} w-full`}
                >
                    {known ? null : <option value={String(value)}>{String(value)}</option>}
                    {options.map((option) => (
                        <option key={String(option.value)} value={String(option.value)}>
                            {option.label}
                        </option>
                    ))}
                </select>
                {selectedOption?.description ? (
                    <p className="mt-1 mb-0 text-[10px] leading-relaxed text-ink-muted">
                        {selectedOption.description}
                    </p>
                ) : null}
            </div>
        );
    }

    if (descriptor !== undefined && "Text" in descriptor.kind) {
        const format = descriptor.kind.Text.format;
        const issue = textIssue(format, String(value));
        return (
            <div className="min-w-0">
                <input
                    aria-label={descriptor.label}
                    type={format === "Email" ? "email" : format === "Url" ? "url" : "text"}
                    value={String(value)}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.value)}
                    aria-invalid={issue === null ? undefined : true}
                    spellCheck={false}
                    placeholder={
                        format === "Email"
                            ? "name@example.com"
                            : format === "Url"
                              ? "https://example.com"
                              : format === "DateTime"
                                ? "2026-11-01T18:30:00Z"
                                : undefined
                    }
                    className={`${FIELD} w-full ${issue === null ? "" : "border-danger"}`}
                />
                {issue === null ? null : (
                    <p role="alert" className="mt-1 mb-0 text-[10px] leading-relaxed text-danger">
                        {issue}
                    </p>
                )}
            </div>
        );
    }

    // A value stored as text stays text even when the descriptor is numeric, so a spelling
    // like x264's `infinite` is never replaced by whatever `Number("infinite")` returns.
    if (
        current?.kind === "Number" ||
        (current?.kind !== "String" && descriptor !== undefined && "Number" in descriptor.kind)
    ) {
        const spec =
            descriptor !== undefined && "Number" in descriptor.kind ? descriptor.kind.Number : null;
        const min = spec?.min ?? undefined;
        const max = spec?.max ?? undefined;
        // Encoders that put a boolean behind a value are switches, not ranges. The literal is
        // kept beside the switch because the option is sent as `0` or `1`, and a reader of the
        // command preview should not have to translate the thumb position.
        if (isSwitchNumber(descriptor)) {
            const on = Number(value) === 1;
            return (
                <div className="flex min-w-0 items-center gap-2">
                    <Switch
                        checked={on}
                        disabled={disabled}
                        label={descriptor?.label ?? "Value"}
                        onChange={(next) => onChange(next ? 1 : 0)}
                    />
                    <span aria-hidden="true" className="font-mono text-[10px] text-ink-muted">
                        {on ? "1" : "0"}
                    </span>
                </div>
            );
        }
        // A bounded, short scale reads better as a slider. Long ranges (bitrate, keyframes)
        // stay a plain field so a one-pixel drag is not a thousand units.
        const slider =
            min !== undefined &&
            max !== undefined &&
            max > min &&
            max - min <= 100 &&
            spec?.integer !== false;
        const label = descriptor?.label ?? "Value";
        // A unit is part of the value, not decoration: a bare `12` beside `--frames` and
        // `--seconds` is the same control reading as two different parameters. The suffix is
        // hidden from assistive tech and carried in the field's name instead, so the value
        // is not announced twice.
        const unit = spec?.unit?.trim() ?? "";
        const field = (
            <TypingNumber
                label={unit === "" ? label : `${label} (${unit})`}
                value={value}
                min={min}
                max={max}
                step={spec?.step ?? (spec?.integer === false ? "any" : 1)}
                integer={spec?.integer !== false}
                disabled={disabled}
                slider={slider}
                onChange={onChange}
            />
        );
        if (unit === "") {
            return field;
        }
        return (
            <div className="flex min-w-0 items-center gap-1.5">
                <div className="min-w-0 flex-1">{field}</div>
                <span aria-hidden="true" className="shrink-0 font-mono text-[9.5px] text-ink-muted">
                    {unit}
                </span>
            </div>
        );
    }

    return (
        <input
            type="text"
            aria-label={descriptor?.label ?? "Value"}
            value={String(value)}
            spellCheck={false}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className={`${FIELD} w-full`}
        />
    );
}
