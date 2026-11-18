import type { ZodType } from "zod";

import appInfoFixture from "./fixtures/boundary/platform/app-info.json";
import appSettingsFixture from "./fixtures/boundary/settings/app-settings.json";
import audioTrackListFixture from "./fixtures/boundary/video/audio-track-list.json";
import concatInventoryFixture from "./fixtures/boundary/video/concat-inventory.json";
import concatSourceInfoFixture from "./fixtures/boundary/video/concat-source-info.json";
import configOverridesFixture from "./fixtures/boundary/settings/config-overrides.json";
import diagnosticsBundleFixture from "./fixtures/boundary/platform/diagnostics-bundle.json";
import effectiveConfigFixture from "./fixtures/boundary/settings/effective-config.json";
import encodeEventFixture from "./fixtures/boundary/run/encode-event.json";
import encoderDescriptorFixture from "./fixtures/boundary/encoder/encoder-descriptor.json";
import encoderForkProbeFixture from "./fixtures/boundary/encoder/encoder-fork-probe.json";
import encoderForkFixture from "./fixtures/boundary/encoder/encoder-fork.json";
import filterSchemasFixture from "./fixtures/boundary/encoder/filter-schemas.json";
import generalDefaultsFixture from "./fixtures/boundary/settings/general-defaults.json";
import lanStatusFixture from "./fixtures/boundary/platform/lan-status.json";
import languageServerInfoFixture from "./fixtures/boundary/script/language-server-info.json";
import logExportFixture from "./fixtures/boundary/platform/log-export.json";
import logPageFixture from "./fixtures/boundary/platform/log-page.json";
import preflightCheckFixture from "./fixtures/boundary/encoder/preflight-check.json";
import preflightReportFixture from "./fixtures/boundary/encoder/preflight-report.json";
import projectFixture from "./fixtures/boundary/project/project.json";
import projectSummaryFixture from "./fixtures/boundary/project/project-summary.json";
import projectTemplateAppliedFixture from "./fixtures/boundary/project/project-template-applied.json";
import projectTemplateExportFixture from "./fixtures/boundary/project/project-template-export.json";
import projectTemplateImportResultFixture from "./fixtures/boundary/project/project-template-import-result.json";
import projectTemplateFixture from "./fixtures/boundary/project/project-template.json";
import pythonInterpretersFixture from "./fixtures/boundary/encoder/python-interpreters.json";
import queueBatchStatusFixture from "./fixtures/boundary/queue/queue-batch-status.json";
import runStartedFixture from "./fixtures/boundary/run/run-started.json";
import runSummaryFixture from "./fixtures/boundary/run/run-summary.json";
import sceneEncoderDetailFixture from "./fixtures/boundary/scene/scene-encoder-detail.json";
import sceneListFixture from "./fixtures/boundary/scene/scene-list.json";
import scriptCheckFixture from "./fixtures/boundary/script/script-check.json";
import scriptGuideFixture from "./fixtures/boundary/script/script-guide.json";
import scriptMaterialisedFixture from "./fixtures/boundary/script/script-materialised.json";
import toolchainInfoFixture from "./fixtures/boundary/platform/toolchain-info.json";
import scriptPluginReportFixture from "./fixtures/boundary/script/script-plugin-report.json";
import storageOverviewFixture from "./fixtures/boundary/platform/storage-overview.json";
import thumbnailManifestFixture from "./fixtures/boundary/video/thumbnail-manifest.json";
import updateStatusFixture from "./fixtures/boundary/platform/update-status.json";
import videoDetailFixture from "./fixtures/boundary/video/video-detail.json";
import videoGeneralFixture from "./fixtures/boundary/video/video-general.json";
import videoHistoryFixture from "./fixtures/boundary/video/video-history.json";
import videoProbeFixture from "./fixtures/boundary/video/video-probe.json";
import videoStateFixture from "./fixtures/boundary/video/video-state.json";
import videoStorageFixture from "./fixtures/boundary/video/video-storage.json";
import videoSummaryFixture from "./fixtures/boundary/video/video-summary.json";
import videoValidationFixture from "./fixtures/boundary/video/video-validation.json";
import {
    AppInfoSchema,
    AppSettingsSchema,
    AudioTrackListSchema,
    ConcatInventorySchema,
    ConcatSourceInfoSchema,
    ConfigOverridesSchema,
    DiagnosticsBundleSchema,
    EffectiveConfigSchema,
    EncodeEventSchema,
    EncoderDescriptorSchema,
    EncoderForkProbeSchema,
    EncoderForkSchema,
    FilterSchemasSchema,
    GeneralDefaultsSchema,
    LanStatusSchema,
    LanguageServerInfoSchema,
    LogExportSchema,
    LogPageSchema,
    PreflightCheckSchema,
    PreflightReportSchema,
    ProjectSchema,
    ProjectSummarySchema,
    ProjectTemplateAppliedSchema,
    ProjectTemplateExportSchema,
    ProjectTemplateImportResultSchema,
    ProjectTemplateSchema,
    PythonInterpretersSchema,
    QueueBatchStatusSchema,
    RunStartedSchema,
    RunSummarySchema,
    SceneEncoderDetailSchema,
    SceneListSchema,
    ScriptCheckSchema,
    ScriptGuideSchema,
    ScriptMaterialisedSchema,
    ScriptPluginReportSchema,
    StorageOverviewSchema,
    ThumbnailManifestSchema,
    ToolchainInfoSchema,
    UpdateStatusSchema,
    VideoDetailSchema,
    VideoGeneralSchema,
    VideoHistorySchema,
    VideoProbeSchema,
    VideoStateSchema,
    VideoStorageSchema,
    VideoSummarySchema,
    VideoValidationSchema,
} from "./index";

