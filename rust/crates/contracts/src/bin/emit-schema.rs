//! Emit the JSON Schemas consumed by the TypeScript/Zod generator.
//!
//! Each entry names the feature group it belongs to, its filename, and the model. The group
//! is the directory under the output root; it organizes the generated tree for readers and
//! is never part of a contract's identity. Every entry keeps its full kebab-case filename,
//! so a document stays unambiguous when it appears outside its directory.
//!
//! `--prune` removes JSON documents the current entries no longer produce, because a renamed
//! or deleted contract must not leave a stale schema behind. `schema/routes/` belongs to the
//! route emitter and is never touched.

use std::{collections::HashSet, env, fs, path::Path, path::PathBuf, process::ExitCode};

use av1ation_contracts::encoder::{
    CustomTool, CustomToolRequest, EncoderDefinition, EncoderDescriptor, EncoderFork,
    EncoderForkProbe, EncoderForkRequest, EncoderForkUpdate, EncoderParameterOverride,
    EncoderParametersUpdate, FilterSchemas, ParameterDescriptor, ParameterKey, ParameterKind,
    ParameterValue, PreflightReport, PythonInterpreter, PythonInterpreterUpdate,
    PythonInterpreters, ToolSourceUpdate, Widget,
};
use av1ation_contracts::platform::{
    AppInfo, DiagnosticsBundle, LanPairing, LanStatus, LogExport, LogPage, LogRecord, PairRequest,
    StorageOverview, StorageProject, ToolchainComponent, ToolchainInfo, UpdateStatus,
};
use av1ation_contracts::project::{
    ChunkInvalidationReason, Project, ProjectChunkImpact, ProjectChunkScene, ProjectCreateRequest,
    ProjectDefaultsState, ProjectSummary, ProjectTemplate, ProjectTemplateApplied,
    ProjectTemplateApplyRequest, ProjectTemplateArchive, ProjectTemplateArchiveKind,
    ProjectTemplateArchiveTemplate, ProjectTemplateCreateRequest, ProjectTemplateDefaultRequest,
    ProjectTemplateExport, ProjectTemplateExportReport, ProjectTemplateImportResult,
    ProjectTemplateUpdate, ProjectUpdateRequest,
};
use av1ation_contracts::protocol::{ErrorBody, EventTicket, InputKind, MediaTicket, OutputMode};
use av1ation_contracts::queue::{QueueBatchRequest, QueueBatchStatus, VideoOrderRequest};
use av1ation_contracts::run::{
    EncodeEvent, RunOutcome, RunStarted, RunSummary, SequenceDescriptor, SequenceRunRequest,
    SequenceRunStatus, SequenceState, TimelineRecord,
};
use av1ation_contracts::scene::{
    SceneDataRequest, SceneEncoderDetail, SceneEncoderRequest, SceneList, SceneModelUpdate,
    SceneRangeRequest, SceneView,
};
use av1ation_contracts::script::{
    LanguageServerInfo, ScriptCheck, ScriptCheckRequest, ScriptCheckStatus, ScriptClip, ScriptData,
    ScriptDataFormat, ScriptDataKey, ScriptGuide, ScriptMaterialiseRequest, ScriptMaterialised,
    ScriptMaterialisedVariable, ScriptPluginReport, ScriptValueFormat, VapourSynthImporter,
};
use av1ation_contracts::settings::{
    AppSettings, AppSettingsUpdate, ConfigOverrides, EffectiveConfig, GeneralDefaults,
    VideoOverridesUpdate,
};
use av1ation_contracts::video::{
    AudioTrack, AudioTrackList, ClipDetails, ConcatChapter, ConcatInventory,
    ConcatInventoryRequest, ConcatMetadataEntry, ConcatMethodName, ConcatSourceAttachment,
    ConcatSourceInfo, ConcatSourceTrack, ConcatTrackKind, ThumbnailManifest, ThumbnailState,
    VideoCreateRequest, VideoDetail, VideoFailure, VideoGeneral, VideoGeneralRequest, VideoHistory,
    VideoProbe, VideoProbeRequest, VideoRemoveRequest, VideoState, VideoStorage,
    VideoStorageRequest, VideoSummary, VideoValidation,
};
use schemars::schema_for;

