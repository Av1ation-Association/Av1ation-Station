import type { ZodType } from "zod";
import type { AppSettings } from "@av1ation/contracts";
import { ApiError } from "../../types";
import type { MockTransport } from "../../mock";

export async function patchJson<T>(
    state: MockTransport,
    path: string,
    body: unknown,
    schema: ZodType<T>,
): Promise<T> {
    if (path === "/api/settings") {
        const current = state.routes.get(path) as AppSettings;
        const patch = body as {
            theme?: unknown;
            row_density?: unknown;
            reduce_motion?: unknown;
            temp_dir?: unknown;
            delete_chunks_on_success?: unknown;
        };
        const has = (key: keyof typeof patch) => Object.prototype.hasOwnProperty.call(patch, key);
        const next: AppSettings = { ...current };
        if (has("theme")) {
            if (patch.theme !== "system" && patch.theme !== "dark" && patch.theme !== "light") {
                throw new ApiError(400, null, "Choose system, dark, or light.");
            }
            next.theme = patch.theme;
        }
        if (has("row_density")) {
            if (patch.row_density !== "comfortable" && patch.row_density !== "compact") {
                throw new ApiError(400, null, "Choose comfortable or compact.");
            }
            next.row_density = patch.row_density;
        }
        if (has("reduce_motion")) {
            if (typeof patch.reduce_motion !== "boolean") {
                throw new ApiError(400, null, "Reduce motion must be true or false.");
            }
            next.reduce_motion = patch.reduce_motion;
        }
        if (has("delete_chunks_on_success")) {
            if (typeof patch.delete_chunks_on_success !== "boolean") {
                throw new ApiError(400, null, "Chunk deletion must be true or false.");
            }
            next.delete_chunks_on_success = patch.delete_chunks_on_success;
        }
        if (has("temp_dir")) {
            if (patch.temp_dir === null) {
                delete next.temp_dir;
            } else if (typeof patch.temp_dir === "string" && patch.temp_dir.trim() !== "") {
                next.temp_dir = patch.temp_dir.trim();
            } else {
                throw new ApiError(400, null, "Choose a folder, or clear the field.");
            }
        }
        state.routes.set(path, next);
        return schema.parse(next);
    }

    const order = /^\/api\/projects\/([^/]+)\/videos\/order$/u.exec(path);
    if (order !== null) {
        const projectId = decodeURIComponent(order[1] ?? "");
        const input = body as { video_ids?: unknown };
        const ids = Array.isArray(input.video_ids)
            ? input.video_ids.filter((id): id is string => typeof id === "string")
            : [];
        const queue = state.videosFor(projectId);
        const ordered = ids.flatMap((id) => {
            const video = queue.find((entry) => entry.id === id);
            return video === undefined ? [] : [video];
        });
        if (ordered.length !== queue.length) {
            throw new ApiError(422, null, "The order must be a permutation of the queue.");
        }
        ordered.forEach((video, index) => {
            video.order = index;
        });
        state.videos.set(projectId, ordered);
        return schema.parse(ordered);
    }

    const found = state.project(path);
    const project = found === null ? undefined : found.projects[found.index];
    if (found === null || project === undefined) {
        throw new ApiError(404, null, `No mock route for PATCH ${path}.`);
    }
    const input = body as { name?: unknown };
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (name === "" || name.length > 120) {
        throw new ApiError(400, null, "A project needs a name of 1–120 characters.");
    }
    const now = new Date().toISOString();
    found.projects[found.index] = { ...project, name, accessed_at: now };
    return schema.parse({
        id: project.id,
        name,
        description: null,
        created_at: project.created_at,
        accessed_at: now,
        general: state.generalFor(project.id),
    });
}
