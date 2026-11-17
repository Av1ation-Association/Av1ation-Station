import { delimiterLabel } from "./delimiter-label";

/**
 * The CLI separator for one descriptor.
 *
 * A joined delimiter is a real character, not a name the user has to translate; the
 * visible glyph and the name stay together, and the whole control has one accessible
 * label. The stored descriptor is never changed by this display.
 */
export function DelimiterReadout({ delimiter }: { delimiter: unknown }) {
    const label = delimiterLabel(delimiter);
    if (label === null) {
        return null;
    }
    return (
        <span
            role="img"
            aria-label={label.accessibleName}
            data-tip={label.hint}
            className="inline-flex min-w-0 items-baseline gap-1 font-mono text-[9.5px] text-ink-secondary"
        >
            <span aria-hidden="true" className="text-[11px] leading-none">
                {label.glyph}
            </span>
            <span aria-hidden="true">{label.name}</span>
        </span>
    );
}
