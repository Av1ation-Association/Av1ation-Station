/**
 * The way back, drawn with the station's own mark.
 *
 * A generic arrow would be a second piece of icon language in a bar that already has one, so
 * the way back is the brand mark turned around. Mirrored it points left; its contrails are
 * separate bars in `BackControl`, because they have to stretch under the label rather than
 * live inside a fixed box.
 */
export function BackMark({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 153 180"
            fill="none"
            aria-hidden="true"
            focusable="false"
            className={className}
        >
            <g transform="translate(153 0) scale(-1 1)">
                <path
                    fill="currentColor"
                    fillRule="evenodd"
                    d="M153 90 0 0 41.9178 54.4187 6.2877 71.1628 31.4384 90 6.2877 108.8372 41.9178 125.5813 0 180ZM127.8493 90 117.3699 97.3257 108.9863 90 117.3699 82.6743Z"
                />
            </g>
        </svg>
    );
}
