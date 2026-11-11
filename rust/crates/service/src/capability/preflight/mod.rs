//! The cached dependency inventory served to the UI.
//!
//! The engine owns what to probe; this module owns when to probe it. One cache lives in
//! `AppState`, so `/api/health`, a manual refresh, and custom executable probes share a
//! single result and a browser reload cannot stampede the toolchain with repeated process
//! spawns. Accepted custom executables are settings: they are written before the in-memory
//! inventory changes and re-probed when the service starts.

mod providers;
use providers::check_from;

use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
    sync::Arc,
};

use av1ation_contracts::encoder::{CustomTool, PreflightCheck, PreflightProvider, PreflightReport};
use av1ation_engine::capability::preflight::{Capability, Probe, ToolFamily, probe_tool};
use av1ation_engine::capability::scene_model::transnetv2_model;
use tokio::sync::Mutex;

use crate::{
    capability::toolchain, capability::vapoursynth::ProviderState, project::settings::SettingsStore,
};

/// A source of probes. The real implementation is the engine crate; tests inject a fixed
/// list so route tests never depend on the host's installed tools.
pub(crate) trait PreflightSource: Send + Sync {
    fn detect(&self) -> Vec<Probe>;
}

struct EngineSource;

impl PreflightSource for EngineSource {
    fn detect(&self) -> Vec<Probe> {
        av1ation_engine::capability::preflight::detect()
    }
}

/// A fixed inventory for tests and host injection.
struct StaticPreflight(Vec<Probe>);

impl PreflightSource for StaticPreflight {
    fn detect(&self) -> Vec<Probe> {
        self.0.clone()
    }
}

/// One accepted, saved custom executable and the built-in row it replaces when it works.
struct CustomEntry {
    path: PathBuf,
    target_id: String,
    probe: Probe,
}

/// A rejected probe attempt. It is shown so the user can correct it, but it is never
/// written to settings and never replaces a working custom executable.
struct FailureEntry {
    path: String,
    probe: Probe,
}

/// Everything guarded by the cache mutex. The base list is kept so adding or removing a
/// custom tool re-merges the inventory without re-running every `PATH` and library probe.
struct CacheState {
    report: Option<PreflightReport>,
    base: Option<Vec<Probe>>,
    customs: BTreeMap<String, CustomEntry>,
    failures: BTreeMap<String, FailureEntry>,
    /// The saved TransNetV2 override, if any, so its row describes the actual model.
    scene_model: Option<String>,
    /// The VapourSynth provider startup actually selected, when this host has selectable
    /// sources. It is applied to the cached row rather than probed again: VSScript was
    /// already initialised with one runtime.
    vapoursynth: Option<ProviderState>,
    /// The saved provider map. Executable rows follow it immediately; the metric rows use
    /// `applied_metrics`, because their native libraries initialise once per process.
    sources: BTreeMap<String, String>,
    applied_metrics: Option<String>,
    hydrated: bool,
}

/// The shared preflight cache.
#[derive(Clone)]
pub(crate) struct PreflightCache {
    source: Arc<dyn PreflightSource>,
    settings: Option<SettingsStore>,
    tools_dir: Option<PathBuf>,
    state: Arc<Mutex<CacheState>>,
}

impl PreflightCache {
    /// Build a cache around the real engine probe and optional settings file.
    pub(crate) fn engine(settings: Option<SettingsStore>) -> Self {
        Self::new(Arc::new(EngineSource), settings)
    }

    /// Build a cache around a fixed inventory, for tests.
    pub(crate) fn fixed(probes: Vec<Probe>) -> Self {
        Self::new(Arc::new(StaticPreflight(probes)), None)
    }

    /// Build a cache around a fixed inventory that still restores saved custom tools.
    ///
    /// A test that checks the restart path needs both halves: the inventory must not depend
    /// on the host's installed tools, while hydration must read the seeded settings document.
    pub(crate) fn fixed_with_settings(probes: Vec<Probe>, settings: SettingsStore) -> Self {
        Self::new(Arc::new(StaticPreflight(probes)), Some(settings))
    }

    fn new(source: Arc<dyn PreflightSource>, settings: Option<SettingsStore>) -> Self {
        Self {
            source,
            settings,
            tools_dir: None,
            state: Arc::new(Mutex::new(CacheState {
                report: None,
                base: None,
                customs: BTreeMap::new(),
                failures: BTreeMap::new(),
                scene_model: None,
                vapoursynth: None,
                sources: BTreeMap::new(),
                applied_metrics: None,
                hydrated: false,
            })),
        }
    }

