import type { AppSettings } from "@av1ation/contracts";
import { ApiError } from "../../types";
import { demoRecords } from "../demo";
import type { MockTransport } from "../../mock";

export async function deleteRoute(state: MockTransport, path: string): Promise<void> {
    const cancelEncode = /^\/api\/projects\/[^/]+\/videos\/[^/]+\/encode$/u.exec(path);
    if (cancelEncode !== null) {
        return;
    }
    const templateDelete = /^\/api\/settings\/templates\/([^/]+)$/u.exec(path);
    if (templateDelete !== null) {
        const id = decodeURIComponent(templateDelete[1] ?? "");
        const settings = state.routes.get("/api/settings") as AppSettings;
        if (state.template(id) === undefined) {
            throw new ApiError(404, null, "No project template matches that id.");
        }
        const remaining = settings.project_templates.filter((template) => template.id !== id);
        state.routes.set("/api/settings", {
            ...settings,
            project_templates: remaining,
            default_project_template_id:
                settings.default_project_template_id === id
                    ? remaining[0]?.id
                    : settings.default_project_template_id,
        });
        return;
    }
    const project = state.project(path);
    if (project !== null) {
        const removed = project.projects[project.index];
        project.projects.splice(project.index, 1);
        if (removed !== undefined) {
            state.videos.delete(removed.id);
            state.general.delete(removed.id);
        }
        return;
    }
    const videoRun = /^\/api\/projects\/[^/]+\/videos\/[^/]+\/runs\/([^/]+)$/u.exec(path);
    if (videoRun !== null) {
        const runId = decodeURIComponent(videoRun[1] ?? "");
        if (
            state.deletedRuns.has(runId) ||
            demoRecords(runId, "demo-project", "demo-video") === null
        ) {
            throw new ApiError(404, null, "No run matches that id.");
        }
        state.deletedRuns.add(runId);
        return;
    }
    const runLog = /^\/api\/runs\/([^/]+)\/logs$/u.exec(path);
    if (runLog !== null) {
        const runId = decodeURIComponent(runLog[1] ?? "");
        if (
            state.deletedRuns.has(runId) ||
            demoRecords(runId, "demo-project", "demo-video") === null
        ) {
            throw new ApiError(404, null, "No log exists for that run.");
        }
        state.deletedRuns.add(runId);
        return;
    }
    const encoderParameters = /^\/api\/encoders\/([^/]+)\/parameters$/u.exec(path);
    if (encoderParameters !== null) {
        state.parameterOverrides.delete(decodeURIComponent(encoderParameters[1] ?? ""));
        return;
    }
    const forkPrefix = "/api/encoders/forks/";
    if (path.startsWith(forkPrefix)) {
        const id = decodeURIComponent(path.slice(forkPrefix.length));
        const index = state.forks.findIndex((entry) => entry.record.id === id);
        if (index === -1) {
            throw new ApiError(404, null, "No encoder fork matches that id.");
        }
        state.forks.splice(index, 1);
        return;
    }
    const prefix = "/api/preflight/custom/";
    if (!path.startsWith(prefix)) {
        return;
    }
    const id = decodeURIComponent(path.slice(prefix.length));
    const index = state.customChecks.findIndex((entry) => entry.check.id === id);
    if (index === -1) {
        throw new ApiError(404, null, "No custom executable matches that id.");
    }
    state.customChecks.splice(index, 1);
    state.syncPreflight();
}
