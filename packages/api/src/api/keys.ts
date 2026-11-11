/**
 * The cache-key contract.
 *
 * Query keys are behaviour: an invalidation matches by prefix, so a key that moves stops
 * refreshing every screen that reads it. Keeping the literals here makes that contract
 * auditable in one place.
 */
export const queryKeys = {
    health: ["health"] as const,
    updateCheck: ["update-check"] as const,
    settings: ["settings"] as const,
    encoders: ["encoders"] as const,
    storage: ["storage"] as const,
    lan: ["lan"] as const,
    configSchemas: ["config-schemas"] as const,
    filterSchemas: ["filter-schemas"] as const,
    scriptGuide: ["script-guide"] as const,
    languageServer: ["language-server"] as const,
    pythonInterpreters: ["python-interpreters"] as const,

    projects: ["projects"] as const,
    project: (projectId: string) => ["project", projectId] as const,
    projectConfig: (projectId: string) => ["project-config", projectId] as const,
    projectScriptPlugins: (projectId: string) => ["project-script-plugins", projectId] as const,
    videoValidations: (projectId: string) => ["video-validation", projectId] as const,
    queueBatch: (projectId: string) => ["queue-batch", projectId] as const,
    videos: (projectId: string) => ["videos", projectId] as const,
    videoStates: (projectId: string) => ["video-states", projectId] as const,
    videoStatePrefix: (projectId: string) => ["video-state", projectId] as const,

    video: (projectId: string, videoId: string) => ["video", projectId, videoId] as const,
    videoState: (projectId: string, videoId: string) =>
        ["video-state", projectId, videoId] as const,
    videoGeneral: (projectId: string, videoId: string) =>
        ["video-general", projectId, videoId] as const,
    videoValidation: (projectId: string, videoId: string) =>
        ["video-validation", projectId, videoId] as const,
    videoOverrides: (projectId: string, videoId: string) =>
        ["video-overrides", projectId, videoId] as const,
    videoConfig: (projectId: string, videoId: string) =>
        ["video-config", projectId, videoId] as const,
    videoScenes: (projectId: string, videoId: string) =>
        ["video-scenes", projectId, videoId] as const,
    videoThumbnails: (projectId: string, videoId: string) =>
        ["video-thumbnails", projectId, videoId] as const,
    videoStorage: (projectId: string, videoId: string) =>
        ["video-storage", projectId, videoId] as const,
    videoProbe: (projectId: string, videoId: string) =>
        ["video-probe", projectId, videoId] as const,
    videoAudioTracks: (projectId: string, videoId: string) =>
        ["video-audio-tracks", projectId, videoId] as const,
    videoConcatInventory: (
        projectId: string,
        videoId: string,
        method: string,
        path: string | null,
    ) => ["video-concat-inventory", projectId, videoId, method, path] as const,
    videoConcatSourceInfo: (projectId: string, videoId: string) =>
        ["video-concat-source-info", projectId, videoId] as const,
    videoHistory: (projectId: string, videoId: string) =>
        ["video-history", projectId, videoId] as const,
    videoRuns: (projectId: string, videoId: string) => ["video-runs", projectId, videoId] as const,
    videoInputProbe: (projectId: string, videoId: string, input: string) =>
        ["video-input-probe", projectId, videoId, input] as const,
    sceneEncoder: (projectId: string, videoId: string, index: number | null) =>
        ["scene-encoder", projectId, videoId, index] as const,
    sceneEncoders: (projectId: string, videoId: string) =>
        ["scene-encoder", projectId, videoId] as const,

    templateDefaults: (templateId: string) => ["template-defaults", templateId] as const,
    templateDefaultsAll: ["template-defaults"] as const,
    templateGeneral: (templateId: string) => ["template-general", templateId] as const,
    templateGeneralAll: ["template-general"] as const,
    templateScriptPlugins: (templateId: string) => ["template-script-plugins", templateId] as const,
    templateScriptPluginsAll: ["template-script-plugins"] as const,

    runLogs: (runId: string) => ["run-log", runId] as const,
    runLog: (runId: string, ...parts: readonly (string | number)[]) =>
        ["run-log", runId, ...parts] as const,
} as const;