    /// Name the staged toolchain this cache reports providers for.
    pub(crate) fn with_tools_dir(mut self, tools_dir: Option<PathBuf>) -> Self {
        self.tools_dir = tools_dir;
        self
    }

    /// Update the visible provider map and invalidate the cached row details.
    ///
    /// `startup` records the metric source this process actually loaded. A later save must
    /// not claim the metric libraries changed in place; the row keeps the startup source so
    /// Settings can ask for the restart the loader needs.
    pub(crate) async fn set_tool_sources(&self, sources: BTreeMap<String, String>, startup: bool) {
        let mut state = self.state.lock().await;
        if startup || state.applied_metrics.is_none() {
            state.applied_metrics = Some(metrics_source(&sources, self.tools_dir.as_deref()));
        }
        state.sources = sources;
        state.report = None;
    }

    /// Load saved custom tools once, re-probing each executable. The service calls this
    /// before accepting requests; `report` also calls it so a host that mounts the router
    /// directly still restores the saved inventory.
    pub(crate) async fn hydrate(&self) {
        {
            let state = self.state.lock().await;
            if state.hydrated {
                return;
            }
        }

        let (saved, scene_model, sources) = match &self.settings {
            Some(settings) => {
                let settings = settings.load().await;
                (
                    settings.custom_tools,
                    settings.scene_model,
                    settings.tool_sources,
                )
            }
            None => (Vec::new(), None, BTreeMap::new()),
        };

        let mut probed = Vec::with_capacity(saved.len());
        for tool in saved {
            let Some(family) = ToolFamily::parse(&tool.kind) else {
                tracing::warn!(kind = %tool.kind, "ignoring a saved custom tool with an unknown family");
                continue;
            };
            let path = PathBuf::from(&tool.path);
            let probe = match tokio::task::spawn_blocking(move || probe_tool(family, &path)).await {
                Ok(probe) => probe,
                Err(error) => {
                    tracing::error!(%error, "a saved custom executable probe task failed");
                    probeless(family, "the probe task did not run".to_owned())
                }
            };
            probed.push((tool, family, probe));
        }

        let mut state = self.state.lock().await;
        if state.hydrated {
            return;
        }
        for (tool, family, probe) in probed {
            state.customs.insert(
                family.as_str().to_owned(),
                CustomEntry {
                    path: PathBuf::from(tool.path),
                    target_id: family.target_id(),
                    probe,
                },
            );
        }
        state.scene_model = scene_model;
        if state.applied_metrics.is_none() {
            state.applied_metrics = Some(metrics_source(&sources, self.tools_dir.as_deref()));
        }
        state.sources = sources;
        state.hydrated = true;
    }

    /// Return the cached report, probing once on the blocking pool on first use.
    pub(crate) async fn report(&self) -> PreflightReport {
        self.hydrate().await;

        {
            let cached = self.state.lock().await;
            if let Some(report) = &cached.report {
                return report.clone();
            }
        }

        let base = self.detect().await;
        let mut state = self.state.lock().await;
        if let Some(report) = &state.report {
            return report.clone();
        }
        state.base = Some(base);
        let report = state.report(self.tools_dir.as_deref());
        state.report = Some(report.clone());
        report
    }

    /// Discard the cached report and probe the base inventory again. Saved custom tools
    /// survive a refresh: they are user settings, not a probe result. The scene model is
    /// re-read too, because saving a new override refreshes the inventory so its row can
    /// report the file the engine would actually load.
    /// Record the provider startup selected and drop the report that described the old one.
    ///
    /// Startup calls this before the first probe; a later call invalidates a cached report so
    /// the row cannot keep claiming a runtime this process did not load.
    pub(crate) async fn set_vapoursynth(&self, provider: ProviderState) {
        let mut state = self.state.lock().await;
        state.vapoursynth = Some(provider);
        state.report = None;
    }

    pub(crate) async fn refresh(&self) -> PreflightReport {
        self.hydrate().await;
        let base = self.detect().await;
        let (scene_model, sources) = match &self.settings {
            Some(settings) => {
                let settings = settings.load().await;
                (settings.scene_model, settings.tool_sources)
            }
            None => (None, BTreeMap::new()),
        };
        let mut state = self.state.lock().await;
        state.base = Some(base);
        state.scene_model = scene_model;
        state.sources = sources;
        let report = state.report(self.tools_dir.as_deref());
        state.report = Some(report.clone());
        report
    }