fn main() -> ExitCode {
    let mut output = PathBuf::from("schema");
    let mut check = false;
    let mut prune = false;
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--out" => match args.next() {
                Some(path) => output = PathBuf::from(path),
                None => {
                    eprintln!("--out requires a directory");
                    return ExitCode::FAILURE;
                }
            },
            "--check" => check = true,
            "--prune" => prune = true,
            other => {
                eprintln!("unknown argument: {other}");
                return ExitCode::FAILURE;
            }
        }
    }

    let schemas = [
        // Platform: the application shell, diagnostics, logs, LAN access and storage.
        ("platform", "app-info.json", schema_for!(AppInfo)),
        (
            "platform",
            "diagnostics-bundle.json",
            schema_for!(DiagnosticsBundle),
        ),
        ("platform", "lan-pairing.json", schema_for!(LanPairing)),
        ("platform", "lan-status.json", schema_for!(LanStatus)),
        ("platform", "log-export.json", schema_for!(LogExport)),
        ("platform", "log-page.json", schema_for!(LogPage)),
        ("platform", "log-record.json", schema_for!(LogRecord)),
        ("platform", "pair-request.json", schema_for!(PairRequest)),
        (
            "platform",
            "storage-overview.json",
            schema_for!(StorageOverview),
        ),
        (
            "platform",
            "storage-project.json",
            schema_for!(StorageProject),
        ),
        (
            "platform",
            "toolchain-component.json",
            schema_for!(ToolchainComponent),
        ),
        (
            "platform",
            "toolchain-info.json",
            schema_for!(ToolchainInfo),
        ),
        ("platform", "update-status.json", schema_for!(UpdateStatus)),
        // Settings: the stored settings document and the configuration it feeds.
        (
            "settings",
            "app-settings-update.json",
            schema_for!(AppSettingsUpdate),
        ),
        ("settings", "app-settings.json", schema_for!(AppSettings)),
        (
            "settings",
            "config-overrides.json",
            schema_for!(ConfigOverrides),
        ),
        (
            "settings",
            "video-overrides-update.json",
            schema_for!(VideoOverridesUpdate),
        ),
        (
            "settings",
            "effective-config.json",
            schema_for!(EffectiveConfig),
        ),
        (
            "settings",
            "general-defaults.json",
            schema_for!(GeneralDefaults),
        ),
        // Project: the project document, its summary, the templates it starts from, and the
        // retained work a project-level configuration write can invalidate.
        (
            "project",
            "chunk-invalidation-reason.json",
            schema_for!(ChunkInvalidationReason),
        ),
        (
            "project",
            "project-chunk-impact.json",
            schema_for!(ProjectChunkImpact),
        ),
        (
            "project",
            "project-chunk-scene.json",
            schema_for!(ProjectChunkScene),
        ),
        (
            "project",
            "project-create-request.json",
            schema_for!(ProjectCreateRequest),
        ),
        (
            "project",
            "project-defaults-state.json",
            schema_for!(ProjectDefaultsState),
        ),
        (
            "project",
            "project-summary.json",
            schema_for!(ProjectSummary),
        ),
        (
            "project",
            "project-template-applied.json",
            schema_for!(ProjectTemplateApplied),
        ),
        (
            "project",
            "project-template-archive-kind.json",
            schema_for!(ProjectTemplateArchiveKind),
        ),
        (
            "project",
            "project-template-archive-template.json",
            schema_for!(ProjectTemplateArchiveTemplate),
        ),
        (
            "project",
            "project-template-archive.json",
            schema_for!(ProjectTemplateArchive),
        ),
        (
            "project",
            "project-template-apply-request.json",
            schema_for!(ProjectTemplateApplyRequest),
        ),
        (
            "project",
            "project-template-create-request.json",
            schema_for!(ProjectTemplateCreateRequest),
        ),
        (
            "project",
            "project-template-default-request.json",
            schema_for!(ProjectTemplateDefaultRequest),
        ),
        (
            "project",
            "project-template-export-report.json",
            schema_for!(ProjectTemplateExportReport),
        ),
        (
            "project",
            "project-template-export.json",
            schema_for!(ProjectTemplateExport),
        ),
        (
            "project",
            "project-template-import-result.json",
            schema_for!(ProjectTemplateImportResult),
        ),
        (
            "project",
            "project-template-update.json",
            schema_for!(ProjectTemplateUpdate),
        ),
        (
            "project",
            "project-template.json",
            schema_for!(ProjectTemplate),
        ),
        (
            "project",
            "project-update-request.json",
            schema_for!(ProjectUpdateRequest),
        ),
        ("project", "project.json", schema_for!(Project)),
        // Video: the queued source, its derived documents, concat inventory and thumbnails.
        (
            "video",
            "audio-track-list.json",
            schema_for!(AudioTrackList),
        ),
        ("video", "audio-track.json", schema_for!(AudioTrack)),
        ("video", "clip-details.json", schema_for!(ClipDetails)),
        ("video", "concat-chapter.json", schema_for!(ConcatChapter)),
        (
            "video",
            "concat-inventory-request.json",
            schema_for!(ConcatInventoryRequest),
        ),
        (
            "video",
            "concat-inventory.json",
            schema_for!(ConcatInventory),
        ),
        (
            "video",
            "concat-metadata-entry.json",
            schema_for!(ConcatMetadataEntry),
        ),
        (
            "video",
            "concat-method-name.json",
            schema_for!(ConcatMethodName),
        ),
        (
            "video",
            "concat-source-attachment.json",
            schema_for!(ConcatSourceAttachment),
        ),
        (
            "video",
            "concat-source-info.json",
            schema_for!(ConcatSourceInfo),
        ),
        (
            "video",
            "concat-source-track.json",
            schema_for!(ConcatSourceTrack),
        ),
        (
            "video",
            "concat-track-kind.json",
            schema_for!(ConcatTrackKind),
        ),
        (
            "video",
            "thumbnail-manifest.json",
            schema_for!(ThumbnailManifest),
        ),
        ("video", "thumbnail-state.json", schema_for!(ThumbnailState)),
        (
            "video",
            "video-create-request.json",
            schema_for!(VideoCreateRequest),
        ),
        ("video", "video-detail.json", schema_for!(VideoDetail)),
        ("video", "video-failure.json", schema_for!(VideoFailure)),
        (
            "video",
            "video-general-request.json",
            schema_for!(VideoGeneralRequest),
        ),
        ("video", "video-general.json", schema_for!(VideoGeneral)),
        ("video", "video-history.json", schema_for!(VideoHistory)),
        (
            "video",
            "video-probe-request.json",
            schema_for!(VideoProbeRequest),
        ),
        ("video", "video-probe.json", schema_for!(VideoProbe)),
        (
            "video",
            "video-remove-request.json",
            schema_for!(VideoRemoveRequest),
        ),
        ("video", "video-state.json", schema_for!(VideoState)),
        (
            "video",
            "video-storage-request.json",
            schema_for!(VideoStorageRequest),
        ),
        ("video", "video-storage.json", schema_for!(VideoStorage)),
        ("video", "video-summary.json", schema_for!(VideoSummary)),
        (
            "video",
            "video-validation.json",
            schema_for!(VideoValidation),
        ),
        // Scene: lists and views, ranges, and the per-scene encoder detail.
        (
            "scene",
            "scene-data-request.json",
            schema_for!(SceneDataRequest),
        ),
        (
            "scene",
            "scene-encoder-detail.json",
            schema_for!(SceneEncoderDetail),
        ),
        (
            "scene",
            "scene-encoder-request.json",
            schema_for!(SceneEncoderRequest),
        ),
        ("scene", "scene-list.json", schema_for!(SceneList)),
        (
            "scene",
            "scene-model-update.json",
            schema_for!(SceneModelUpdate),
        ),
        (
            "scene",
            "scene-range-request.json",
            schema_for!(SceneRangeRequest),
        ),
        ("scene", "scene-view.json", schema_for!(SceneView)),
        // Queue: batch execution and the order of the queued videos.
        (
            "queue",
            "queue-batch-request.json",
            schema_for!(QueueBatchRequest),
        ),
        (
            "queue",
            "queue-batch-status.json",
            schema_for!(QueueBatchStatus),
        ),
        (
            "queue",
            "video-order-request.json",
            schema_for!(VideoOrderRequest),
        ),
        // Run: run and sequence records, progress events, and the execution timeline.
        ("run", "encode-event.json", schema_for!(EncodeEvent)),
        ("run", "run-outcome.json", schema_for!(RunOutcome)),
        ("run", "run-started.json", schema_for!(RunStarted)),
        ("run", "run-summary.json", schema_for!(RunSummary)),
        (
            "run",
            "sequence-descriptor.json",
            schema_for!(SequenceDescriptor),
        ),
        (
            "run",
            "sequence-run-request.json",
            schema_for!(SequenceRunRequest),
        ),
        (
            "run",
            "sequence-run-status.json",
            schema_for!(SequenceRunStatus),
        ),
        ("run", "sequence-state.json", schema_for!(SequenceState)),
        ("run", "timeline-record.json", schema_for!(TimelineRecord)),
        // Encoder: definitions, forks, parameters, preflight, tools and interpreters.
        (
            "encoder",
            "custom-tool-request.json",
            schema_for!(CustomToolRequest),
        ),
        ("encoder", "custom-tool.json", schema_for!(CustomTool)),
        (
            "encoder",
            "encoder-definition.schema.json",
            schema_for!(EncoderDefinition),
        ),
        (
            "encoder",
            "encoder-descriptor.json",
            schema_for!(EncoderDescriptor),
        ),
        (
            "encoder",
            "encoder-fork-probe.json",
            schema_for!(EncoderForkProbe),
        ),
        (
            "encoder",
            "encoder-fork-request.json",
            schema_for!(EncoderForkRequest),
        ),
        (
            "encoder",
            "encoder-fork-update.json",
            schema_for!(EncoderForkUpdate),
        ),
        ("encoder", "encoder-fork.json", schema_for!(EncoderFork)),
        (
            "encoder",
            "encoder-parameter-override.json",
            schema_for!(EncoderParameterOverride),
        ),
        (
            "encoder",
            "encoder-parameters-update.json",
            schema_for!(EncoderParametersUpdate),
        ),
        ("encoder", "filter-schemas.json", schema_for!(FilterSchemas)),
        (
            "encoder",
            "parameter-descriptor.json",
            schema_for!(ParameterDescriptor),
        ),
        ("encoder", "parameter-key.json", schema_for!(ParameterKey)),
        ("encoder", "parameter-kind.json", schema_for!(ParameterKind)),
        (
            "encoder",
            "parameter-value.json",
            schema_for!(ParameterValue),
        ),
        (
            "encoder",
            "preflight-report.json",
            schema_for!(PreflightReport),
        ),
        (
            "encoder",
            "python-interpreter-update.json",
            schema_for!(PythonInterpreterUpdate),
        ),
        (
            "encoder",
            "python-interpreter.json",
            schema_for!(PythonInterpreter),
        ),
        (
            "encoder",
            "python-interpreters.json",
            schema_for!(PythonInterpreters),
        ),
        (
            "encoder",
            "tool-source-update.json",
            schema_for!(ToolSourceUpdate),
        ),
        ("encoder", "widget.json", schema_for!(Widget)),
        // Script: documents, checks, materialised data, and the language server.
        (
            "script",
            "language-server-info.json",
            schema_for!(LanguageServerInfo),
        ),
        (
            "script",
            "script-check-request.json",
            schema_for!(ScriptCheckRequest),
        ),
        (
            "script",
            "script-check-status.json",
            schema_for!(ScriptCheckStatus),
        ),
        ("script", "script-check.json", schema_for!(ScriptCheck)),
        ("script", "script-clip.json", schema_for!(ScriptClip)),
        (
            "script",
            "script-data-format.json",
            schema_for!(ScriptDataFormat),
        ),
        ("script", "script-data-key.json", schema_for!(ScriptDataKey)),
        ("script", "script-data.json", schema_for!(ScriptData)),
        ("script", "script-guide.json", schema_for!(ScriptGuide)),
        (
            "script",
            "script-materialise-request.json",
            schema_for!(ScriptMaterialiseRequest),
        ),
        (
            "script",
            "script-materialised-variable.json",
            schema_for!(ScriptMaterialisedVariable),
        ),
        (
            "script",
            "script-materialised.json",
            schema_for!(ScriptMaterialised),
        ),
        (
            "script",
            "script-plugin-report.json",
            schema_for!(ScriptPluginReport),
        ),
        (
            "script",
            "script-value-format.json",
            schema_for!(ScriptValueFormat),
        ),
        (
            "script",
            "vapour-synth-importer.json",
            schema_for!(VapourSynthImporter),
        ),
        // Protocol: shapes shared by every feature rather than owned by one.
        ("protocol", "error-body.json", schema_for!(ErrorBody)),
        ("protocol", "event-ticket.json", schema_for!(EventTicket)),
        ("protocol", "input-kind.json", schema_for!(InputKind)),
        ("protocol", "media-ticket.json", schema_for!(MediaTicket)),
        ("protocol", "output-mode.json", schema_for!(OutputMode)),
    ];

    let mut drifted = false;
    let mut emitted = HashSet::new();
    for (group, name, schema) in &schemas {
        let directory = output.join(group);
        if let Err(error) = fs::create_dir_all(&directory) {
            eprintln!("could not create {}: {error}", directory.display());
            return ExitCode::FAILURE;
        }
        let rendered = match serde_json::to_string_pretty(schema) {
            Ok(rendered) => format!("{rendered}\n"),
            Err(error) => {
                eprintln!("could not render {name}: {error}");
                return ExitCode::FAILURE;
            }
        };
        let path = directory.join(name);
        emitted.insert(format!("{group}/{name}"));
        if check {
            match fs::read_to_string(&path) {
                Ok(existing) if existing == rendered => {}
                Ok(_) => {
                    eprintln!("schema drift: {}", path.display());
                    drifted = true;
                }
                Err(error) => {
                    eprintln!("missing schema {}: {error}", path.display());
                    drifted = true;
                }
            }
        } else if let Err(error) = fs::write(&path, rendered) {
            eprintln!("could not write {}: {error}", path.display());
            return ExitCode::FAILURE;
        }
    }

    if check || prune {
        match prune_stale(&output, &emitted, check) {
            Ok(stale) => drifted |= stale,
            Err(error) => {
                eprintln!("{error}");
                return ExitCode::FAILURE;
            }
        }
    }

    if drifted {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}

