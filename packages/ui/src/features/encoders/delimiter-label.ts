/**
 * A descriptor's CLI separator, described by the character rather than its enum name.
 *
 * The contract stores `Delimiter::Space` as a name and a joined delimiter as its actual
 * string. That is the right storage shape, but reading "Space" beside a command form is
 * ambiguous: the reader cannot tell a space from a tab without counting pixels. The label
 * keeps the visible glyph and the accessible name together, while `readDelimiter` leaves
 * the stored value untouched for the engine.
 */
export type DelimiterValue = "Space" | { Joined: string };

export type DelimiterLabel = {
    /** The visible character, such as `␠`, `⇥`, or `=`. */
    glyph: string;
    /** The human name, such as `Space` or `Equals`. */
    name: string;
    /** How the separator shapes argv, for the readout's secondary line. */
    hint: string;
    /** The whole description, used as the readout's accessible name. */
    accessibleName: string;
};

const CHARACTERS: Record<string, { glyph: string; name: string }> = {
    " ": { glyph: "␠", name: "Space" },
    "\t": { glyph: "⇥", name: "Tab" },
    "\n": { glyph: "⏎", name: "Return" },
    "\r": { glyph: "␍", name: "Carriage return" },
    "=": { glyph: "=", name: "Equals" },
    ":": { glyph: ":", name: "Colon" },
    ",": { glyph: ",", name: "Comma" },
    ";": { glyph: ";", name: "Semicolon" },
    "|": { glyph: "|", name: "Pipe" },
};

function joinedLabel(value: string): DelimiterLabel {
    const named =
        value === ""
            ? { glyph: "∅", name: "Empty separator" }
            : (CHARACTERS[value] ?? {
                  glyph: value,
                  name: `Character ${JSON.stringify(value)}`,
              });
    return {
        glyph: named.glyph,
        name: named.name,
        hint: "one argv entry",
        accessibleName: `${named.name} separator, one argument`,
    };
}

/** The stored delimiter, narrowed without changing how it is sent to the engine. */
export function readDelimiter(value: unknown): DelimiterValue | null {
    if (value === "Space") {
        return "Space";
    }
    if (
        typeof value === "object" &&
        value !== null &&
        "Joined" in value &&
        typeof value.Joined === "string"
    ) {
        return { Joined: value.Joined };
    }
    return null;
}

/** The visible and accessible description of a descriptor's separator. */
export function delimiterLabel(value: unknown): DelimiterLabel | null {
    const delimiter = readDelimiter(value);
    if (delimiter === null) {
        return null;
    }
    if (delimiter === "Space") {
        return {
            glyph: "␠",
            name: "Space",
            hint: "two argv entries",
            accessibleName: "Space separator, two arguments",
        };
    }
    return joinedLabel(delimiter.Joined);
}
