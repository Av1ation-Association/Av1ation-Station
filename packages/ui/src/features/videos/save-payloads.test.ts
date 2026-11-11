import { describe, expect, it } from "vitest";

import { DEFINITIONS } from "../../shared/model/section-definitions";
import { mergeDraft } from "../configuration/SectionEditor";
import { mergeSectionOverrides } from "./video-overrides";

describe("configuration save payloads", () => {
    it("writes the project's whole configuration with only its section replaced", () => {
        const document = {
            encoder: { SVTAV1: { crf: 30 } },
            sequences: {
                scene_detector: { method: "av_scenechange", threshold: 24 },
                parallel_encoder: { input: { path: "C:/media/clip.mkv" } },
            },
        };
        const draft = {
            scene_detector: { method: "av_scenechange", threshold: 12 },
        };

        expect(mergeDraft(document, DEFINITIONS["scene-detection"], draft)).toEqual({
            encoder: { SVTAV1: { crf: 30 } },
            sequences: {
                scene_detector: { method: "av_scenechange", threshold: 12 },
                parallel_encoder: { input: { path: "C:/media/clip.mkv" } },
            },
        });
    });

    it("writes only the video override this section changed and keeps other sections", () => {
        const project = {
            sequences: {
                scene_detector: { method: "av_scenechange", threshold: 24 },
                parallel_encoder: { input: { path: "C:/media/clip.mkv" } },
            },
        };
        const video = {
            sequences: {
                scene_detector: { method: "av_scenechange", threshold: 24 },
                parallel_encoder: { input: { path: "C:/media/clip.mkv" } },
            },
        };
        const draft = {
            scene_detector: { method: "av_scenechange", threshold: 12 },
        };

        const next = mergeDraft(video, DEFINITIONS["scene-detection"], draft);

        // The video write is a sparse override map, not a second whole configuration:
        // unchanged parts stay inherited and parts owned by another section survive.
        expect(
            mergeSectionOverrides(
                { "sequences.parallel_encoder": { input: { path: "D:/other.mkv" } } },
                DEFINITIONS["scene-detection"],
                project,
                next,
            ),
        ).toEqual({
            "sequences.parallel_encoder": { input: { path: "D:/other.mkv" } },
            "sequences.scene_detector": { method: "av_scenechange", threshold: 12 },
        });
    });

    it("drops a video override that now matches the project", () => {
        const project = {
            sequences: { scene_detector: { method: "av_scenechange", threshold: 24 } },
        };
        const video = {
            sequences: { scene_detector: { method: "av_scenechange", threshold: 24 } },
        };

        const next = mergeDraft(video, DEFINITIONS["scene-detection"], {
            scene_detector: { method: "av_scenechange", threshold: 24 },
        });

        expect(
            mergeSectionOverrides(
                { "sequences.scene_detector": { method: "av_scenechange", threshold: 24 } },
                DEFINITIONS["scene-detection"],
                project,
                next,
            ),
        ).toEqual({});
    });
});
