import { getIn } from "../../shared/schema/config-schema";
import { sameValue } from "../../shared/structural-equality";
import type { SectionDefinition } from "../../shared/model/section-definitions";

export { sameValue };

/**
 * The one path a video override addresses for a section part.
 *
 * A video replaces a whole sequence document, not leaves inside it: choosing a different
 * encoder variant has to replace the variant, or the project's variant stays beside it and
 * the engine receives two encoders. The server accepts exactly these roots.
 */
export function overridePathOf(partKey: string): string {
    return partKey === "encoder" ? "encoder" : `sequences.${partKey}`;
}

/**
 * The draft for one section, preserving an absent or disabled part exactly.
 *
 * `buildDraft` fills an optional part that the document carries as `null` with `{}`, which
 * would make a reset look like an enabled sequence with empty fields. Inheriting a disabled
 * section has to stay disabled, so the value is copied as it is and a missing optional part
 * stays missing.
 */
export function sectionDraft(
    definition: SectionDefinition,
    document: Record<string, unknown>,
): Record<string, unknown> {
    const sequences = isRecord(document.sequences) ? document.sequences : {};
    const draft: Record<string, unknown> = {};
    for (const part of definition.parts) {
        if (part.key === "encoder") {
            draft.encoder = document.encoder ?? null;
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(sequences, part.key)) {
            draft[part.key] = sequences[part.key];
        } else if (!part.optional) {
            draft[part.key] = {};
        }
    }
    return draft;
}

/** The override paths this section owns, in the order the section renders its parts. */
export function sectionOverridePaths(definition: SectionDefinition): string[] {
    return definition.parts.map((part) => overridePathOf(part.key));
}

/** How many of this section's parts the video currently replaces. */
export function sectionOverrideCount(
    fields: Record<string, unknown>,
    definition: SectionDefinition,
): number {
    return sectionOverridePaths(definition).filter((path) =>
        Object.prototype.hasOwnProperty.call(fields, path),
    ).length;
}

/**
 * The overrides after saving one section.
 *
 * A part that now equals the project's own document stops being an override, so the video
 * inherits it again; every other part is written whole. Parts outside the section are kept
 * exactly as they were, which is why the caller passes the raw map rather than rebuilding
 * it from the effective configuration.
 */
export function mergeSectionOverrides(
    fields: Record<string, unknown>,
    definition: SectionDefinition,
    base: Record<string, unknown>,
    next: Record<string, unknown>,
): Record<string, unknown> {
    const merged = { ...fields };
    for (const part of definition.parts) {
        const path = overridePathOf(part.key);
        const after = getIn(next, path.split("."));
        const before = getIn(base, path.split("."));
        if (after === undefined || sameValue(after, before)) {
            delete merged[path];
        } else {
            merged[path] = after;
        }
    }
    return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
