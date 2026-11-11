use std::{
    collections::BTreeMap,
    path::{Path as FsPath, PathBuf},
};

use av1ation_contracts::protocol::{ErrorCode, InputKind, OutputMode};
use av1ation_contracts::queue::VideoOrderRequest;
use av1ation_contracts::scene::{SceneEncoderDetail, SceneEncoderRequest};
use av1ation_contracts::script::ScriptInputMode;
use av1ation_contracts::settings::{ConfigOverrides, GeneralDefaults};
use av1ation_contracts::video::{
    ClipDetails, VideoCreateRequest, VideoFailure, VideoGeneral, VideoGeneralRequest, VideoHistory,
    VideoProbe, VideoProbeRequest, VideoRemoveRequest, VideoStorage, VideoStorageRequest,
    VideoValidation,
};
use av1ation_engine::capability::catalogue;
use axum::{
    Json,
    extract::{Path as AxumPath, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::Value;

use super::{locked, no_storage, project_error, project_not_found, run_locked, video_not_found};
use crate::{
    api::error::error_response,
    platform::disk,
    project::derive::{self, Evidence},
    project::projects::{StoreError, default_config},
    project::videos::input_path_of,
    script::script_data::{self, ScriptInput},
    state::AppState,
};

mod document;
mod queue;
mod state;

pub(crate) use document::*;
pub(crate) use queue::*;
pub(crate) use state::*;
