use std::{collections::BTreeMap, path::PathBuf, sync::Arc, time::Duration};

use av1ation_contracts::API_VERSION;
use av1ation_contracts::encoder::{
    EncoderFork, EncoderParameterOverride, PreflightCheck, PreflightReport,
};
use av1ation_contracts::platform::{AppInfo, StorageOverview};
use av1ation_contracts::settings::{AppSettings, AppSettingsUpdate};
use av1ation_engine::{
    ENGINE_REVISION, ENGINE_VERSION, EncodeRunner, FakeRunner,
    capability::preflight::{Probe, ToolFamily},
    script::plugins::PluginLookup,
};

use crate::{
    api::lan::LanController,
    capability::preflight::PreflightCache,
    media::{stream::PreviewBuilds, thumbnails::ThumbnailBuilds},
    platform::disk::DiskProbe,
    project::{projects::ProjectStore, settings::SettingsStore, videos::VideoStore},
    run::{logs::LogStore, runs::RunSupervisor, timeline::TimelineStore},
};

/// State shared by every request: contracts metadata, run supervision, and the static
/// web root. Run lifecycle belongs to `RunSupervisor`, not to the request state.
#[derive(Clone)]
pub struct AppState {
    pub(crate) info: AppInfo,
    runs: RunSupervisor,
    preflight: PreflightCache,
    settings: Option<SettingsStore>,
    projects: Option<ProjectStore>,
    videos: Option<VideoStore>,
    timeline: Option<TimelineStore>,
    logs: Option<LogStore>,
    lan: LanController,
    pub(crate) disk: DiskProbe,
    pub(crate) web_root: Option<PathBuf>,
    /// The resolved app-data directory, when this host persists. Storage reads it to show
    /// where manifests and logs live and where the default scratch directory is.
    pub(crate) data_dir: Option<PathBuf>,
    /// The staged bundled toolchain (`<resource>/tools`), when this host has one. Its
    /// Python is the last interpreter candidate, so a machine with no system Python still
    /// starts the vendored language server; `None` leaves the host on system providers.
    pub(crate) tools_dir: Option<PathBuf>,
    /// Proxy builds that are still writing. Shared so two viewers of one source follow one
    /// decode and one encode instead of racing duplicates into the cache.
    preview_builds: PreviewBuilds,
    /// Keyframe extractions that are still writing. Shared so a cold rail starts one
    /// decoder, not one per mounted row.
    thumbnails: ThumbnailBuilds,
    /// The plugin table a script scan compares against. `None` asks the loaded VapourSynth
    /// core; tests supply a fixture table so a structured preflight result can be asserted
    /// without installing VapourSynth on the build machine.
    plugin_lookup: Option<Arc<PluginLookup>>,
}

/// The accepted custom executables, keyed by the family they replace.
///
/// The toolbin needs the path itself: a custom muxer is not on `PATH`, and the bundled link
/// would otherwise remain the program `which` resolves.
fn custom_paths(settings: &AppSettings) -> BTreeMap<String, PathBuf> {
    settings
        .custom_tools
        .iter()
        .map(|tool| (tool.kind.clone(), PathBuf::from(&tool.path)))
        .collect()
}

impl AppState {
    /// Build the Phase 1 state with the fake runner and an optional static web root.
    pub fn new(web_root: Option<PathBuf>) -> Self {
        Self::with_runner(web_root, Arc::new(FakeRunner))
    }

    /// Build state around an injected runner, so Phase 2 can supply the real engine while
    /// tests keep using `FakeRunner`. This host does not persist settings.
    pub fn with_runner(web_root: Option<PathBuf>, runner: Arc<dyn EncodeRunner>) -> Self {
        Self::with_settings(web_root, runner, None)
    }

    /// Build state that writes settings under the resolved app-data directory. The desktop
    /// host passes Tauri's app-data path; the headless binary passes `--data-dir` or
    /// `AV1ATION_DATA_DIR`.
    pub fn with_runner_and_data_dir(
        web_root: Option<PathBuf>,
        runner: Arc<dyn EncodeRunner>,
        data_dir: Option<PathBuf>,
    ) -> Self {
        Self::with_settings(web_root, runner, data_dir)
    }

