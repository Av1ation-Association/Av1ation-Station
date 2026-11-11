import { Skeleton } from "../../shared/Skeleton";

export function QueueSkeleton() {
    return (
        <ul
            aria-busy="true"
            aria-label="Loading the queue"
            className="m-0 list-none divide-y divide-line p-0"
        >
            {[0, 1, 2].map((row) => (
                <li
                    key={row}
                    className="grid grid-cols-[20px_20px_minmax(0,1fr)_auto_28px] items-center gap-3 px-3 py-2.5"
                >
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-3.5 w-3.5" />
                    <div>
                        <Skeleton className="h-3.5 w-44" />
                        <Skeleton className="mt-1.5 h-2.5 w-56" />
                    </div>
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-7 w-7 rounded-md" />
                </li>
            ))}
        </ul>
    );
}
