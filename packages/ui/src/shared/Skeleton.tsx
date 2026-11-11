/**
 * One pulse placeholder. Every loading surface composes these instead of carrying its own
 * `animate-pulse` block, so the reduced-motion rule and radius stay in one place.
 */
export function Skeleton({ className = "" }: { className?: string }) {
    return (
        <div
            aria-hidden="true"
            className={`animate-pulse rounded-sm bg-raised motion-reduce:animate-none ${className}`}
        />
    );
}
