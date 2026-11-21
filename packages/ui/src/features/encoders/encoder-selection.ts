import type { EncoderDescriptor, ParameterDescriptor } from "@av1ation/contracts";

import {
    ENCODER_CHOICES,
    forkMarker,
    forkVariant,
    hasForkMarker,
    isForkMarker,
    record,
    sameBuildPath,
    selectedBody,
    withRequiredFields,
} from "./encoder-document";
import { mergeDescriptor } from "./encoder-options";

/** The warning the encoder row shows when the selected build cannot run itself. */
export interface EncoderForkWarning {
    title: string;
    body: string;
}

/** One encoder document resolved against the catalogue. */
export interface EncoderSelection {
    variant: string | null;
    body: Record<string, unknown>;
    options: Record<string, unknown>;
    visibleOptions: Array<[string, unknown]>;
    choice: (typeof ENCODER_CHOICES)[number] | undefined;
    forks: EncoderDescriptor[];
    selectedFork: EncoderDescriptor | undefined;
    marker: string | null;
    missingFork: boolean;
    descriptors: EncoderDescriptor | undefined;
    catalogue: Map<string, ParameterDescriptor>;
    buildLabel: string;
    forkWarning: EncoderForkWarning | null;
    executable: string | null;
    available: boolean;
}

/** The built-in catalogue row a base encoder's variant reads its parameters from. */
function builtInFor(
    encoders: readonly EncoderDescriptor[] | undefined,
    base: string | undefined,
): EncoderDescriptor | undefined {
    return (encoders ?? []).find(
        (entry) => !entry.fork && (entry.id === base || entry.base === base),
    );
}

/**
 * Resolve which encoder and build one document selects, and the catalogue its parameters use.
 *
 * The document is the source of truth: a marker names a saved build that has no executable
 * yet, while a located build is matched by the path the document runs. The catalogue is the
 * base row with the build's own rows merged over it, so a build's extra flags and changed
 * descriptions are visible without losing the base's labels.
 */
export function resolveEncoderSelection(
    encoders: readonly EncoderDescriptor[] | undefined,
    loaded: boolean,
    value: unknown,
): EncoderSelection {
    const { variant, body } = selectedBody(value);
    const choice = ENCODER_CHOICES.find((entry) => entry.variant === variant);
    const forks = (encoders ?? []).filter((entry) => entry.fork && forkVariant(entry) !== null);
    const executable = typeof body.executable === "string" ? body.executable : null;
    const options = record(body.options);
    const visibleOptions = Object.entries(options).filter(
        ([name, parameter]) => !isForkMarker(name, parameter),
    );
    const selectedFork =
        forks.find((entry) => forkVariant(entry) === variant && hasForkMarker(options, entry.id)) ??
        forks.find(
            (entry) =>
                forkVariant(entry) === variant && sameBuildPath(entry.executable, executable),
        );
    // A marker can outlive the saved row it names. The document still selects a build, so
    // the screen has to say that the build is gone rather than silently showing its base.
    // That claim needs a loaded catalogue: absent data is not evidence of a deletion.
    const marker = forkMarker(options);
    const missingFork = marker !== null && loaded && selectedFork === undefined;
    const base = selectedFork?.base ?? choice?.base;
    const builtIn = builtInFor(encoders, base);
    const descriptors = selectedFork ?? builtIn;
    // A build reports the flags its own binary accepts, which may include ones the base
    // catalogue does not know. The base's descriptions still label the flags both share.
    const catalogue = new Map(Object.entries(builtIn?.parameters ?? {}));
    for (const [canonical, descriptor] of Object.entries(selectedFork?.parameters ?? {})) {
        catalogue.set(
            canonical,
            mergeDescriptor(catalogue.get(canonical), descriptor) ?? descriptor,
        );
    }
    const buildLabel = selectedFork?.label ?? choice?.label ?? base ?? "this encoder";
    const forkWarning = missingFork
        ? {
              title: "The build this project selected is no longer saved.",
              body: "Runs fall back to the base encoder's provider on PATH. Choose an encoder to clear the old selection.",
          }
        : selectedFork !== undefined && !selectedFork.executable
          ? {
                title: `${selectedFork.label} has no executable yet.`,
                body: "Runs fall back to the base encoder's provider on PATH, so this build's flags may not apply.",
            }
          : selectedFork !== undefined && !selectedFork.available
            ? {
                  title: `${selectedFork.label} is not at its saved path.`,
                  body: "Runs fall back to the base encoder's provider on PATH until the build is located again.",
              }
            : null;
    return {
        variant,
        body,
        options,
        visibleOptions,
        choice,
        forks,
        selectedFork,
        marker,
        missingFork,
        descriptors,
        catalogue,
        buildLabel,
        forkWarning,
        executable,
        available: descriptors?.available === true,
    };
}

/**
 * The engine document a built-in encoder starts from.
 *
 * The catalogue's default is the complete starting body; switching to a different encoder
 * must never carry the previous build's executable. Fields the new variant requires are
 * seeded here so the first save is already a valid document.
 */
export function encoderChoiceDocument(
    entry: (typeof ENCODER_CHOICES)[number],
    encoders: readonly EncoderDescriptor[] | undefined,
): Record<string, unknown> {
    const defaults = record(builtInFor(encoders, entry.base)?.default)[entry.variant];
    const next = withRequiredFields(entry.variant, { ...record(defaults), executable: null });
    next.options = record(next.options);
    return next;
}