    /// Interrogate one custom executable. Accepted probes are persisted before the cache
    /// changes, so a failed write returns an error instead of pretending the setting stuck.
    /// Rejected probes are transient and do not overwrite a working saved path.
    pub(crate) async fn add_custom(
        &self,
        family: ToolFamily,
        path: PathBuf,
    ) -> Result<PreflightCheck, String> {
        self.hydrate().await;

        let probe_path = path.clone();
        let probe = match tokio::task::spawn_blocking(move || probe_tool(family, &probe_path)).await
        {
            Ok(probe) => probe,
            Err(error) => {
                tracing::error!(%error, "the custom executable probe task failed");
                probeless(family, "the probe task did not run".to_owned())
            }
        };

        if probe.available {
            // One family at a time, inside the settings store's write lock. Rebuilding the
            // whole list from this cache would delete an entry whose family this build
            // cannot parse.
            if let Some(settings) = &self.settings {
                settings
                    .set_custom_tool(
                        family.as_str(),
                        Some(CustomTool {
                            kind: family.as_str().to_owned(),
                            path: path.to_string_lossy().into_owned(),
                        }),
                    )
                    .await?;
            }
        }

        self.base().await;
        let mut state = self.state.lock().await;
        state.failures.remove(family.as_str());

        let saved_path = path.to_string_lossy().into_owned();
        let check = if probe.available {
            state.customs.insert(
                family.as_str().to_owned(),
                CustomEntry {
                    path,
                    target_id: family.target_id(),
                    probe: probe.clone(),
                },
            );
            check_from(
                probe,
                Some(saved_path),
                None,
                &BTreeMap::new(),
                self.tools_dir.as_deref(),
                None,
            )
        } else {
            let mut failed = probe;
            failed.id = format!("custom:{}:failed", family.as_str());
            failed.label = format!("{} (rejected)", family.label());
            let check = check_from(
                failed.clone(),
                Some(saved_path.clone()),
                None,
                &BTreeMap::new(),
                self.tools_dir.as_deref(),
                None,
            );
            state.failures.insert(
                family.as_str().to_owned(),
                FailureEntry {
                    path: saved_path,
                    probe: failed,
                },
            );
            check
        };

        let report = state.report(self.tools_dir.as_deref());
        state.report = Some(report);
        Ok(check)
    }

    /// Remove a custom row by its inventory id. Removing an accepted row updates settings
    /// first; removing a rejected attempt only clears the transient row.
    pub(crate) async fn remove_custom(&self, id: &str) -> Result<bool, String> {
        self.hydrate().await;

        let found = {
            let state = self.state.lock().await;
            state
                .customs
                .iter()
                .find(|(_, entry)| entry.probe.id == id)
                .map(|(key, _)| (key.clone(), true))
                .or_else(|| {
                    state
                        .failures
                        .iter()
                        .find(|(_, entry)| entry.probe.id == id)
                        .map(|(key, _)| (key.clone(), false))
                })
        };
        let Some((family, accepted)) = found else {
            return Ok(false);
        };

        if let (true, Some(settings)) = (accepted, &self.settings) {
            settings.set_custom_tool(&family, None).await?;
        }

        self.base().await;
        let mut state = self.state.lock().await;
        if accepted {
            state.customs.remove(&family);
            state.failures.remove(&family);
        } else {
            state.failures.remove(&family);
        }
        let report = state.report(self.tools_dir.as_deref());
        state.report = Some(report);
        Ok(true)
    }

    async fn base(&self) -> Vec<Probe> {
        {
            let cached = self.state.lock().await;
            if let Some(base) = &cached.base {
                return base.clone();
            }
        }

        let base = self.detect().await;
        let mut state = self.state.lock().await;
        state.base.get_or_insert(base).clone()
    }

    async fn detect(&self) -> Vec<Probe> {
        let source = Arc::clone(&self.source);
        match tokio::task::spawn_blocking(move || source.detect()).await {
            Ok(probes) => probes,
            Err(error) => {
                tracing::error!(%error, "the preflight probe task failed");
                Vec::new()
            }
        }
    }
}

