import type { ReactNode } from "react";

import { EditableTitle } from "../../shared/EditableTitle";

/** The project title, its lock state, and the page-owned template actions. */
export function ProjectHeader({
    name,
    onRename,
    projectLocked,
    children,
}: {
    name: string;
    onRename: (name: string) => Promise<boolean>;
    projectLocked: boolean;
    children: ReactNode;
}) {
    return (
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <EditableTitle
                value={name}
                label="project"
                headingClassName="m-0 text-2xl font-semibold tracking-tight text-ink"
                onSave={onRename}
            />
            <div className="flex flex-wrap items-center gap-2">
                {projectLocked ? (
                    <p className="m-0 rounded-full border border-warning/40 bg-warning-soft px-3 py-1 text-[10.5px] text-warning">
                        Configuration is locked while a video encodes
                    </p>
                ) : null}
                {children}
            </div>
        </header>
    );
}