    /// Build state with a fixed dependency inventory, so route tests never load the host's
    /// VapourSynth install or spawn encoder executables.
    pub fn with_runner_and_probes(
        web_root: Option<PathBuf>,
        runner: Arc<dyn EncodeRunner>,
        probes: Vec<Probe>,
    ) -> Self {
        Self::with_preflight(
            web_root,
            runner,
            PreflightCache::fixed(probes),
            None,
            None,
            None,
        )
    }

    /// Build state with a fixed inventory and a real data directory, for route tests that
    /// create projects without loading the host's toolchain.
    ///
    /// The fixed inventory still restores accepted custom tools from the seeded settings
    /// file, so the restart path is exercised without probing every installed encoder.
    pub fn with_runner_probes_and_data_dir(
        web_root: Option<PathBuf>,
        runner: Arc<dyn EncodeRunner>,
        probes: Vec<Probe>,
        data_dir: PathBuf,
    ) -> Self {
        let settings = SettingsStore::new(&data_dir);
        Self::with_preflight(
            web_root,
            runner,
            PreflightCache::fixed_with_settings(probes, settings.clone()),
            Some(settings),
            Some(ProjectStore::new(&data_dir)),
            Some(data_dir),
        )
    }

    fn with_settings(
        web_root: Option<PathBuf>,
        runner: Arc<dyn EncodeRunner>,
        data_dir: Option<PathBuf>,
    ) -> Self {
        let settings = data_dir.as_ref().map(SettingsStore::new);
        let projects = data_dir.as_deref().map(ProjectStore::new);
        let preflight = PreflightCache::engine(settings.clone());
        Self::with_preflight(web_root, runner, preflight, settings, projects, data_dir)
    }

    fn with_preflight(
        web_root: Option<PathBuf>,
        runner: Arc<dyn EncodeRunner>,
        preflight: PreflightCache,
        settings: Option<SettingsStore>,
        projects: Option<ProjectStore>,
        data_dir: Option<PathBuf>,
    ) -> Self {
        let videos = data_dir.as_ref().map(VideoStore::new);
        let timeline = data_dir.as_ref().map(TimelineStore::new);
        let logs = data_dir.as_ref().map(LogStore::new);
        Self {
            info: AppInfo {
                name: "Av1ation Station".to_owned(),
                version: env!("CARGO_PKG_VERSION").to_owned(),
                engine_version: ENGINE_VERSION.to_owned(),
                engine_revision: ENGINE_REVISION.to_owned(),
                api_version: API_VERSION,
                preflight: PreflightReport::default(),
            },
            runs: RunSupervisor::new(
                runner,
                timeline.clone(),
                logs.clone(),
                videos.clone(),
                settings.clone(),
            ),
            preflight,
            settings,
            projects,
            videos,
            timeline,
            logs,
            lan: LanController::default(),
            disk: DiskProbe::system(),
            web_root,
            data_dir,
            tools_dir: None,
            preview_builds: PreviewBuilds::default(),
            thumbnails: ThumbnailBuilds::default(),
            plugin_lookup: None,
        }
    }

    /// Name the staged toolchain this host carries. A packaged install passes
    /// `<resource>/tools`; tests and hosts without a bundle leave it unset.
    pub fn with_tools_dir(mut self, tools_dir: Option<PathBuf>) -> Self {
        self.preflight = self.preflight.clone().with_tools_dir(tools_dir.clone());
        self.tools_dir = tools_dir;
        self
    }

    /// Point the process at the selected bundled providers before any probe runs.
    ///
    /// The metric libraries cache their loaded library for the life of the process, so the
    /// environment has to be right before the first preflight report. The toolbin links are
    /// safe to rewrite later; the metric choice needs a restart and this records the source
    /// this process actually applied.
    pub(crate) async fn hydrate_toolchain(&self) {
        let settings = self.settings().await;
        crate::capability::toolchain::apply_startup(
            self.tools_dir.as_deref(),
            self.data_dir.as_deref(),
            &settings.tool_sources,
            &custom_paths(&settings),
        );
        self.preflight
            .set_tool_sources(settings.tool_sources, true)
            .await;
    }

