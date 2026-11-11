import { describe, expect, it } from "vitest";

import {
    projectPath,
    queuePath,
    runLogsExportPath,
    templateDefaultsResetSectionPath,
    videoPath,
    videoSceneEncoderPath,
} from "./paths";
import source from "./paths.ts?raw";

describe("generated route builders", () => {
    it("encodes every path parameter", () => {
        expect(projectPath("100%")).toBe("/api/projects/100%25");
        expect(videoPath("project/one", "video?two")).toBe(
            "/api/projects/project%2Fone/videos/video%3Ftwo",
        );
        expect(videoSceneEncoderPath("project one", "video#two", 2)).toBe(
            "/api/projects/project%20one/videos/video%23two/scenes/2/encoder",
        );
        expect(templateDefaultsResetSectionPath("template#1", "general defaults")).toBe(
            "/api/settings/templates/template%231/defaults/reset/general%20defaults",
        );
        expect(runLogsExportPath("run/1")).toBe("/api/runs/run%2F1/logs/export");
    });

    it("preserves a zero-valued path parameter", () => {
        expect(videoSceneEncoderPath("project", "video", 0)).toBe(
            "/api/projects/project/videos/video/scenes/0/encoder",
        );
    });

    it("encodes the queue project id", () => {
        expect(queuePath("project one")).toBe("/api/projects/project%20one/queue");
    });

    it("declares camelCase parameter names", () => {
        const parameters = [...source.matchAll(/([A-Za-z][A-Za-z0-9_]*): string \| number/g)]
            .map((match) => match[1])
            .filter((name): name is string => name !== undefined);

        expect(parameters.length).toBeGreaterThan(0);
        expect(parameters.every((name) => /^[a-z][A-Za-z0-9]*$/.test(name))).toBe(true);
        expect(parameters).toEqual(
            expect.arrayContaining([
                "projectId",
                "videoId",
                "templateId",
                "runId",
                "sessionId",
                "section",
                "sequence",
                "index",
            ]),
        );
    });
});