impl CacheState {
    fn report(&self, tools_dir: Option<&Path>) -> PreflightReport {
        let base = self.base.as_deref().unwrap_or_default();
        let paths: BTreeMap<String, String> = self
            .customs
            .values()
            .map(|entry| {
                (
                    entry.probe.id.clone(),
                    entry.path.to_string_lossy().into_owned(),
                )
            })
            .chain(
                self.failures
                    .values()
                    .map(|entry| (entry.probe.id.clone(), entry.path.clone())),
            )
            .collect();
        let mut probes = merge(base, &self.customs, &self.failures);
        probes.push(scene_model_probe(self.scene_model.as_deref()));
        report_from_with_custom(
            probes,
            &paths,
            self.vapoursynth.as_ref(),
            &self.sources,
            tools_dir,
            self.applied_metrics.as_deref(),
        )
    }
}

/// The metric source this process loaded. An explicit System choice wins; otherwise the
/// bundle is used when this target staged at least one metric library.
fn metrics_source(sources: &BTreeMap<String, String>, tools_dir: Option<&Path>) -> String {
    if sources.get(toolchain::METRICS_ID).map(String::as_str) == Some("system") {
        return "system".to_owned();
    }
    if toolchain::metrics_available(tools_dir) {
        "bundled".to_owned()
    } else {
        "system".to_owned()
    }
}

/// The TransNetV2 row.
///
/// It is not an executable probe: the model is a file the engine searches for at run time.
/// Reporting the resolved path, or the reason none was found, is the difference between
/// "Automatic" meaning installed and meaning unverified.
fn scene_model_probe(configured: Option<&str>) -> Probe {
    let selected = configured.map(PathBuf::from);
    match transnetv2_model(selected.as_deref()) {
        Ok(path) => Probe {
            id: "scene-model".to_owned(),
            label: "TransNetV2 model".to_owned(),
            capability: Capability::Application,
            available: true,
            detail: path.to_string_lossy().into_owned(),
            remediation: None,
        },
        Err(detail) => Probe {
            id: "scene-model".to_owned(),
            label: "TransNetV2 model".to_owned(),
            capability: Capability::Application,
            available: false,
            remediation: Some(detail.clone()),
            detail,
        },
    }
}

/// Replace a detected row with a working custom row, keep every other row in place, and
/// append saved-but-broken rows and rejected attempts after it.
fn merge(
    base: &[Probe],
    customs: &BTreeMap<String, CustomEntry>,
    failures: &BTreeMap<String, FailureEntry>,
) -> Vec<Probe> {
    let mut merged = Vec::with_capacity(base.len() + customs.len() + failures.len());
    let mut used = BTreeSet::new();

    for probe in base {
        let replacement = customs
            .values()
            .find(|entry| entry.target_id == probe.id && entry.probe.available);
        match replacement {
            Some(entry) => {
                used.insert(entry.probe.id.clone());
                merged.push(entry.probe.clone());
            }
            None => merged.push(probe.clone()),
        }
    }

    for entry in customs.values() {
        if !used.contains(&entry.probe.id) {
            merged.push(entry.probe.clone());
        }
    }
    for entry in failures.values() {
        merged.push(entry.probe.clone());
    }
    merged
}

fn probeless(family: ToolFamily, detail: String) -> Probe {
    Probe {
        id: format!("custom:{}", family.as_str()),
        label: format!("{} (custom)", family.label()),
        capability: family.capability(),
        available: false,
        detail,
        remediation: Some(format!(
            "Choose the {} executable, or install `{}` and put it on PATH.",
            family.label(),
            family.executable_name()
        )),
    }
}

/// Project the engine's probes into the HTTP contract, computing the counts once so the
/// UI never derives availability itself.
#[cfg(test)]
pub(crate) fn report_from(probes: Vec<Probe>) -> PreflightReport {
    report_from_with_custom(probes, &BTreeMap::new(), None, &BTreeMap::new(), None, None)
}