    /// Apply a newly saved provider map. Executable rows change immediately because the
    /// engine resolves them by name; metric and VapourSynth rows keep the process-wide
    /// choice until a restart and the cached report says so.
    pub(crate) async fn apply_tool_sources(&self) {
        let settings = self.settings().await;
        self.write_toolbin(&settings).await;
        self.preflight
            .set_tool_sources(settings.tool_sources, false)
            .await;
    }

    /// Re-link the accepted custom muxers without invalidating the provider report.
    ///
    /// Adding or removing a custom tool already updates the cached inventory; only the
    /// `PATH` shim it has to win over needs rewriting.
    pub(crate) async fn refresh_toolbin(&self) {
        let settings = self.settings().await;
        self.write_toolbin(&settings).await;
    }

    async fn write_toolbin(&self, settings: &AppSettings) {
        // Linking across volumes falls back to copying an executable, which is blocking
        // work and does not belong on an async executor thread.
        let tools_dir = self.tools_dir.clone();
        let data_dir = self.data_dir.clone();
        let sources = settings.tool_sources.clone();
        let customs = custom_paths(settings);
        if let Err(error) = tokio::task::spawn_blocking(move || {
            crate::capability::toolchain::apply_tool_sources(
                tools_dir.as_deref(),
                data_dir.as_deref(),
                &sources,
                &customs,
            );
        })
        .await
        {
            tracing::error!(%error, "the provider links could not be refreshed");
        }
    }

    /// The absolute encoder executable the selected provider needs, if it is not the one on
    /// `PATH`. A saved custom tool still wins, matching the preflight row's precedence.
    pub(crate) async fn encoder_executable(&self, encoder_name: &str) -> Option<PathBuf> {
        let family = crate::capability::toolchain::family_from_encoder_name(encoder_name)?;
        let settings = self.settings().await;
        if let Some(tool) = settings
            .custom_tools
            .iter()
            .find(|tool| tool.kind == family.as_str())
        {
            return Some(PathBuf::from(&tool.path));
        }
        let setting =
            crate::capability::toolchain::setting_id(&format!("encoder:{}", family.as_str()))?;
        if settings.tool_sources.get(&setting).map(String::as_str) == Some("system") {
            return None;
        }
        self.tools_dir
            .as_deref()
            .map(|tools| crate::capability::toolchain::binary_path(tools, family))
            .filter(|path| path.is_file())
    }

    /// Whether this install carries the bundled provider for one inventory row.
    pub(crate) fn bundled_tool_available(&self, check_id: &str) -> bool {
        crate::capability::toolchain::bundled_available(check_id, self.tools_dir.as_deref())
    }

    /// The in-flight preview builds, so a request can follow one instead of duplicating it.
    pub(crate) fn preview_builds(&self) -> &PreviewBuilds {
        &self.preview_builds
    }

    /// The in-flight keyframe extractions, so a cold rail starts one decoder.
    pub(crate) fn thumbnails(&self) -> &ThumbnailBuilds {
        &self.thumbnails
    }

    /// Replace the live VapourSynth plugin table for script scans.
    ///
    /// This is a test seam, not a setting: the production lookup reads the core this process
    /// loaded, while a route test needs a deterministic answer for a fixture script.
    pub fn with_plugin_lookup(mut self, lookup: Arc<PluginLookup>) -> Self {
        self.plugin_lookup = Some(lookup);
        self
    }

    /// The injected plugin table, or `None` to ask the live core.
    pub(crate) fn plugin_lookup(&self) -> Option<Arc<PluginLookup>> {
        self.plugin_lookup.clone()
    }

    /// The opt-in network listener. Loopback requests can read and change it; the network
    /// listener itself rejects the control routes.
    pub(crate) fn lan(&self) -> &LanController {
        &self.lan
    }

