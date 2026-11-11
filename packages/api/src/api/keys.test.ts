import { describe, expect, it } from "vitest";

import { queryKeys } from "./keys";

const projectId = "project 1";
const videoId = "video/1";
const templateId = "template-1";
const runId = "run-1";

type KeyCase = readonly [name: string, actual: readonly unknown[], expected: readonly unknown[]];

const cases: readonly KeyCase[] = [
    ["health", queryKeys.health, ["health"]],
    ["updateCheck", queryKeys.updateCheck, ["update-check"]],
    ["settings", queryKeys.settings, ["settings"]],
    ["encoders", queryKeys.encoders, ["encoders"]],
    ["storage", queryKeys.storage, ["storage"]],
    ["lan", queryKeys.lan, ["lan"]],
    ["configSchemas", queryKeys.configSchemas, ["config-schemas"]],
    ["filterSchemas", queryKeys.filterSchemas, ["filter-schemas"]],
    ["scriptGuide", queryKeys.scriptGuide, ["script-guide"]],
    ["languageServer", queryKeys.languageServer, ["language-server"]],
    ["pythonInterpreters", queryKeys.pythonInterpreters, ["python-interpreters"]],
    ["projects", queryKeys.projects, ["projects"]],
    ["project", queryKeys.project(projectId), ["project", projectId]],
    ["projectConfig", queryKeys.projectConfig(projectId), ["project-config", projectId]],
    [
        "projectScriptPlugins",
        queryKeys.projectScriptPlugins(projectId),
        ["project-script-plugins", projectId],
    ],
    ["videoValidations", queryKeys.videoValidations(projectId), ["video-validation", projectId]],
    ["queueBatch", queryKeys.queueBatch(projectId), ["queue-batch", projectId]],
    ["videos", queryKeys.videos(projectId), ["videos", projectId]],
    ["videoStates", queryKeys.videoStates(projectId), ["video-states", projectId]],
    ["videoStatePrefix", queryKeys.videoStatePrefix(projectId), ["video-state", projectId]],
    ["video", queryKeys.video(projectId, videoId), ["video", projectId, videoId]],
    ["videoState", queryKeys.videoState(projectId, videoId), ["video-state", projectId, videoId]],
    [
        "videoGeneral",
        queryKeys.videoGeneral(projectId, videoId),
        ["video-general", projectId, videoId],
    ],
    [
        "videoValidation",
        queryKeys.videoValidation(projectId, videoId),
        ["video-validation", projectId, videoId],
    ],
    [
        "videoOverrides",
        queryKeys.videoOverrides(projectId, videoId),
        ["video-overrides", projectId, videoId],
    ],
    [
        "videoConfig",
        queryKeys.videoConfig(projectId, videoId),
        ["video-config", projectId, videoId],
    ],
    [
        "videoScenes",
        queryKeys.videoScenes(projectId, videoId),
        ["video-scenes", projectId, videoId],
    ],
    [
        "videoThumbnails",
        queryKeys.videoThumbnails(projectId, videoId),
        ["video-thumbnails", projectId, videoId],
    ],
    [
        "videoStorage",
        queryKeys.videoStorage(projectId, videoId),
        ["video-storage", projectId, videoId],
    ],
    ["videoProbe", queryKeys.videoProbe(projectId, videoId), ["video-probe", projectId, videoId]],
    [
        "videoAudioTracks",
        queryKeys.videoAudioTracks(projectId, videoId),
        ["video-audio-tracks", projectId, videoId],
    ],
    [
        "videoHistory",
        queryKeys.videoHistory(projectId, videoId),
        ["video-history", projectId, videoId],
    ],
    ["videoRuns", queryKeys.videoRuns(projectId, videoId), ["video-runs", projectId, videoId]],
    [
        "videoInputProbe",
        queryKeys.videoInputProbe(projectId, videoId, "input-json"),
        ["video-input-probe", projectId, videoId, "input-json"],
    ],
    [
        "sceneEncoder null",
        queryKeys.sceneEncoder(projectId, videoId, null),
        ["scene-encoder", projectId, videoId, null],
    ],
    [
        "sceneEncoder index",
        queryKeys.sceneEncoder(projectId, videoId, 7),
        ["scene-encoder", projectId, videoId, 7],
    ],
    [
        "sceneEncoders",
        queryKeys.sceneEncoders(projectId, videoId),
        ["scene-encoder", projectId, videoId],
    ],
    ["templateDefaults", queryKeys.templateDefaults(templateId), ["template-defaults", templateId]],
    ["templateDefaultsAll", queryKeys.templateDefaultsAll, ["template-defaults"]],
    ["templateGeneral", queryKeys.templateGeneral(templateId), ["template-general", templateId]],
    ["templateGeneralAll", queryKeys.templateGeneralAll, ["template-general"]],
    [
        "templateScriptPlugins",
        queryKeys.templateScriptPlugins(templateId),
        ["template-script-plugins", templateId],
    ],
    ["templateScriptPluginsAll", queryKeys.templateScriptPluginsAll, ["template-script-plugins"]],
    ["runLogs", queryKeys.runLogs(runId), ["run-log", runId]],
    ["runLog", queryKeys.runLog(runId, "tail", 50, "warn"), ["run-log", runId, "tail", 50, "warn"]],
];

describe("query key contract", () => {
    for (const [name, actual, expected] of cases) {
        it(`${name} keeps its literal shape`, () => {
            expect(actual).toEqual(expected);
        });
    }

    it("keeps the video-state prefix and the separate video-states key distinct", () => {
        expect(queryKeys.videoStatePrefix(projectId)).toEqual(["video-state", projectId]);
        expect(queryKeys.videoStates(projectId)).toEqual(["video-states", projectId]);
        expect(queryKeys.videoState(projectId, videoId).slice(0, 2)).toEqual(
            queryKeys.videoStatePrefix(projectId),
        );
    });
});
