import { ProjectSectionsGrid } from "./ProjectSectionsGrid";

/** The project-level configuration cards, separated from the queue. */
export function ProjectConfigurationSection({
    projectId,
    locked,
}: {
    projectId: string;
    locked: boolean;
}) {
    return (
        <section
            aria-labelledby="configuration-heading"
            className="rounded-lg border border-line bg-surface"
        >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-5 pb-4 sm:px-6">
                <h2 id="configuration-heading" className="m-0 text-base font-semibold text-ink">
                    Configuration and Defaults
                </h2>
                <p className="m-0 text-[11px] text-ink-muted">
                    Every video inherits these unless its own section overrides them.
                </p>
            </div>
            <div className="px-4 pb-4 sm:px-6">
                <ProjectSectionsGrid projectId={projectId} locked={locked} />
            </div>
        </section>
    );
}
