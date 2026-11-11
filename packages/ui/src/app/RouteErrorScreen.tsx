import { Link, type ErrorComponentProps } from "@tanstack/react-router";

/** Rendered when a route's guard, loader, or lazy chunk fails before the screen mounts. */
export function RouteErrorScreen({ error, reset }: ErrorComponentProps) {
    return (
        <main id="main" className="mx-auto w-full max-w-[720px] px-6 py-16">
            <div className="rounded-lg border border-danger/30 bg-surface p-6" role="alert">
                <h1 className="m-0 text-xl font-semibold tracking-tight text-ink">
                    This screen could not be opened
                </h1>
                <p className="mt-2 mb-0 text-[13px] leading-relaxed text-ink-secondary">
                    The route failed before it rendered. Retrying re-runs the guard; if it keeps
                    failing, the service may be unavailable and its log carries the cause.
                </p>
                <p className="mt-3 mb-0 break-words font-mono text-[12px] leading-relaxed text-ink-muted">
                    {error instanceof Error ? error.message : String(error)}
                </p>
                <div className="mt-5 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => reset?.()}
                        className="inline-flex h-9 items-center rounded-md bg-brand px-3 text-sm font-medium text-on-brand transition-colors duration-150 hover:bg-brand-hover"
                    >
                        Try again
                    </button>
                    <Link to="/" className="text-[13px] text-link hover:underline">
                        Back to Projects
                    </Link>
                </div>
            </div>
        </main>
    );
}
