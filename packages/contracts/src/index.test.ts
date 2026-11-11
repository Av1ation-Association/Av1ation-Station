import { describe, expect, it } from "vitest";

import appInfoSchema from "../../../schema/platform/app-info.json";

import errorBodyFixture from "./fixtures/error-body.json";
import projectFixture from "./fixtures/project.json";
import projectSummaryFixture from "./fixtures/project-summary.json";
import runStartedFixture from "./fixtures/run-started.json";
import {
    AppInfoSchema,
    ErrorBodySchema,
    ProjectSchema,
    ProjectSummarySchema,
    RunStartedSchema,
} from "./index";
import { API_VERSION, APP_VERSION, ENGINE_REVISION, ENGINE_VERSION } from "./versions";

describe("generated contracts", () => {
    it("parses the app info fixture against the generated version constants", () => {
        const schema = appInfoSchema;
        expect(schema).toMatchObject({ title: "AppInfo" });

        const fixture = {
            name: "Av1ation Station",
            version: APP_VERSION,
            engine_version: ENGINE_VERSION,
            engine_revision: ENGINE_REVISION,
            api_version: API_VERSION,
            preflight: {
                checks: [
                    {
                        id: "vapoursynth",
                        label: "VapourSynth",
                        capability: "decode",
                        available: true,
                        detail: "Core R80 · API 4.3",
                    },
                ],
                available_count: 1,
                total_count: 1,
            },
        };
        expect(AppInfoSchema.parse(fixture)).toEqual(fixture);
    });

    it("parses every committed response fixture", () => {
        const project = ProjectSummarySchema.parse(projectSummaryFixture);
        expect(project.video_count).toBe(3);
        expect(project.size_bytes).toBe(2_147_483_648);

        const started = RunStartedSchema.parse(runStartedFixture);
        expect(started.run_id).toBe("6f1c2d9e-0b7a-4b7e-9a1f-3c8d5e2a4b60");

        const error = ErrorBodySchema.parse(errorBodyFixture);
        expect(error.code).toBe("BUSY");

        const projectDetail = ProjectSchema.parse(projectFixture);
        expect(projectDetail.name).toBe("Feature film");
        expect(projectDetail.created_at).toBe("2026-10-31T08:31:03Z");
    });

    it("rejects unknown keys at the response boundary", () => {
        const project = projectSummaryFixture;
        expect(
            ProjectSummarySchema.safeParse({
                ...(project as Record<string, unknown>),
                unexpected: true,
            }).success,
        ).toBe(false);

        const appInfo = {
            name: "Av1ation Station",
            version: APP_VERSION,
            engine_version: ENGINE_VERSION,
            engine_revision: ENGINE_REVISION,
            api_version: API_VERSION,
            preflight: { checks: [], available_count: 0, total_count: 0 },
        };
        expect(AppInfoSchema.safeParse({ ...appInfo, unexpected: true }).success).toBe(false);
    });

    it("rejects an error envelope without a code", () => {
        expect(ErrorBodySchema.safeParse({ message: "Missing code" }).success).toBe(false);
    });

    it("accepts only the stable error codes", () => {
        expect(ErrorBodySchema.safeParse({ code: "LOCKED", message: "Read-only" }).success).toBe(
            true,
        );
        expect(
            ErrorBodySchema.safeParse({ code: "ENCODE_BUSY", message: "Old code" }).success,
        ).toBe(false);
    });
});