    /// Start LAN access and return the token a browser link needs.
    pub(crate) async fn enable_lan(
        &self,
    ) -> Result<av1ation_contracts::platform::LanStatus, String> {
        self.lan.enable(self.clone()).await
    }

    /// Stop LAN access without touching the loopback listener.
    pub(crate) async fn disable_lan(&self) {
        self.lan.disable().await;
    }

    /// Add a pairing token for another browser, leaving existing sessions valid.
    pub(crate) async fn rotate_lan_token(
        &self,
    ) -> Result<av1ation_contracts::platform::LanStatus, String> {
        self.lan.new_session().await
    }

    /// Revoke one paired browser.
    pub(crate) async fn revoke_lan_session(
        &self,
        id: &str,
    ) -> Result<av1ation_contracts::platform::LanStatus, String> {
        self.lan.revoke(id).await
    }

    /// A one-use ticket for the SSE stream. EventSource cannot send a header, so the LAN
    /// browser exchanges its token for this value first.
    pub(crate) async fn issue_event_ticket(&self) -> Option<String> {
        self.lan.issue_ticket().await
    }

    /// The repeatable media credential for the requesting paired session. A `<video>`
    /// cannot send a header either, but it makes many range requests, so its ticket lasts
    /// as long as the session that asked for it.
    pub(crate) async fn issue_media_ticket(
        &self,
        headers: &axum::http::HeaderMap,
    ) -> Option<String> {
        self.lan.issue_media_ticket(headers).await
    }

    /// Replace the free-space probe. Tests use this to exercise the `507` path without
    /// filling a real volume.
    pub fn with_fixed_free_space(mut self, bytes: u64) -> Self {
        self.disk = DiskProbe::fixed(bytes);
        self
    }

    pub(crate) fn runs(&self) -> &RunSupervisor {
        &self.runs
    }

    /// The cached dependency inventory used by `/api/health`.
    pub(crate) async fn preflight(&self) -> PreflightReport {
        self.preflight.report().await
    }

    /// Re-run the probes for the explicit "Run preflight" action.
    pub(crate) async fn refresh_preflight(&self) -> PreflightReport {
        self.preflight.refresh().await
    }

    /// Apply the saved VapourSynth provider before the first preflight probe.
    ///
    /// VSScript initialises once per process, so the choice is read here rather than on a
    /// request. A change becomes active only on the next start; the preflight row reports
    /// which provider this process actually loaded so Settings can say so.
    pub(crate) async fn hydrate_vapoursynth(&self) {
        let configured = match &self.settings {
            Some(store) => store
                .load()
                .await
                .tool_sources
                .get(crate::capability::vapoursynth::SETTING_ID)
                .cloned(),
            None => None,
        };
        let provider = crate::capability::vapoursynth::prepare(
            self.tools_dir.as_deref(),
            self.data_dir.as_deref(),
            configured.as_deref(),
        )
        .await;
        self.preflight.set_vapoursynth(provider).await;
    }

    /// Whether this install carries the bundled VapourSynth runtime.
    pub(crate) fn bundled_vapoursynth_available(&self) -> bool {
        crate::capability::vapoursynth::bundled_available(self.tools_dir.as_deref())
    }

    /// Load saved custom executables and re-probe them. `serve` calls this before the
    /// router starts accepting requests; tests call it to exercise the restart path.
    pub async fn hydrate_preflight(&self) {
        self.preflight.hydrate().await;
    }