fn report_from_with_custom(
    probes: Vec<Probe>,
    paths: &BTreeMap<String, String>,
    vapoursynth: Option<&ProviderState>,
    sources: &BTreeMap<String, String>,
    tools_dir: Option<&Path>,
    applied_metrics: Option<&str>,
) -> PreflightReport {
    let checks: Vec<PreflightCheck> = probes
        .into_iter()
        .map(|probe| {
            let path = paths.get(&probe.id).cloned();
            check_from(
                probe,
                path,
                vapoursynth,
                sources,
                tools_dir,
                applied_metrics,
            )
        })
        .collect();
    let available_count = checks.iter().filter(|check| check.available).count() as u32;
    let total_count = checks.len() as u32;

    PreflightReport {
        checks,
        available_count,
        total_count,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use av1ation_engine::capability::preflight::Capability;

    use super::*;

    struct CountingSource(Arc<AtomicUsize>);

    impl PreflightSource for CountingSource {
        fn detect(&self) -> Vec<Probe> {
            self.0.fetch_add(1, Ordering::SeqCst);
            vec![probe("only", true)]
        }
    }

    fn probe(id: &str, available: bool) -> Probe {
        Probe {
            id: id.to_owned(),
            label: id.to_owned(),
            capability: Capability::Encode,
            available,
            detail: if available { "1.0" } else { "not found" }.to_owned(),
            remediation: (!available).then(|| "Install it.".to_owned()),
        }
    }

    fn custom(family: ToolFamily, available: bool) -> CustomEntry {
        CustomEntry {
            path: PathBuf::from(format!("C:/tools/{}", family.executable_name())),
            target_id: family.target_id(),
            probe: Probe {
                id: format!("custom:{}", family.as_str()),
                label: format!("{} (custom)", family.label()),
                capability: family.capability(),
                available,
                detail: if available {
                    "custom build"
                } else {
                    "bad stamp"
                }
                .to_owned(),
                remediation: (!available).then(|| "Choose another path.".to_owned()),
            },
        }
    }

    fn failure(family: ToolFamily) -> FailureEntry {
        let mut probe = custom(family, false).probe;
        probe.id = format!("custom:{}:failed", family.as_str());
        probe.label = format!("{} (rejected)", family.label());
        FailureEntry {
            path: format!("C:/tools/{}.exe", family.executable_name()),
            probe,
        }
    }

    #[tokio::test]
    async fn the_report_is_cached_until_an_explicit_refresh() {
        let calls = Arc::new(AtomicUsize::new(0));
        let cache = PreflightCache::new(Arc::new(CountingSource(Arc::clone(&calls))), None);

        // The engine probe contributes one row; the scene model always contributes its own
        // application row, whether or not this host has the file.
        assert_eq!(cache.report().await.total_count, 2);
        assert_eq!(cache.report().await.total_count, 2);
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        cache.refresh().await;
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn report_counts_available_checks_once() {
        let report = report_from(vec![probe("a", true), probe("b", false), probe("c", true)]);

        assert_eq!(report.available_count, 2);
        assert_eq!(report.total_count, 3);
        assert_eq!(report.checks[0].capability, "encode");
        assert_eq!(report.checks[1].remediation.as_deref(), Some("Install it."));
        assert!(report.checks[0].remediation.is_none());
        assert!(report.checks[0].origin.is_none());
    }

    #[test]
    fn an_accepted_custom_row_replaces_its_detected_row_in_place() {
        let base = vec![
            probe("vapoursynth", true),
            probe("encoder:svt-av1", false),
            probe("encoder:x265", true),
        ];
        let mut customs = BTreeMap::new();
        customs.insert("svt-av1".to_owned(), custom(ToolFamily::SvtAv1, true));

        let merged = merge(&base, &customs, &BTreeMap::new());

        assert_eq!(merged.len(), 3);
        assert_eq!(merged[0].id, "vapoursynth");
        assert_eq!(merged[1].id, "custom:svt-av1");
        assert_eq!(merged[1].detail, "custom build");
        assert_eq!(merged[2].id, "encoder:x265");
    }

    #[test]
    fn a_broken_saved_row_does_not_hide_a_working_detected_row() {
        let base = vec![probe("encoder:svt-av1", true)];
        let mut customs = BTreeMap::new();
        customs.insert("svt-av1".to_owned(), custom(ToolFamily::SvtAv1, false));

        let merged = merge(&base, &customs, &BTreeMap::new());

        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].id, "encoder:svt-av1");
        assert_eq!(merged[1].id, "custom:svt-av1");
        assert!(!merged[1].available);
    }

    #[test]
    fn a_rejected_attempt_is_appended_without_overwriting_the_saved_row() {
        let base = vec![probe("encoder:svt-av1", true)];
        let mut customs = BTreeMap::new();
        customs.insert("svt-av1".to_owned(), custom(ToolFamily::SvtAv1, true));
        let mut failures = BTreeMap::new();
        failures.insert("svt-av1".to_owned(), failure(ToolFamily::SvtAv1));

        let merged = merge(&base, &customs, &failures);

        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].id, "custom:svt-av1");
        assert!(merged[0].available);
        assert_eq!(merged[1].id, "custom:svt-av1:failed");
        assert!(!merged[1].available);
    }

    #[test]
    fn a_staged_encoder_offers_both_providers_and_selects_the_bundle() {
        let root = std::env::temp_dir().join(format!(
            "av1ation-preflight-provider-{}",
            uuid::Uuid::new_v4()
        ));
        let binary = toolchain::binary_path(&root, ToolFamily::SvtAv1);
        std::fs::create_dir_all(binary.parent().expect("bin")).expect("bin");
        std::fs::write(&binary, b"fixture").expect("binary");
        let sources = BTreeMap::from([("encoder:svt-av1".to_owned(), "bundled".to_owned())]);

        let check = check_from(
            probe("encoder:svt-av1", false),
            None,
            None,
            &sources,
            Some(&root),
            None,
        );

        assert_eq!(check.selected_source.as_deref(), Some("bundled"));
        assert_eq!(check.configured_source.as_deref(), Some("bundled"));
        assert!(check.available, "the staged executable is the provider");
        assert_eq!(check.providers.len(), 2);
        assert!(check.providers[0].active);
        assert!(check.providers[0].available);
        assert!(!check.providers[1].available, "PATH is not the provider");
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn the_muxing_system_row_is_unprobed_while_the_bundled_link_is_active() {
        let root =
            std::env::temp_dir().join(format!("av1ation-preflight-muxer-{}", uuid::Uuid::new_v4()));
        let binary = toolchain::binary_path(&root, ToolFamily::Ffmpeg);
        std::fs::create_dir_all(binary.parent().expect("bin")).expect("bin");
        std::fs::write(&binary, b"fixture").expect("binary");

        // The engine's PATH probe resolves the bundled link the service itself created, so
        // reporting its output as the machine's installation would be a lie.
        let check = check_from(
            probe("ffmpeg", true),
            None,
            None,
            &BTreeMap::new(),
            Some(&root),
            None,
        );

        assert_eq!(check.selected_source.as_deref(), Some("bundled"));
        assert!(check.providers[0].active);
        let system = &check.providers[1];
        assert!(!system.checked);
        assert!(!system.available);
        assert!(system.detail.contains("Restart with System"));
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn a_staged_metric_library_is_offered_on_a_metric_row() {
        let root = std::env::temp_dir().join(format!(
            "av1ation-preflight-metric-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(root.join("lib")).expect("lib");
        std::fs::write(root.join("lib/libvmaf.dll"), b"fixture").expect("library");

        let check = check_from(
            probe("metric:vmaf", false),
            None,
            None,
            &BTreeMap::new(),
            Some(&root),
            Some("bundled"),
        );

        assert_eq!(check.selected_source.as_deref(), Some("bundled"));
        assert_eq!(
            check.configured_source, None,
            "the process chose this, not the user"
        );
        assert_eq!(check.providers.len(), 2);
        assert!(check.providers[0].available);
        assert!(check.providers[0].active);
        assert!(
            !check.providers[1].checked,
            "the loaded library is the bundle, not the machine's"
        );
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn a_metric_without_a_staged_library_stays_on_the_system_backend() {
        let root = std::env::temp_dir().join(format!(
            "av1ation-preflight-metric-missing-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(root.join("lib")).expect("lib");

        // Only another family's library is staged. The process hint is bundled, but this
        // metric still loads from the machine, so its row must say so.
        std::fs::write(root.join("lib/libvmaf.dll"), b"fixture").expect("library");
        let sources = BTreeMap::from([("metrics".to_owned(), "bundled".to_owned())]);

        let check = check_from(
            probe("metric:ssimulacra2", true),
            None,
            None,
            &sources,
            Some(&root),
            Some("bundled"),
        );

        assert_eq!(check.configured_source.as_deref(), Some("bundled"));
        assert_eq!(check.selected_source.as_deref(), Some("system"));
        assert!(!check.providers[0].available);
        assert!(check.providers[0].checked);
        assert!(!check.providers[0].active);
        assert!(check.providers[1].active);
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn a_custom_ffmpeg_targets_the_muxing_row() {
        let base = vec![probe("ffmpeg", false)];
        let mut customs = BTreeMap::new();
        customs.insert("ffmpeg".to_owned(), custom(ToolFamily::Ffmpeg, true));

        let merged = merge(&base, &customs, &BTreeMap::new());

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].id, "custom:ffmpeg");
        assert_eq!(merged[0].capability, Capability::Muxing);
    }
}
