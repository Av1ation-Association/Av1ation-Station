import { Skeleton } from "./Skeleton";

/**
 * The pending state for a route whose lazy chunk carries Monaco.
 *
 * The editor is the largest dependency in the application, so a direct visit used to hold
 * the previous screen until the chunk arrived. This reserves the editor's real height and
 * leaves the shell's navigation responsive while the module loads. The text is announced;
 * the bars are decorative.
 */
export function MonacoRouteSkeleton({ side = false }: { side?: boolean }) {
    return (
        <main id="main" className="page py-5" aria-busy="true">
            <p role="status" className="sr-only">
                Loading the editor…
            </p>
            <div className="border-b border-line pb-3">
                <Skeleton className="h-6 w-56" />
                <Skeleton className="mt-2 h-3 w-full max-w-[76ch]" />
            </div>
            <div className={side ? "mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]" : "mt-4"}>
                <Skeleton className="h-[440px] rounded-lg sm:h-[520px]" />
                {side ? (
                    <div className="space-y-4">
                        <Skeleton className="h-40 rounded-lg" />
                        <Skeleton className="h-56 rounded-lg" />
                    </div>
                ) : null}
            </div>
        </main>
    );
}