    /// Re-probe every saved encoder build so its parameter map reflects the executable's
    /// current help. A saved fork stores the probe result, and without this a map recorded by
    /// an older app build keeps classifying options the parser has since learned to type.
    /// An executable that cannot be read now keeps its last good map.
    pub async fn hydrate_encoder_forks(&self) {
        let Some(store) = &self.settings else {
            return;
        };
        for mut fork in store.load().await.encoder_forks {
            // A map the user edited is not a probe result; refreshing it would discard the
            // work the sheet exists to do.
            if fork.parameters_edited {
                continue;
            }
            let base = fork.base.clone();
            let path = PathBuf::from(&fork.executable);
            let Ok(probe) =
                tokio::task::spawn_blocking(move || crate::capability::forks::probe(&base, &path))
                    .await
            else {
                continue;
            };
            if !probe.available || probe.parameters.is_empty() {
                continue;
            }
            if fork.parameters == probe.parameters && fork.version == probe.version {
                continue;
            }
            fork.parameters = probe.parameters;
            fork.version = probe.version;
            let id = fork.id.clone();
            if let Err(message) = self.set_encoder_fork(&id, Some(fork)).await {
                tracing::warn!(%message, "a saved encoder build could not be refreshed");
            }
        }
    }

    /// Apply a saved temporary-directory override before the first request. A settings file
    /// written by a previous run is otherwise not read until someone opens Settings, while
    /// validation and the script preview would still point at the app-data default.
    pub async fn hydrate_storage(&self) {
        if let (Some(settings), Some(videos)) = (&self.settings, &self.videos) {
            let settings = settings.load().await;
            videos.set_temp_root(settings.temp_dir.map(PathBuf::from));
        }
    }

    /// The project store, or `None` for a host that does not persist (tests, a throwaway
    /// headless run). Routes answer an empty list rather than failing in that case.
    pub(crate) fn projects(&self) -> Option<&ProjectStore> {
        self.projects.as_ref()
    }

    /// The video store, when this host persists videos.
    pub(crate) fn videos(&self) -> Option<&VideoStore> {
        self.videos.as_ref()
    }

    /// The timeline store, when this host persists run history.
    pub(crate) fn timeline(&self) -> Option<&TimelineStore> {
        self.timeline.as_ref()
    }

    /// The run-log store, when this host persists logs.
    pub(crate) fn logs(&self) -> Option<&LogStore> {
        self.logs.as_ref()
    }

    /// Read the shared settings document, or defaults when this host is not persistent.
    pub(crate) async fn settings(&self) -> AppSettings {
        match &self.settings {
            Some(store) => store.load().await,
            None => AppSettings::default(),
        }
    }

    /// Replace the writable settings fields. Custom tools stay owned by the preflight
    /// endpoints, which probe before writing.
    pub(crate) async fn update_settings(
        &self,
        update: &AppSettingsUpdate,
    ) -> Result<AppSettings, String> {
        let result = match &self.settings {
            Some(store) => store.update(update).await,
            None => Err("Settings persistence is disabled for this host.".to_owned()),
        };
        if let (Ok(settings), Some(videos)) = (&result, &self.videos) {
            videos.set_temp_root(settings.temp_dir.clone().map(PathBuf::from));
        }
        result
    }

    /// Add one project template seeded from the engine defaults.
    pub(crate) async fn add_template(
        &self,
        name: &str,
    ) -> Result<av1ation_contracts::project::ProjectTemplate, String> {
        match &self.settings {
            Some(store) => store.add_template(name).await,
            None => Err("Settings persistence is disabled for this host.".to_owned()),
        }
    }

    /// Replace one template's name, configuration, and General section.
    pub(crate) async fn update_template(
        &self,
        id: &str,
        name: &str,
        config: serde_json::Value,
        general: av1ation_contracts::settings::GeneralDefaults,
    ) -> Result<Option<av1ation_contracts::project::ProjectTemplate>, String> {
        match &self.settings {
            Some(store) => store.update_template(id, name, config, general).await,
            None => Err("Settings persistence is disabled for this host.".to_owned()),
        }
    }

    /// Replace only one template's engine configuration.
    pub(crate) async fn set_template_config(
        &self,
        id: &str,
        config: serde_json::Value,
    ) -> Result<Option<av1ation_contracts::project::ProjectTemplate>, String> {
        match &self.settings {
            Some(store) => store.set_template_config(id, config).await,
            None => Err("Settings persistence is disabled for this host.".to_owned()),
        }
    }