/** One generated contract schema and the standalone response or request it must parse. */
export interface BoundaryFixture {
    readonly name: string;
    readonly schema: ZodType;
    /** Path under `src/fixtures/boundary`, without the leading `./fixtures/boundary/`. */
    readonly fixturePath: string;
    readonly fixture: unknown;
}

/**
 * Hand-maintained boundary registry.
 *
 * Every generated contract schema the API hooks parse must have one committed fixture
 * here. The generated schemas prove the TypeScript shape; the fixtures prove a real
 * boundary value still parses after regeneration, and the test rejects both a missing
 * fixture and a fixture that no hook boundary claims. Hook responses built outside the
 * generated contracts, such as the engine's raw configuration JSON Schema, are registered
 * beside their hook in `packages/api/src/api/boundaries.ts`.
 */
export const BOUNDARY_FIXTURES = [
    {
        name: "AppInfo",
        schema: AppInfoSchema,
        fixturePath: "platform/app-info.json",
        fixture: appInfoFixture,
    },
    {
        name: "ToolchainInfo",
        schema: ToolchainInfoSchema,
        fixturePath: "platform/toolchain-info.json",
        fixture: toolchainInfoFixture,
    },
    {
        name: "AppSettings",
        schema: AppSettingsSchema,
        fixturePath: "settings/app-settings.json",
        fixture: appSettingsFixture,
    },
    {
        name: "AudioTrackList",
        schema: AudioTrackListSchema,
        fixturePath: "video/audio-track-list.json",
        fixture: audioTrackListFixture,
    },
    {
        name: "ConcatInventory",
        schema: ConcatInventorySchema,
        fixturePath: "video/concat-inventory.json",
        fixture: concatInventoryFixture,
    },
    {
        name: "ConcatSourceInfo",
        schema: ConcatSourceInfoSchema,
        fixturePath: "video/concat-source-info.json",
        fixture: concatSourceInfoFixture,
    },
    {
        name: "ConfigOverrides",
        schema: ConfigOverridesSchema,
        fixturePath: "settings/config-overrides.json",
        fixture: configOverridesFixture,
    },
    {
        name: "DiagnosticsBundle",
        schema: DiagnosticsBundleSchema,
        fixturePath: "platform/diagnostics-bundle.json",
        fixture: diagnosticsBundleFixture,
    },
    {
        name: "EffectiveConfig",
        schema: EffectiveConfigSchema,
        fixturePath: "settings/effective-config.json",
        fixture: effectiveConfigFixture,
    },
    {
        name: "EncodeEvent",
        schema: EncodeEventSchema,
        fixturePath: "run/encode-event.json",
        fixture: encodeEventFixture,
    },
    {
        name: "EncoderDescriptor",
        schema: EncoderDescriptorSchema,
        fixturePath: "encoder/encoder-descriptor.json",
        fixture: encoderDescriptorFixture,
    },
    {
        name: "EncoderForkProbe",
        schema: EncoderForkProbeSchema,
        fixturePath: "encoder/encoder-fork-probe.json",
        fixture: encoderForkProbeFixture,
    },
    {
        name: "EncoderFork",
        schema: EncoderForkSchema,
        fixturePath: "encoder/encoder-fork.json",
        fixture: encoderForkFixture,
    },
    {
        name: "FilterSchemas",
        schema: FilterSchemasSchema,
        fixturePath: "encoder/filter-schemas.json",
        fixture: filterSchemasFixture,
    },
    {
        name: "GeneralDefaults",
        schema: GeneralDefaultsSchema,
        fixturePath: "settings/general-defaults.json",
        fixture: generalDefaultsFixture,
    },
    {
        name: "LanStatus",
        schema: LanStatusSchema,
        fixturePath: "platform/lan-status.json",
        fixture: lanStatusFixture,
    },
    {
        name: "LanguageServerInfo",
        schema: LanguageServerInfoSchema,
        fixturePath: "script/language-server-info.json",
        fixture: languageServerInfoFixture,
    },
    {
        name: "LogExport",
        schema: LogExportSchema,
        fixturePath: "platform/log-export.json",
        fixture: logExportFixture,
    },
    {
        name: "LogPage",
        schema: LogPageSchema,
        fixturePath: "platform/log-page.json",
        fixture: logPageFixture,
    },
    {
        name: "PreflightCheck",
        schema: PreflightCheckSchema,
        fixturePath: "encoder/preflight-check.json",
        fixture: preflightCheckFixture,
    },
    {
        name: "PreflightReport",
        schema: PreflightReportSchema,
        fixturePath: "encoder/preflight-report.json",
        fixture: preflightReportFixture,
    },
    {
        name: "Project",
        schema: ProjectSchema,
        fixturePath: "project/project.json",
        fixture: projectFixture,
    },
    {
        name: "ProjectSummary",
        schema: ProjectSummarySchema,
        fixturePath: "project/project-summary.json",
        fixture: projectSummaryFixture,
    },
    {
        name: "ProjectTemplateApplied",
        schema: ProjectTemplateAppliedSchema,
        fixturePath: "project/project-template-applied.json",
        fixture: projectTemplateAppliedFixture,
    },
    {
        name: "ProjectTemplate",
        schema: ProjectTemplateSchema,
        fixturePath: "project/project-template.json",
        fixture: projectTemplateFixture,
    },
    {
        name: "ProjectTemplateExport",
        schema: ProjectTemplateExportSchema,
        fixturePath: "project/project-template-export.json",
        fixture: projectTemplateExportFixture,
    },
    {
        name: "ProjectTemplateImportResult",
        schema: ProjectTemplateImportResultSchema,
        fixturePath: "project/project-template-import-result.json",
        fixture: projectTemplateImportResultFixture,
    },
    {
        name: "PythonInterpreters",
        schema: PythonInterpretersSchema,
        fixturePath: "encoder/python-interpreters.json",
        fixture: pythonInterpretersFixture,
    },
    {
        name: "QueueBatchStatus",
        schema: QueueBatchStatusSchema,
        fixturePath: "queue/queue-batch-status.json",
        fixture: queueBatchStatusFixture,
    },
    {
        name: "RunStarted",
        schema: RunStartedSchema,
        fixturePath: "run/run-started.json",
        fixture: runStartedFixture,
    },
    {
        name: "RunSummary",
        schema: RunSummarySchema,
        fixturePath: "run/run-summary.json",
        fixture: runSummaryFixture,
    },
    {
        name: "SceneEncoderDetail",
        schema: SceneEncoderDetailSchema,
        fixturePath: "scene/scene-encoder-detail.json",
        fixture: sceneEncoderDetailFixture,
    },
    {
        name: "SceneList",
        schema: SceneListSchema,
        fixturePath: "scene/scene-list.json",
        fixture: sceneListFixture,
    },
    {
        name: "ScriptCheck",
        schema: ScriptCheckSchema,
        fixturePath: "script/script-check.json",
        fixture: scriptCheckFixture,
    },
    {
        name: "ScriptGuide",
        schema: ScriptGuideSchema,
        fixturePath: "script/script-guide.json",
        fixture: scriptGuideFixture,
    },
    {
        name: "ScriptMaterialised",
        schema: ScriptMaterialisedSchema,
        fixturePath: "script/script-materialised.json",
        fixture: scriptMaterialisedFixture,
    },
    {
        name: "ScriptPluginReport",
        schema: ScriptPluginReportSchema,
        fixturePath: "script/script-plugin-report.json",
        fixture: scriptPluginReportFixture,
    },
    {
        name: "StorageOverview",
        schema: StorageOverviewSchema,
        fixturePath: "platform/storage-overview.json",
        fixture: storageOverviewFixture,
    },
    {
        name: "ThumbnailManifest",
        schema: ThumbnailManifestSchema,
        fixturePath: "video/thumbnail-manifest.json",
        fixture: thumbnailManifestFixture,
    },
    {
        name: "UpdateStatus",
        schema: UpdateStatusSchema,
        fixturePath: "platform/update-status.json",
        fixture: updateStatusFixture,
    },
    {
        name: "VideoDetail",
        schema: VideoDetailSchema,
        fixturePath: "video/video-detail.json",
        fixture: videoDetailFixture,
    },
    {
        name: "VideoGeneral",
        schema: VideoGeneralSchema,
        fixturePath: "video/video-general.json",
        fixture: videoGeneralFixture,
    },
    {
        name: "VideoHistory",
        schema: VideoHistorySchema,
        fixturePath: "video/video-history.json",
        fixture: videoHistoryFixture,
    },
    {
        name: "VideoProbe",
        schema: VideoProbeSchema,
        fixturePath: "video/video-probe.json",
        fixture: videoProbeFixture,
    },
    {
        name: "VideoState",
        schema: VideoStateSchema,
        fixturePath: "video/video-state.json",
        fixture: videoStateFixture,
    },
    {
        name: "VideoStorage",
        schema: VideoStorageSchema,
        fixturePath: "video/video-storage.json",
        fixture: videoStorageFixture,
    },
    {
        name: "VideoSummary",
        schema: VideoSummarySchema,
        fixturePath: "video/video-summary.json",
        fixture: videoSummaryFixture,
    },
    {
        name: "VideoValidation",
        schema: VideoValidationSchema,
        fixturePath: "video/video-validation.json",
        fixture: videoValidationFixture,
    },
] as const satisfies readonly BoundaryFixture[];