/// Remove, or report in check mode, every JSON document the current entries do not emit.
///
/// Only immediate `*.json` files and the JSON inside immediate subdirectories are touched;
/// `schema/routes/` belongs to the route emitter, and any non-JSON file is left alone.
fn prune_stale(output: &Path, emitted: &HashSet<String>, check: bool) -> Result<bool, String> {
    let entries = fs::read_dir(output)
        .map_err(|error| format!("could not read {}: {error}", output.display()))?;
    let mut failed = false;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() {
            if name == "routes" {
                continue;
            }
            let children = match fs::read_dir(&path) {
                Ok(children) => children,
                Err(error) => {
                    eprintln!("could not read {}: {error}", path.display());
                    failed = true;
                    continue;
                }
            };
            let mut empty = true;
            for child in children.flatten() {
                let child_path = child.path();
                let child_name = child.file_name().to_string_lossy().into_owned();
                if !child_path.is_file() || !child_name.ends_with(".json") {
                    empty = false;
                    continue;
                }
                if emitted.contains(&format!("{name}/{child_name}")) {
                    empty = false;
                    continue;
                }
                if check {
                    eprintln!("stale schema: {}", child_path.display());
                    failed = true;
                } else if let Err(error) = fs::remove_file(&child_path) {
                    eprintln!("could not remove {}: {error}", child_path.display());
                    failed = true;
                }
            }
            if empty && !check {
                let _ = fs::remove_dir(&path);
            }
        } else if name.ends_with(".json") && !emitted.contains(&name) {
            // The pre-grouping layout wrote every document at the top level; a stale one is
            // still a stale schema.
            if check {
                eprintln!("stale schema: {}", path.display());
                failed = true;
            } else if let Err(error) = fs::remove_file(&path) {
                eprintln!("could not remove {}: {error}", path.display());
                failed = true;
            }
        }
    }
    Ok(failed)
}
