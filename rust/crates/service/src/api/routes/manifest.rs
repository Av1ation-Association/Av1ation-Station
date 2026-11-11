//! The one route vocabulary: handler registration, client builders, and the docs table.
//!
//! Each group names a path exactly once. Its methods carry the handler, the module that
//! defines it, and the sentence shown in `docs/backend.md`. The generated client and docs
//! are checked by `npm run routes:check`; do not edit either by hand.

use axum::Router;
use axum::routing::{delete, get, patch, post, put};
use serde::Serialize;

use super::{encoders, lan, logging, project, run, scenes, script, settings, system, video};

/// One path and every method registered on it.
#[derive(Serialize)]
pub(super) struct RouteGroup {
    pub(super) id: &'static str,
    pub(super) path: &'static str,
    pub(super) methods: &'static [RouteMethod],
}

/// One method on a path, with the module that defines its handler.
#[derive(Serialize)]
pub(super) struct RouteMethod {
    pub(super) method: &'static str,
    pub(super) handler: &'static str,
    pub(super) owner: &'static str,
    pub(super) purpose: &'static str,
}

macro_rules! method_name {
    (get) => {
        "GET"
    };
    (post) => {
        "POST"
    };
    (put) => {
        "PUT"
    };
    (patch) => {
        "PATCH"
    };
    (delete) => {
        "DELETE"
    };
    (head) => {
        "HEAD"
    };
}

macro_rules! route_methods {
    ($method:ident => $handler:path) => {
        $method($handler)
    };
    ($method:ident => $handler:path, $($rest_method:ident => $rest_handler:path),+ $(,)?) => {
        $method($handler).merge(route_methods!($($rest_method => $rest_handler),+))
    };
}

macro_rules! routes {
    ($($id:literal => {
        path: $path:literal,
        methods: {
            $($method:ident => ($handler:path, $owner:literal, $purpose:literal)),+ $(,)?
        },
    }),+ $(,)?) => {
        pub(super) fn routes() -> Router<crate::state::AppState> {
            Router::new()
            $(
                .route($path, route_methods!($($method => $handler),+))
            )+
        }

        pub(super) static ROUTES: &[RouteGroup] = &[
            $(
                RouteGroup {
                    id: $id,
                    path: $path,
                    methods: &[
                        $(
                            RouteMethod {
                                method: method_name!($method),
                                handler: stringify!($handler),
                                owner: $owner,
                                purpose: $purpose,
                            },
                        )+
                    ],
                },
            )+
        ];
    };
}

