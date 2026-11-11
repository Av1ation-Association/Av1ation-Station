/** The service's unambiguous shortcode alphabet: no 0/O or 1/I confusion. */
export const SHORTCODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Normalize a typed pairing code, or return `null` when the value cannot be a code.
 *
 * Keys and spaces are harmless while typing, so `abcd-efgh` and `ABCD EFGH` are accepted.
 * A value that is not exactly eight symbols is left alone: it may be a bearer token or a
 * full pairing link, which the form handles separately.
 */
export function pairingCode(value: string): string | null {
    const compact = value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
    if (compact.length !== 8) {
        return null;
    }
    return [...compact].every((character) => SHORTCODE_ALPHABET.includes(character))
        ? compact
        : null;
}
