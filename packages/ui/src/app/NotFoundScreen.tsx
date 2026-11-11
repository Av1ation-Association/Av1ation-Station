import { Link } from "@tanstack/react-router";

/** A typed route table still has unmatched URLs: a reload or a stale link must land here. */
export function NotFoundScreen() {
    return (
        <main id="main" className="mx-auto w-full max-w-[720px] px-6 py-16">
            <p className="m-0 font-mono text-[11px] tracking-[0.2em] text-ink-muted uppercase">
                404
            </p>
            <h1 className="mt-3 mb-0 text-2xl font-semibold tracking-tight text-ink">
                This screen does not exist
            </h1>
            <p className="mt-2 mb-0 text-[13px] leading-relaxed text-ink-secondary">
                The address may be stale, or the screen may arrive in a later increment. Projects,
                the configuration sections, and Settings remain reachable from here.
            </p>
            <Link
                to="/"
                className="mt-6 inline-flex h-9 items-center rounded-md bg-brand px-3 text-sm font-medium text-on-brand transition-colors duration-150 hover:bg-brand-hover"
            >
                Back to Projects
            </Link>
        </main>
    );
}