routes! {
    "health" => {
        path: "/api/health",
        methods: {
            get => (system::health, "api::routes::system", "app and engine package versions, pinned engine revision, API version, and the cached preflight report"),
        },
    },
    "update" => {
        path: "/api/update",
        methods: {
            get => (system::check_for_update, "api::routes::system", "newest published release from the forge; a repository with none answers with no `latest`"),
        },
    },
    "diagnostics.bundle" => {
        path: "/api/diagnostics/bundle",
        methods: {
            get => (system::diagnostics_bundle, "api::routes::system", "redacted support bundle for the chosen `projects` and log tail; built on request, written nowhere"),
        },
    },
    "preflight.refresh" => {
        path: "/api/preflight/refresh",
        methods: {
            post => (system::refresh_preflight, "api::routes::system", "discard the cached report, probe again, and return the new report"),
        },
    },
    "preflight.custom" => {
        path: "/api/preflight/custom",
        methods: {
            post => (system::add_custom_preflight, "api::routes::system", "probe one user-provided executable and return its check (preflight.md §Custom executables)"),
        },
    },
    "preflight.custom.item" => {
        path: "/api/preflight/custom/{id}",
        methods: {
            delete => (system::remove_custom_preflight, "api::routes::system", "drop a user-provided executable and re-probe"),
        },
    },
    "script.materialise" => {
        path: "/api/script/materialise",
        methods: {
            post => (script::materialise_script, "api::routes::script", "render a script as a standalone `.vpy` with the generated module and injected values"),
        },
    },
    "settings" => {
        path: "/api/settings",
        methods: {
            get => (settings::get_settings, "api::routes::settings", "read the app settings document"),
            patch => (settings::patch_settings, "api::routes::settings", "replace only the settings fields the request presents"),
        },
    },
    "settings.scene-model" => {
        path: "/api/settings/scene-model",
        methods: {
            put => (settings::put_scene_model, "api::routes::settings", "the machine-level TransNetV2 ONNX path, or `null`"),
        },
    },
    "settings.python-interpreter" => {
        path: "/api/settings/python-interpreter",
        methods: {
            put => (settings::put_python_interpreter, "api::routes::settings", "the interpreter the script editor's language server analyses, or `null`"),
        },
    },
    "settings.tool-source" => {
        path: "/api/settings/tool-source",
        methods: {
            put => (settings::put_tool_source, "api::routes::settings", "one capability's provider, `bundled`, `system`, or `null` for automatic; a Bundled choice is refused when this install cannot resolve it"),
        },
    },
    "templates" => {
        path: "/api/settings/templates",
        methods: {
            get => (settings::list_project_templates, "api::routes::settings", "list the project templates"),
            post => (settings::add_project_template, "api::routes::settings", "create a project template seeded from the engine defaults"),
        },
    },
    "templates.default" => {
        path: "/api/settings/templates/default",
        methods: {
            put => (settings::set_default_project_template, "api::routes::settings", "set or clear the template a new project copies"),
        },
    },
    "template" => {
        path: "/api/settings/templates/{template_id}",
        methods: {
            put => (settings::update_project_template, "api::routes::settings", "replace a template's name, configuration, and General defaults"),
            delete => (settings::delete_project_template, "api::routes::settings", "delete a project template"),
        },
    },
    "template.defaults" => {
        path: "/api/settings/templates/{template_id}/defaults",
        methods: {
            get => (settings::get_template_defaults, "api::routes::settings", "read a template's effective configuration"),
            put => (settings::put_template_defaults, "api::routes::settings", "replace a template's configuration"),
        },
    },
    "template.defaults.reset" => {
        path: "/api/settings/templates/{template_id}/defaults/reset",
        methods: {
            post => (settings::reset_template_defaults, "api::routes::settings", "reset a template to the engine defaults"),
        },
    },
    "template.defaults.reset.section" => {
        path: "/api/settings/templates/{template_id}/defaults/reset/{section}",
        methods: {
            post => (settings::reset_template_defaults_section, "api::routes::settings", "reset one template section"),
        },
    },
    "template.general" => {
        path: "/api/settings/templates/{template_id}/general",
        methods: {
            get => (settings::get_template_general, "api::routes::settings", "read a template's General defaults"),
            put => (settings::put_template_general, "api::routes::settings", "replace a template's General defaults"),
        },
    },
    "template.scripts" => {
        path: "/api/settings/templates/{template_id}/scripts",
        methods: {
            get => (settings::get_template_scripts, "api::routes::settings", "VapourSynth plugin problems in a template's inputs"),
        },
    },
    "projects" => {
        path: "/api/projects",
        methods: {
            get => (project::list_projects, "api::routes::project", "project summaries (index)"),
            post => (project::create_project, "api::routes::project", "create from `name` (and optional `description`); copies the default project template, or the engine defaults when none is marked"),
        },
    },
    "projects.import" => {
        path: "/api/projects/import",
        methods: {
            post => (project::import_project, "api::routes::project", "import that archive as a new project; never reuses ids"),
        },
    },
    "project" => {
        path: "/api/projects/{project_id}",
        methods: {
            get => (project::get_project, "api::routes::project", "project detail"),
            patch => (project::patch_project, "api::routes::project", "rename, description"),
            delete => (project::delete_project, "api::routes::project", "delete (guarded if a run is active)"),
        },
    },
    "project.config" => {
        path: "/api/projects/{project_id}/config",
        methods: {
            get => (project::get_project_config, "api::routes::project", "effective config + provenance, **including the input and its script**"),
            put => (project::put_project_config, "api::routes::project", "replace project config"),
        },
    },
    "project.general" => {
        path: "/api/projects/{project_id}/general",
        methods: {
            put => (project::update_general, "api::routes::project", "replace the project's `GeneralDefaults`"),
        },
    },
    "project.template" => {
        path: "/api/projects/{project_id}/template",
        methods: {
            post => (project::apply_template, "api::routes::project", "apply a saved template to a project"),
        },
    },
    "project.defaults" => {
        path: "/api/projects/{project_id}/defaults",
        methods: {
            put => (project::restore_defaults, "api::routes::project", "restore a project configuration and General snapshot"),
        },
    },
    "project.scripts" => {
        path: "/api/projects/{project_id}/scripts",
        methods: {
            get => (project::project_scripts, "api::routes::project", "VapourSynth plugin problems in the project's General input and enabled sequence overrides"),
        },
    },
    "project.export" => {
        path: "/api/projects/{project_id}/export",
        methods: {
            get => (project::export_project, "api::routes::project", "portable JSON archive: configuration, queue, overrides, checkpoints"),
        },
    },
    "videos" => {
        path: "/api/projects/{project_id}/videos",
        methods: {
            get => (video::list_videos, "api::routes::video::queue", "queue"),
            post => (video::add_video, "api::routes::video::queue", "add one video from an input path"),
        },
    },
    "videos.order" => {
        path: "/api/projects/{project_id}/videos/order",
        methods: {
            patch => (video::reorder_videos, "api::routes::video::queue", "replace the queue order (`video_ids`)"),
        },
    },
    "videos.remove" => {
        path: "/api/projects/{project_id}/videos/remove",
        methods: {
            post => (video::remove_videos, "api::routes::video::queue", "remove several videos atomically"),
        },
    },
    "video" => {
        path: "/api/projects/{project_id}/videos/{video_id}",
        methods: {
            get => (video::get_video, "api::routes::video::document", "video detail: paths, output existence, retained bytes"),
            delete => (video::delete_video, "api::routes::video::queue", "remove one video"),
        },
    },
    "video.chunks" => {
        path: "/api/projects/{project_id}/videos/{video_id}/chunks",
        methods: {
            delete => (video::delete_video_chunks, "api::routes::video::queue", "delete retained chunks; `423` while that video encodes"),
        },
    },
    "video.runs.run" => {
        path: "/api/projects/{project_id}/videos/{video_id}/runs/{run_id}",
        methods: {
            delete => (logging::delete_video_run, "api::routes::logging", "forget one run's timeline entries and log directory"),
        },
    },
    "video.config" => {
        path: "/api/projects/{project_id}/videos/{video_id}/config",
        methods: {
            get => (video::get_video_config, "api::routes::video::document", "effective config + provenance"),
        },
    },
    "video.general" => {
        path: "/api/projects/{project_id}/videos/{video_id}/general",
        methods: {
            get => (video::get_video_general, "api::routes::video::document", "the video's engine `Input` and `Output` documents and its queued source"),
            put => (video::put_video_general, "api::routes::video::document", "replace both documents after validating paths and engine shapes"),
        },
    },
    "video.storage" => {
        path: "/api/projects/{project_id}/videos/{video_id}/storage",
        methods: {
            get => (video::get_video_storage, "api::routes::video::document", "its scratch directory, the inherited root, retained bytes, and the volume's free and total space"),
            put => (video::put_video_storage, "api::routes::video::document", "point the scratch work at a directory of its own, or `null` to inherit; `409` while chunks are retained"),
        },
    },
    "video.history" => {
        path: "/api/projects/{project_id}/videos/{video_id}/history",
        methods: {
            get => (video::get_video_history, "api::routes::video::document", "the append-only timeline entries, oldest first"),
        },
    },
    "video.media" => {
        path: "/api/projects/{project_id}/videos/{video_id}/media",
        methods: {
            get => (crate::media::stream::get_video_media, "media::stream", "byte-range stream of `source=original`, `decoded` (lossless H.264 MP4 from `frame=N`, for `frames=W` or to the end when omitted), or `encode` (a `scene=S` chunk); `encode_from=original` selects the encode's input; `audio=N` serves a cached audio-only extraction of the original source; `206` for a range, `416` when it cannot be satisfied"),
        },
    },
    "video.frame" => {
        path: "/api/projects/{project_id}/videos/{video_id}/frame",
        methods: {
            get => (crate::media::stream::get_video_frame, "media::stream", "one lossless PNG of `source=decoded&frame=N`, for scrubbing without a stream build"),
        },
    },
    "video.audio-tracks" => {
        path: "/api/projects/{project_id}/videos/{video_id}/audio-tracks",
        methods: {
            get => (crate::media::stream::get_video_audio_tracks, "media::stream", "the source's audio streams as labels, language, codec, channels, and default flag, read from the container header"),
        },
    },
    "video.concat-inventory" => {
        path: "/api/projects/{project_id}/videos/{video_id}/concat-inventory",
        methods: {
            post => (crate::media::stream::get_video_concat_inventory, "media::stream::concat", "read one concatenation input's streams"),
        },
    },
    "video.concat-source-info" => {
        path: "/api/projects/{project_id}/videos/{video_id}/concat-source-info",
        methods: {
            post => (crate::media::stream::get_video_concat_source_info, "media::stream::concat", "read the source's chapters and global metadata"),
        },
    },
    "video.thumbnails" => {
        path: "/api/projects/{project_id}/videos/{video_id}/thumbnails",
        methods: {
            get => (crate::media::thumbnails::get_thumbnails, "media::thumbnails", "read the keyframe grid manifest"),
        },
    },
    "video.thumbnail" => {
        path: "/api/projects/{project_id}/videos/{video_id}/thumbnails/{index}",
        methods: {
            get => (crate::media::thumbnails::get_thumbnail, "media::thumbnails", "serve one cached thumbnail"),
        },
    },
    "video.probe" => {
        path: "/api/projects/{project_id}/videos/{video_id}/probe",
        methods: {
            post => (video::probe_video, "api::routes::video::document", "open the decode graph and return clip geometry, timing, pixel format and colour, or the reason it could not open; a script input is evaluated with its generated module and the reserved `condor_*` values, exactly as a run would"),
        },
    },
    "video.overrides" => {
        path: "/api/projects/{project_id}/videos/{video_id}/overrides",
        methods: {
            get => (video::get_video_overrides, "api::routes::video::document", "the raw sparse override map"),
            put => (video::put_video_overrides, "api::routes::video::document", "replace overrides; each path is a leaf or a whole `encoder`/`sequences.<key>` section"),
            delete => (video::delete_video_overrides, "api::routes::video::document", "reset to inherited"),
        },
    },
    "video.state" => {
        path: "/api/projects/{project_id}/videos/{video_id}/state",
        methods: {
            get => (video::video_state, "api::routes::video::state", "derived phases and the `script_data` documentation view"),
        },
    },
    "video.scenes" => {
        path: "/api/projects/{project_id}/videos/{video_id}/scenes",
        methods: {
            get => (video::get_video_scenes, "api::routes::video::state", "one row per scene: frame range, final Target Quality pass, retained chunk bytes, encoder label and override provenance"),
        },
    },
    "video.scenes.encoders" => {
        path: "/api/projects/{project_id}/videos/{video_id}/scenes/encoder",
        methods: {
            put => (video::put_scene_encoders, "api::routes::video::state", "write one encoder document to named scenes; rejects the whole request if any index is stale or a run holds the lock"),
        },
    },
    "video.scenes.add" => {
        path: "/api/projects/{project_id}/videos/{video_id}/scenes/add",
        methods: {
            post => (scenes::add_scene, "api::routes::scenes", "insert a scene in an uncovered `start_frame`–`end_frame` range; clears chunks because later indices move"),
        },
    },
    "video.scenes.split" => {
        path: "/api/projects/{project_id}/videos/{video_id}/scenes/split",
        methods: {
            post => (scenes::split_scene, "api::routes::scenes", "split the scene containing `frame`; clears chunks because later indices move"),
        },
    },
    "video.scenes.merge" => {
        path: "/api/projects/{project_id}/videos/{video_id}/scenes/merge",
        methods: {
            post => (scenes::merge_scenes, "api::routes::scenes", "merge an adjacent scene selection; clears chunks"),
        },
    },
    "video.scenes.reset" => {
        path: "/api/projects/{project_id}/videos/{video_id}/scenes/reset",
        methods: {
            post => (scenes::reset_scenes, "api::routes::scenes", "delete the selected scenes' retained chunks only"),
        },
    },
    "video.scenes.undo" => {
        path: "/api/projects/{project_id}/videos/{video_id}/scenes/undo",
        methods: {
            post => (scenes::undo_scene_edit, "api::routes::scenes", "restore the scene table before the last structural edit"),
        },
    },
    "video.scene" => {
        path: "/api/projects/{project_id}/videos/{video_id}/scenes/{index}",
        methods: {
            patch => (scenes::set_scene_range, "api::routes::scenes", "change one scene's boundaries"),
            delete => (scenes::delete_scene, "api::routes::scenes", "delete one scene"),
        },
    },
    "video.scene.encoder" => {
        path: "/api/projects/{project_id}/videos/{video_id}/scenes/{index}/encoder",
        methods: {
            get => (video::get_scene_encoder, "api::routes::video::state", "one scene's complete encoder document, for the details sheet"),
        },
    },
    "video.scene.sequence-data" => {
        path: "/api/projects/{project_id}/videos/{video_id}/scenes/{index}/sequence-data",
        methods: {
            put => (scenes::set_scene_data, "api::routes::scenes", "replace one scene's custom sequence data"),
        },
    },
    "video.validate" => {
        path: "/api/projects/{project_id}/videos/{video_id}/validate",
        methods: {
            post => (video::validate_video, "api::routes::video::state", "preflight for one video, including missing VapourSynth plugin namespaces"),
        },
    },
    "video.run" => {
        path: "/api/projects/{project_id}/videos/{video_id}/run",
        methods: {
            post => (run::start_sequence, "api::routes::run", "**run one sequence** (body: sequence id)"),
        },
    },
    "video.encode" => {
        path: "/api/projects/{project_id}/videos/{video_id}/encode",
        methods: {
            post => (run::start_encode, "api::routes::run", "**run all sequences** (409 if busy)"),
            delete => (run::cancel_encode, "api::routes::run", "cancel"),
        },
    },
    "video.sequence.reset" => {
        path: "/api/projects/{project_id}/videos/{video_id}/sequences/{sequence}/reset",
        methods: {
            post => (run::reset_sequence, "api::routes::run", "clear one sequence's derived data and scratch files; `422` when it has not run, `423` while the lock is held"),
        },
    },
    "video.runs" => {
        path: "/api/projects/{project_id}/videos/{video_id}/runs",
        methods: {
            get => (logging::video_runs, "api::routes::logging", "every run that has a log, newest first, joined to its timeline outcome"),
        },
    },
    "queue" => {
        path: "/api/projects/{project_id}/queue",
        methods: {
            get => (run::get_queue_batch, "api::routes::run", "the queue batch: running state, current video, and stop reason"),
            post => (run::start_queue_batch, "api::routes::run", "start the batch named by `video_ids`, in that order; `409` when a run already owns the singleton"),
            delete => (run::stop_queue_batch, "api::routes::run", "stop the batch and cancel its active run; `404` when none is running"),
        },
    },
    "encoders" => {
        path: "/api/encoders",
        methods: {
            get => (encoders::list_encoders, "api::routes::encoders", "encoder catalogue + parameter descriptors"),
        },
    },
    "encoders.probe" => {
        path: "/api/encoders/probe",
        methods: {
            post => (encoders::probe_encoder_fork, "api::routes::encoders", "probe one build as a fork of a base encoder without saving (preflight.md §Custom encoder definitions)"),
        },
    },
    "encoders.forks" => {
        path: "/api/encoders/forks",
        methods: {
            post => (encoders::create_encoder_fork, "api::routes::encoders", "save a probed encoder fork"),
        },
    },
    "encoder.fork" => {
        path: "/api/encoders/forks/{id}",
        methods: {
            put => (encoders::update_encoder_fork, "api::routes::encoders", "replace a fork's name, path, or parameter map"),
            delete => (encoders::delete_encoder_fork, "api::routes::encoders", "drop a saved fork"),
        },
    },
    "encoder.parameters" => {
        path: "/api/encoders/{id}/parameters",
        methods: {
            put => (encoders::put_encoder_parameters, "api::routes::encoders", "replace one built-in encoder's descriptor set"),
            delete => (encoders::delete_encoder_parameters, "api::routes::encoders", "restore the engine's descriptors for one built-in encoder"),
        },
    },
    "storage" => {
        path: "/api/storage",
        methods: {
            get => (system::storage_overview, "api::routes::system", "retained work, scratch and app-data footprint, per-project rows"),
        },
    },
    "sequences" => {
        path: "/api/sequences",
        methods: {
            get => (system::list_sequences, "api::routes::system", "sequence catalogue + config schema"),
        },
    },
    "config.schema" => {
        path: "/api/config/schema",
        methods: {
            get => (script::config_schema, "api::routes::script", "the engine's configuration schema"),
        },
    },
    "config.filters" => {
        path: "/api/config/filters",
        methods: {
            get => (script::input_filter_schemas, "api::routes::script", "`Ffms2Filter` and `VapourSynthFilter` schemas"),
        },
    },
    "config.script-guide" => {
        path: "/api/config/script-guide",
        methods: {
            get => (script::script_guide, "api::routes::script", "the script-guide document"),
        },
    },
    "editor.language-server" => {
        path: "/api/editor/language-server",
        methods: {
            get => (script::language_server_info, "api::routes::script", "whether a Python language server is available"),
        },
    },
    "editor.interpreters" => {
        path: "/api/editor/interpreters",
        methods: {
            get => (script::python_interpreters, "api::routes::script", "every Python interpreter the settings picker can offer"),
        },
    },
    "editor.lsp" => {
        path: "/api/editor/lsp",
        methods: {
            get => (script::language_server_socket, "api::routes::script", "WebSocket bridge to that language server"),
        },
    },
    "config.scripts.validate" => {
        path: "/api/config/scripts/validate",
        methods: {
            post => (script::validate_script, "api::routes::script", "validate one VapourSynth script and return its outcome"),
        },
    },
    "run" => {
        path: "/api/runs/{run_id}",
        methods: {
            delete => (run::cancel_run, "api::routes::run", "cancel that run"),
        },
    },
    "run.events" => {
        path: "/api/runs/{run_id}/events",
        methods: {
            get => (run::replay_events, "api::routes::run", "event replay from `seq`"),
        },
    },
    "run.logs" => {
        path: "/api/runs/{run_id}/logs",
        methods: {
            get => (logging::run_logs, "api::routes::logging", "log page: `offset` or `tail=true`, plus `level` and `q`; filtering happens before slicing, so `total` is the match count"),
            delete => (logging::delete_run_log, "api::routes::logging", "remove the log directory; `409 BUSY` while that run is live, `404` when it is already gone. History keeps the run's record"),
        },
    },
    "run.logs.export" => {
        path: "/api/runs/{run_id}/logs/export",
        methods: {
            post => (logging::export_logs, "api::routes::logging", "anonymised export"),
        },
    },
    "events" => {
        path: "/api/events",
        methods: {
            get => (run::events, "api::routes::run", "SSE stream; `since` or `Last-Event-ID` replays from a sequence cursor"),
        },
    },
    "events.ticket" => {
        path: "/api/events/ticket",
        methods: {
            post => (lan::event_ticket, "api::routes::lan", "one-use streaming ticket for SSE or the editor WebSocket on a LAN session; loopback streams need none"),
        },
    },
    "media.ticket" => {
        path: "/api/media/ticket",
        methods: {
            post => (lan::media_ticket, "api::routes::lan", "mint a one-use media credential for a paired LAN session"),
        },
    },
    "pair" => {
        path: "/api/pair",
        methods: {
            post => (lan::pair_browser, "api::routes::lan", "exchange an eight-character pairing code for its session token; no bearer token, same-origin only, `401` for every invalid code, `429` with `Retry-After` after five failures from one peer in a minute"),
        },
    },
    "lan" => {
        path: "/api/lan",
        methods: {
            get => (lan::lan_status, "api::routes::lan", "LAN status, bound address, and paired sessions with their tokens and shortcodes"),
        },
    },
    "lan.enable" => {
        path: "/api/lan/enable",
        methods: {
            post => (lan::enable_lan, "api::routes::lan", "start the LAN listener"),
        },
    },
    "lan.disable" => {
        path: "/api/lan/disable",
        methods: {
            post => (lan::disable_lan, "api::routes::lan", "stop the LAN listener"),
        },
    },
    "lan.rotate" => {
        path: "/api/lan/rotate",
        methods: {
            post => (lan::rotate_lan, "api::routes::lan", "issue another pairing token; existing sessions remain until revoked"),
        },
    },
    "lan.session.revoke" => {
        path: "/api/lan/sessions/{session_id}/revoke",
        methods: {
            post => (lan::revoke_lan_session, "api::routes::lan", "revoke one paired browser"),
        },
    },
}