    /// Replace only one template's General section.
    pub(crate) async fn set_template_general(
        &self,
        id: &str,
        general: av1ation_contracts::settings::GeneralDefaults,
    ) -> Result<Option<av1ation_contracts::project::ProjectTemplate>, String> {
        match &self.settings {
            Some(store) => store.set_template_general(id, general).await,
            None => Err("Settings persistence is disabled for this host.".to_owned()),
        }
    }

    /// Remove one project template.
    pub(crate) async fn delete_template(&self, id: &str) -> Result<bool, String> {
        match &self.settings {
            Some(store) => store.delete_template(id).await,
            None => Err("Settings persistence is disabled for this host.".to_owned()),
        }
    }

    /// Mark the template a new project copies, or clear the mark.
    pub(crate) async fn set_default_template(
        &self,
        id: Option<&str>,
    ) -> Result<AppSettings, String> {
        match &self.settings {
            Some(store) => store.set_default_template(id).await,
            None => Err("Settings persistence is disabled for this host.".to_owned()),
        }
    }

    /// Replace the machine-level TransNetV2 model path. `None` restores the engine's own
    /// search order. The route validates the file before this runs.
    pub(crate) async fn set_scene_model(
        &self,
        path: Option<String>,
    ) -> Result<AppSettings, String> {
        match &self.settings {
            Some(store) => store.set_scene_model(path).await,
            None => Err("Settings persistence is disabled for this host.".to_owned()),
        }
    }

    /// Replace the interpreter the script editor's language server analyses. The route
    /// validates the file before this runs.
    pub(crate) async fn set_python_interpreter(
        &self,
        path: Option<String>,
    ) -> Result<AppSettings, String> {
        match &self.settings {
            Some(store) => store.set_python_interpreter(path).await,
            None => Err("Settings persistence is disabled for this host.".to_owned()),
        }
    }

    /// Replace one capability's provider choice. The route validates the id and source
    /// before this runs; VapourSynth applies the value on the next start.
    pub(crate) async fn set_tool_source(
        &self,
        id: &str,
        source: Option<String>,
    ) -> Result<AppSettings, String> {
        match &self.settings {
            Some(store) => store.set_tool_source(id, source).await,
            None => Err("Settings persistence is disabled for this host.".to_owned()),
        }
    }

    /// Interrogate a user-provided executable and add its row to the cached inventory.
    pub(crate) async fn add_custom_tool(
        &self,
        family: ToolFamily,
        path: PathBuf,
    ) -> Result<PreflightCheck, String> {
        self.preflight.add_custom(family, path).await
    }

    /// Remove a user-provided executable by its inventory id.
    pub(crate) async fn remove_custom_tool(&self, id: &str) -> Result<bool, String> {
        self.preflight.remove_custom(id).await
    }

    /// Save or replace one encoder fork. The route probes the executable before this is
    /// called, so a saved fork never has an unverified path.
    pub(crate) async fn set_encoder_fork(
        &self,
        id: &str,
        fork: Option<EncoderFork>,
    ) -> Result<AppSettings, String> {
        match &self.settings {
            Some(store) => store.set_encoder_fork(id, fork).await,
            None => Err("Settings persistence is disabled for this host.".to_owned()),
        }
    }

    /// Replace one built-in encoder's descriptor edits, or clear them with `None`.
    pub(crate) async fn set_encoder_override(
        &self,
        id: &str,
        override_document: Option<EncoderParameterOverride>,
    ) -> Result<AppSettings, String> {
        match &self.settings {
            Some(store) => store.set_encoder_override(id, override_document).await,
            None => Err("Settings persistence is disabled for this host.".to_owned()),
        }
    }

    /// The retained-work summary Storage renders.
    pub(crate) async fn storage_overview(&self) -> StorageOverview {
        crate::platform::storage::overview(self).await
    }

    /// Cancel a live encode and give its terminal event time to release the lock before
    /// the host exits.
    pub(crate) async fn shutdown(&self) {
        self.lan.disable().await;
        if self.runs.cancel_active().await && !self.runs.wait_for_idle(Duration::from_secs(5)).await
        {
            tracing::warn!("the active encode did not stop within the shutdown grace period");
        }
    }
}
