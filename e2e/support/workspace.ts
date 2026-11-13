import { randomUUID } from "node:crypto";

import type { ProjectHandle, RunJourney } from "./run-journey";

/**
 * A test attempt's project namespace.
 *
 * The workspace owns names and cleanup, not the creation path: a spec can create a project
 * over HTTP, or through the UI and then register the resulting handle. The random suffix
 * makes every attempt unique, so a CI retry cannot collide with the failed attempt's rows.
 */
export interface Workspace {
    /** A stable, attempt-unique name for the given human-readable base. */
    name: (base: string) => string;
    /** Creates a project over HTTP and registers it for cleanup. */
    createProject: (base: string) => Promise<ProjectHandle>;
    /** Registers a project created elsewhere, such as through the UI. */
    trackProject: (project: ProjectHandle) => ProjectHandle;
    /** Deletes every tracked project; the fixture calls this only after a passing test. */
    cleanup: () => Promise<void>;
}

/** Build a workspace around one host's run-journey seam. */
export function createWorkspace(journey: RunJourney): Workspace {
    const suffix = randomUUID().slice(0, 8);
    const projects = new Map<string, ProjectHandle>();
    const name = (base: string) => `${base} · ${suffix}`;
    const trackProject = (project: ProjectHandle) => {
        projects.set(project.id, project);
        return project;
    };

    return {
        name,
        async createProject(base) {
            return trackProject(await journey.createProject(name(base)));
        },
        trackProject,
        async cleanup() {
            for (const project of projects.values()) {
                await project.delete();
            }
            projects.clear();
        },
    };
}
