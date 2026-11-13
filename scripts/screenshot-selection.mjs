// Select the screens a feature-notes run writes to its release manifest.
//
// The capture always builds the complete gallery. A feature run narrows only the
// `feature-screenshots.json` input for `release:manifest`, so docs and the website keep the
// full catalog while release notes carry only the feature being described.

const FEATURE_NOTES_FLAG = "--feature-notes";
const USAGE = 'usage: npm run screenshots:features -- "<feature group or screen id>"';

/**
 * Parse the flags shared by the capture orchestrator and its publisher.
 *
 * A feature run must name exactly one selector. This is deliberately stricter than a
 * default set: release notes should never silently fall back to a generic gallery.
 */
export function parseFeatureArguments(args) {
    const featureNotes = args.includes(FEATURE_NOTES_FLAG);
    const selectors = args.filter((arg) => arg !== FEATURE_NOTES_FLAG && arg !== "--");
    const unknown = selectors.filter((arg) => arg.startsWith("--"));
    if (unknown.length > 0) {
        throw new Error(`unknown screenshot option ${JSON.stringify(unknown[0])}; ${USAGE}`);
    }
    if (!featureNotes && selectors.length > 0) {
        throw new Error(`a feature selector requires ${FEATURE_NOTES_FLAG}; ${USAGE}`);
    }
    if (featureNotes && selectors.length !== 1) {
        throw new Error(`a feature run needs exactly one feature group or screen id; ${USAGE}`);
    }
    return { featureNotes, selector: selectors[0] };
}

/**
 * Resolve a feature group name or screen id against the published catalog.
 *
 * Exact ids beat exact group names, so `scenes` selects the Scenes screen while `Scenes`
 * selects the five-screen Scenes group. Case-insensitive matching is a convenience after
 * both exact forms, with the id still winning a case-insensitive collision.
 */
export function resolveFeatureSelection(screens, selector) {
    const value = selector.trim();
    if (value === "") {
        throw new Error(`a feature run needs a non-empty selector; ${USAGE}`);
    }
    const features = [...new Set(screens.map((screen) => screen.feature))];
    const byIdExact = screens.filter((screen) => screen.id === value);
    const byFeatureExact = screens.filter((screen) => screen.feature === value);
    const lower = value.toLowerCase();
    const byIdFolded = screens.filter((screen) => screen.id.toLowerCase() === lower);
    const byFeatureFolded = screens.filter((screen) => screen.feature.toLowerCase() === lower);

    const candidates = [
        { kind: "screen", matches: byIdExact },
        { kind: "feature", matches: byFeatureExact },
        { kind: "screen", matches: byIdFolded },
        { kind: "feature", matches: byFeatureFolded },
    ];
    const selected = candidates.find((candidate) => candidate.matches.length > 0);
    if (selected === undefined) {
        throw new Error(
            `no screenshot feature group or screen id matches ${JSON.stringify(value)}.\n` +
                `Feature groups: ${features.join(", ")}.\n` +
                `Screen ids: ${screens.map((screen) => screen.id).join(", ")}.`,
        );
    }

    const first = selected.matches[0];
    return {
        kind: selected.kind,
        value: selected.kind === "feature" ? first.feature : first.id,
        screens: selected.matches,
    };
}
