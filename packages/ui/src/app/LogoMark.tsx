/**
 * The approved blended-wing play mark from Foundations / Logo.
 *
 * The 153 × 180 coordinate box is the board's 73:86 planform, so the mark must
 * be scaled proportionally and never stretched to a square.
 */
export function LogoMark({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 153 180"
            fill="none"
            aria-hidden="true"
            className={className}
            focusable="false"
        >
            <path
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M153 90 0 0 41.9178 54.4187 6.2877 71.1628 31.4384 90 6.2877 108.8372 41.9178 125.5813 0 180ZM127.8493 90 117.3699 97.3257 108.9863 90 117.3699 82.6743Z"
            />
        </svg>
    );
}
