import { Button } from "../../shared/Button";

export function ProjectScreenSkeleton() {
    return (
        <main id="main" aria-busy="true" className="page py-6 sm:py-8">
            {/* The skeleton uses the real grid geometry, so the page does not reflow
                when the project arrives: no rail column, three cards across at xl. */}
            <div className="h-2.5 w-36 animate-pulse rounded-sm bg-raised" />
            <div className="mt-3 h-7 w-64 animate-pulse rounded-sm bg-raised" />
            <div className="mt-3 h-3 w-96 max-w-full animate-pulse rounded-sm bg-raised" />
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2, 3, 4, 5, 6].map((card) => (
                    <div
                        key={card}
                        className="h-[132px] animate-pulse rounded-lg border border-line bg-surface"
                    />
                ))}
            </div>
            <div className="mt-6 h-[296px] animate-pulse rounded-lg border border-line bg-surface" />
        </main>
    );
}

export function ProjectScreenError({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <main id="main" className="mx-auto w-full max-w-[720px] px-6 py-16">
            <div className="rounded-lg border border-danger/30 bg-surface p-6" role="alert">
                <h1 className="m-0 text-xl font-semibold text-ink">
                    This project could not be opened
                </h1>
                <p className="mt-2 mb-4 text-[13px] leading-relaxed text-ink-secondary">
                    {message}
                </p>
                <Button variant="secondary" onClick={onRetry}>
                    Retry
                </Button>
            </div>
        </main>
    );
}
