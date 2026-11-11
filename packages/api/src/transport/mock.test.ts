import { afterEach, describe, expect, it, vi } from "vitest";

import {
    AppInfoSchema,
    LogPageSchema,
    PreflightCheckSchema,
    ProjectSchema,
    RunSummarySchema,
    SceneListSchema,
    VideoDetailSchema,
} from "@av1ation/contracts";
import {
    API_VERSION,
    APP_VERSION,
    ENGINE_REVISION,
    ENGINE_VERSION,
} from "@av1ation/contracts/versions";

import { MockTransport } from "./mock";

describe("MockTransport", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("gives documents created in the same millisecond distinct ids", async () => {
        // A frozen clock is the case a timestamp alone fails: every add would share an id.
        vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
        const transport = new MockTransport();

        const projects = await Promise.all(
            ["One", "Two", "Three"].map((name) =>
                transport.post("/api/projects", { name }, ProjectSchema),
            ),
        );
        expect(new Set(projects.map((project) => project.id)).size).toBe(3);

        const videos = await Promise.all(
            ["a", "b", "c"].map((name) =>
                transport.post(
                    `/api/projects/${projects[0]?.id}/videos`,
                    { name, input_path: `C:/media/${name}.mkv` },
                    VideoDetailSchema,
                ),
            ),
        );
        expect(new Set(videos.map((video) => video.id)).size).toBe(3);
    });

    it("reports the generated app and engine versions", async () => {
        const info = await new MockTransport().get("/api/health", AppInfoSchema);

        expect(info.version).toBe(APP_VERSION);
        expect(info.engine_version).toBe(ENGINE_VERSION);
        expect(info.engine_revision).toBe(ENGINE_REVISION);
        expect(info.api_version).toBe(API_VERSION);
        expect(info.preflight.available_count).toBe(2);
        expect(info.preflight.total_count).toBe(3);
        expect(info.preflight.checks.map((check) => check.capability)).toEqual([
            "decode",
            "muxing",
            "encode",
        ]);
    });

    it("probes a custom executable and restores the detected rows on removal", async () => {
        const transport = new MockTransport();
        const check = await transport.post(
            "/api/preflight/custom",
            { kind: "x265", path: "C:\\tools\\x265.exe" },
            PreflightCheckSchema,
        );
        expect(check).toMatchObject({ id: "custom:x265", origin: "custom", available: true });

        const added = await transport.get("/api/health", AppInfoSchema);
        expect(added.preflight.total_count).toBe(4);
        expect(added.preflight.checks[added.preflight.checks.length - 1]?.id).toBe("custom:x265");

        await transport.delete("/api/preflight/custom/custom%3Ax265");
        const removed = await transport.get("/api/health", AppInfoSchema);
        expect(removed.preflight.total_count).toBe(3);
        expect(removed.preflight.checks.some((check) => check.id === "custom:x265")).toBe(false);
    });

    it("stores General defaults and derives an omitted output path", async () => {
        const transport = new MockTransport();
        const project = await transport.post("/api/projects", { name: "General" }, ProjectSchema);
        expect(project.general).toEqual({
            input_kind: "ffms2",
            output_mode: "next_to_input",
            ffms2_filters: [{ OutputFormat: { bit_depth: 10 } }],
            vapour_synth_filters: [{ Resize: { format: "YUV420P10LE" } }],
        });

        const updated = await transport.putJson(
            `/api/projects/${project.id}/general`,
            {
                input_kind: "ffms2",
                output_mode: "folder",
                output_folder: "D:\\Media\\encoded",
            },
            ProjectSchema,
        );
        expect(updated.general.output_folder).toBe("D:\\Media\\encoded");

        const video = await transport.post(
            `/api/projects/${project.id}/videos`,
            { input_path: "D:\\Media\\clip.mkv" },
            VideoDetailSchema,
        );
        expect(video.output_path).toBe("D:\\Media\\encoded\\clip.av1.mkv");
    });

    it("serves a populated scene table for the demo screen", async () => {
        const scenes = await new MockTransport().get(
            "/api/projects/demo/videos/demo-video/scenes",
            SceneListSchema,
        );

        expect(scenes.video_id).toBe("demo-video");
        expect(scenes.scenes).toHaveLength(12);
        expect(scenes.total_frames).toBeGreaterThan(0);
        expect(scenes.scenes[0]?.encoded).toBe(true);
    });

    it("forgets a deleted demo run log in both the viewer and its list", async () => {
        const transport = new MockTransport();
        const runsPath = "/api/projects/demo/videos/demo-video/runs";
        const before = await transport.get(runsPath, RunSummarySchema.array());
        expect(before.map((run) => run.run_id)).toContain("demo-run-2");

        await transport.delete("/api/runs/demo-run-2/logs");

        const after = await transport.get(runsPath, RunSummarySchema.array());
        expect(after.map((run) => run.run_id)).not.toContain("demo-run-2");
        await expect(
            transport.get("/api/runs/demo-run-2/logs", LogPageSchema),
        ).rejects.toMatchObject({ status: 404 });
        await expect(transport.delete("/api/runs/demo-run-2/logs")).rejects.toMatchObject({
            status: 404,
        });
    });

    it("rejects a route it does not implement", async () => {
        await expect(new MockTransport().get("/api/missing", AppInfoSchema)).rejects.toMatchObject({
            status: 404,
        });
    });
});
