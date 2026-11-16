//! The staged toolchain a release carries under `<resource>/tools`.
//!
//! The engine resolves FFmpeg and mkvmerge with `which`, and an encoder through the absolute
//! `executable` field of its own document. This module turns the per-capability provider
//! choice into those two mechanisms: a `<app-data>/toolbin` directory first on `PATH`, and
//! the absolute path the run's encoder document names. It also points the metric loaders at
//! `tools/lib`.
//!
//! A development host can name the same tree with `AV1ATION_TOOLS_DIR`; nothing here derives
//! a tool path from the manifest directory or the working directory.

use std::{
    collections::BTreeMap,
    env, fs,
    path::{Path, PathBuf},
};

use av1ation_engine::capability::preflight::ToolFamily;

/// The settings key for the bundled metric libraries. One directory serves every metric.
pub(crate) const METRICS_ID: &str = "metrics";

/// The settings key a check id saves under.
///
/// A metric row names one metric, but `tools/lib` is one directory and the native libraries
/// initialise once per process. All metric rows therefore share one provider choice. FFmpeg
/// is both an encoder family and a muxing program, so its two rows share `ffmpeg`.
pub(crate) fn setting_id(check_id: &str) -> Option<String> {
    match check_id {
        "vapoursynth" | METRICS_ID | "ffmpeg" | "mkvmerge" => Some(check_id.to_owned()),
        id if id.starts_with("metric:") => (id != "metric:xpsnr").then(|| METRICS_ID.to_owned()),
        id => {
            let family = parse_encoder_id(id)?;
            if family == ToolFamily::MkvMerge {
                return None;
            }
            Some(if family == ToolFamily::Ffmpeg {
                "ffmpeg".to_owned()
            } else {
                format!("encoder:{}", family.as_str())
            })
        }
    }
}

/// Parse the engine's serialised encoder variant name (`SVTAV1`) or a wire family id
/// (`svt-av1`). The two spellings differ for SVT-AV1 and VVenC, so neither can be assumed.
pub(crate) fn family_from_encoder_name(name: &str) -> Option<ToolFamily> {
    match name {
        "AOM" => Some(ToolFamily::Aom),
        "RAV1E" => Some(ToolFamily::Rav1e),
        "VPX" => Some(ToolFamily::Vpx),
        "SVTAV1" => Some(ToolFamily::SvtAv1),
        "AVM" => Some(ToolFamily::Avm),
        "X264" => Some(ToolFamily::X264),
        "X265" => Some(ToolFamily::X265),
        "VVenC" => Some(ToolFamily::VVenC),
        "FFmpeg" => Some(ToolFamily::Ffmpeg),
        other => ToolFamily::parse(&other.to_ascii_lowercase()),
    }
}

/// The family a setting id selects, if it names an executable capability.
pub(crate) fn family_for_setting(id: &str) -> Option<ToolFamily> {
    match id {
        "ffmpeg" => Some(ToolFamily::Ffmpeg),
        "mkvmerge" => Some(ToolFamily::MkvMerge),
        id => parse_encoder_id(id),
    }
}

fn parse_encoder_id(id: &str) -> Option<ToolFamily> {
    id.strip_prefix("encoder:").and_then(ToolFamily::parse)
}

/// The absolute path of a bundled executable, whether or not it exists.
pub(crate) fn binary_path(tools_dir: &Path, family: ToolFamily) -> PathBuf {
    let mut name = family.executable_name().to_owned();
    if cfg!(windows) {
        name.push_str(".exe");
    }
    tools_dir.join("bin").join(name)
}

/// The directory the bundled metric libraries live in.
pub(crate) fn metric_dir(tools_dir: &Path) -> PathBuf {
    tools_dir.join("lib")
}

/// The bundled library that can serve this metric row, if one is staged.
pub(crate) fn metric_library(tools_dir: &Path, check_id: &str) -> Option<PathBuf> {
    let prefixes: &[&str] = match check_id {
        "metric:vmaf" => &["libvmaf"],
        // Windows emits `fmetrics.dll`, Linux and macOS emit `libfmetrics.so`/`.dylib`.
        "metric:ssimulacra2" | "metric:butteraugli" | "metric:cvvdp" => {
            &["fmetrics", "libfmetrics", "libvship"]
        }
        _ => return None,
    };
    library_with_prefix(&metric_dir(tools_dir), prefixes)
}

/// The first staged library whose file name starts with one of `prefixes`.
///
/// Sorting makes the choice deterministic when a directory carries more than one version.
fn library_with_prefix(directory: &Path, prefixes: &[&str]) -> Option<PathBuf> {
    let entries = fs::read_dir(directory).ok()?;
    let mut matches: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            prefixes.iter().any(|prefix| name.starts_with(prefix))
        })
        .collect();
    matches.sort();
    matches.into_iter().next()
}

/// Whether this install carries any bundled metric library.
pub(crate) fn metrics_available(tools_dir: Option<&Path>) -> bool {
    let Some(tools_dir) = tools_dir else {
        return false;
    };
    metric_library(tools_dir, "metric:vmaf").is_some()
        || metric_library(tools_dir, "metric:ssimulacra2").is_some()
}

/// Whether this install carries the bundled provider for one check id.
pub(crate) fn bundled_available(check_id: &str, tools_dir: Option<&Path>) -> bool {
    let Some(tools_dir) = tools_dir else {
        return false;
    };
    let Some(setting) = setting_id(check_id) else {
        return false;
    };
    if setting == METRICS_ID {
        return metric_library(tools_dir, check_id).is_some()
            || (check_id == METRICS_ID && metrics_available(Some(tools_dir)));
    }
    family_for_setting(&setting).is_some_and(|family| binary_path(tools_dir, family).is_file())
}

/// Point the process at the staged metric libraries and create the PATH shim.
///
/// The metric libraries are loaded once and cached by their crates, so this runs at startup.
/// Adding the directory to `PATH` also has to happen here: `env::set_var` is safe only before
/// other threads can read the environment, and a provider save arrives long after that.
pub(crate) fn apply_startup(
    tools_dir: Option<&Path>,
    data_dir: Option<&Path>,
    sources: &BTreeMap<String, String>,
    customs: &BTreeMap<String, PathBuf>,
) {
    if let Some(toolbin) = refresh_toolbin(tools_dir, data_dir, sources, customs) {
        prepend_path(&toolbin);
    }
    apply_metrics(tools_dir, sources);
    apply_scene_model(tools_dir);
}

/// The staged TransNetV2 model, when the bundle carries one.
///
/// The engine searches beside the executable and in the user cache, not under `tools`, so a
/// release has to name the staged copy explicitly. Keeping the lookup here makes the same
/// tree work for a development host, which points `AV1ATION_TOOLS_DIR` at the same layout.
pub(crate) fn scene_model(tools_dir: Option<&Path>) -> Option<PathBuf> {
    let model = tools_dir?.join("model").join("transnetv2.onnx");
    model.is_file().then_some(model)
}

/// Tell the engine about the staged model before it resolves one for the first preflight.
///
/// An explicit environment variable is the user's (or a launcher's) override and is never
/// replaced. A configured `scene_model` path in settings still wins at run time.
fn apply_scene_model(tools_dir: Option<&Path>) {
    let Some(model) = scene_model(tools_dir) else {
        return;
    };
    if env::var_os("TRANSNETV2_MODEL_PATH").is_some_and(|value| !value.is_empty()) {
        return;
    }
    // SAFETY: startup, before the service accepts requests and before the engine's model
    // search runs for the first preflight report.
    unsafe { env::set_var("TRANSNETV2_MODEL_PATH", &model) };
}

/// Rewrite the toolbin links after a provider choice changes.
///
/// Only FFmpeg and mkvmerge need this: the engine resolves both with `which`, so a link in a
/// directory already first on `PATH` replaces the previous provider without a restart. The
/// directory is already on `PATH` from startup, so this never touches the environment.
pub(crate) fn apply_tool_sources(
    tools_dir: Option<&Path>,
    data_dir: Option<&Path>,
    sources: &BTreeMap<String, String>,
    customs: &BTreeMap<String, PathBuf>,
) {
    let _ = refresh_toolbin(tools_dir, data_dir, sources, customs);
}

fn refresh_toolbin(
    tools_dir: Option<&Path>,
    data_dir: Option<&Path>,
    sources: &BTreeMap<String, String>,
    customs: &BTreeMap<String, PathBuf>,
) -> Option<PathBuf> {
    let (Some(tools_dir), Some(data_dir)) = (tools_dir, data_dir) else {
        return None;
    };
    let toolbin = data_dir.join("toolbin");
    if let Err(error) = fs::create_dir_all(&toolbin) {
        tracing::warn!(%error, "the toolbin directory could not be created");
        return None;
    }
    // The muxer links are hard links, so a Windows loader no longer sees the DLLs staged
    // beside `tools/bin/mkvmerge.exe`. Clear the previous runtime and copy the selected
    // bundle's sibling DLLs next to the link; a custom executable keeps its own directory.
    clear_runtime_dlls(&toolbin);

    for family in [ToolFamily::Ffmpeg, ToolFamily::MkvMerge] {
        let setting = if family == ToolFamily::Ffmpeg {
            "ffmpeg"
        } else {
            "mkvmerge"
        };
        let target = toolbin.join(
            binary_path(Path::new(""), family)
                .file_name()
                .unwrap_or_default(),
        );
        let bundled = binary_path(tools_dir, family);
        // An accepted custom path is the row's provider, so it also has to be the program
        // `which` resolves; otherwise the bundled link silently wins the documented
        // precedence. A saved path that has since disappeared falls through to the source.
        let custom = customs.get(family.as_str()).filter(|path| path.is_file());
        let selected = custom.or_else(|| {
            (sources.get(setting).map(String::as_str) != Some("system") && bundled.is_file())
                .then_some(&bundled)
        });
        if let Some(source) = selected {
            if let Err(error) = link_or_copy(source, &target) {
                tracing::warn!(
                    %error,
                    source = %source.display(),
                    "a selected muxer could not be linked into the toolbin directory"
                );
            }
            if family == ToolFamily::MkvMerge
                && source == &bundled
                && let Err(error) = copy_runtime_dlls(source, &toolbin)
            {
                tracing::warn!(
                    %error,
                    source = %source.display(),
                    "the bundled muxer runtime DLLs could not be staged in the toolbin directory"
                );
            }
        } else if target.exists()
            && let Err(error) = fs::remove_file(&target)
        {
            // A link that cannot be removed keeps the bundled provider first on PATH, so
            // say so rather than letting preflight claim the system provider is active.
            tracing::warn!(
                %error,
                path = %target.display(),
                "a bundled muxer link could not be removed"
            );
        }
    }

    Some(toolbin)
}

#[cfg(windows)]
fn clear_runtime_dlls(toolbin: &Path) {
    let Ok(entries) = fs::read_dir(toolbin) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("dll"))
        {
            let _ = fs::remove_file(path);
        }
    }
}

#[cfg(not(windows))]
fn clear_runtime_dlls(_toolbin: &Path) {}

/// Copy a bundled executable's Windows runtime closure beside its toolbin link.
///
/// `mkvmerge.exe` is a hard link, so the loader cannot rely on the directory that holds
/// the real executable. Its recipe stages the PE closure in the same `bin` directory, and
/// this mirrors those DLLs into the directory the link is actually launched from. The call
/// is a no-op on other platforms, where the loader does not use the executable's directory.
fn copy_runtime_dlls(source: &Path, toolbin: &Path) -> std::io::Result<()> {
    #[cfg(not(windows))]
    {
        let _ = (source, toolbin);
        Ok(())
    }
    #[cfg(windows)]
    {
        let Some(directory) = source.parent() else {
            return Ok(());
        };
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file()
                && path
                    .extension()
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("dll"))
            {
                link_or_copy(&path, &toolbin.join(entry.file_name()))?;
            }
        }
        Ok(())
    }
}

fn link_or_copy(source: &Path, target: &Path) -> std::io::Result<()> {
    if target.exists() {
        fs::remove_file(target)?;
    }
    match fs::hard_link(source, target) {
        Ok(()) => Ok(()),
        // The toolchain and app data may be on different volumes; a copy is the portable
        // fallback and is still cheap relative to starting the application.
        Err(_) => fs::copy(source, target).map(|_| ()),
    }
}

fn prepend_path(directory: &Path) {
    let mut entries: Vec<PathBuf> = vec![directory.to_owned()];
    if let Some(current) = env::var_os("PATH") {
        entries.extend(
            env::split_paths(&current)
                .filter(|entry| entry.as_path() != directory && !entry.as_os_str().is_empty()),
        );
    }
    let Ok(value) = env::join_paths(entries) else {
        tracing::warn!("the toolbin directory could not be added to PATH");
        return;
    };
    // SAFETY: startup, before the service accepts requests. The chosen directory is
    // prepended once and every other entry keeps its order.
    unsafe { env::set_var("PATH", value) };
}

fn apply_metrics(tools_dir: Option<&Path>, sources: &BTreeMap<String, String>) {
    let Some(tools_dir) = tools_dir else {
        return;
    };
    let library_dir = metric_dir(tools_dir);
    let source = sources.get(METRICS_ID).map(String::as_str);
    let staged = |prefixes: &[&str]| library_with_prefix(&library_dir, prefixes).is_some();
    // Each loader only reads its own hint. Pointing a hint at a directory without that
    // library would hide the user's installation until the loader's own fallback ran, so a
    // family that is not staged is left untouched.
    for (variable, present) in [
        ("VMAF_LIB_DIR", staged(&["libvmaf"])),
        ("FMETRICS_LIB_DIR", staged(&["fmetrics", "libfmetrics"])),
        ("VSHIP_LIB_DIR", staged(&["libvship"])),
        ("VSHIP_PLUGIN_PATH", staged(&["libvship"])),
    ] {
        if !present {
            continue;
        }
        let current = env::var_os(variable).map(PathBuf::from);
        match source {
            Some("system") => {
                if current.as_deref() == Some(library_dir.as_path()) {
                    // SAFETY: startup, before the metric crate is first used. Only the value
                    // this service would have written is removed.
                    unsafe { env::remove_var(variable) };
                }
            }
            Some("bundled") => {
                // SAFETY: startup, before the metric crate is first used. The explicit
                // provider choice overrides a stale inherited path.
                unsafe { env::set_var(variable, &library_dir) };
            }
            None if current.is_none() => {
                // SAFETY: startup, before the metric crate is first used. Automatic
                // selection only fills a variable the user did not set.
                unsafe { env::set_var(variable, &library_dir) };
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temporary() -> PathBuf {
        let directory = env::temp_dir().join(format!("av1ation-toolchain-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).expect("temp directory");
        directory
    }

    #[test]
    fn encoder_variant_names_and_wire_ids_resolve_to_the_same_family() {
        assert_eq!(family_from_encoder_name("SVTAV1"), Some(ToolFamily::SvtAv1));
        assert_eq!(
            family_from_encoder_name("svt-av1"),
            Some(ToolFamily::SvtAv1)
        );
        assert_eq!(family_from_encoder_name("VVenC"), Some(ToolFamily::VVenC));
        assert_eq!(family_from_encoder_name("FFmpeg"), Some(ToolFamily::Ffmpeg));
    }

    #[test]
    fn ffmpeg_rows_share_one_setting_and_metrics_share_one_choice() {
        assert_eq!(setting_id("encoder:ffmpeg").as_deref(), Some("ffmpeg"));
        assert_eq!(setting_id("ffmpeg").as_deref(), Some("ffmpeg"));
        assert_eq!(setting_id("metric:vmaf").as_deref(), Some(METRICS_ID));
        assert_eq!(
            setting_id("metric:ssimulacra2").as_deref(),
            Some(METRICS_ID)
        );
        assert_eq!(setting_id("metric:xpsnr"), None);
    }

    #[test]
    fn a_provider_save_rewrites_the_toolbin_links() {
        let root = temporary();
        let tools = root.join("tools");
        let data = root.join("data");
        let ffmpeg = binary_path(&tools, ToolFamily::Ffmpeg);
        fs::create_dir_all(ffmpeg.parent().expect("bin")).expect("bin");
        fs::write(&ffmpeg, b"fixture").expect("ffmpeg");
        let link = data.join("toolbin").join(
            binary_path(Path::new(""), ToolFamily::Ffmpeg)
                .file_name()
                .expect("name"),
        );

        apply_tool_sources(
            Some(&tools),
            Some(&data),
            &BTreeMap::new(),
            &BTreeMap::new(),
        );
        assert!(
            link.is_file(),
            "automatic selection links the staged executable"
        );

        apply_tool_sources(
            Some(&tools),
            Some(&data),
            &BTreeMap::from([("ffmpeg".to_owned(), "system".to_owned())]),
            &BTreeMap::new(),
        );
        assert!(
            !link.exists(),
            "choosing System removes the bundled link from PATH"
        );

        // An accepted custom muxer wins over both, even when System is selected.
        let custom = root.join("custom-ffmpeg.exe");
        fs::write(&custom, b"custom").expect("custom");
        apply_tool_sources(
            Some(&tools),
            Some(&data),
            &BTreeMap::from([("ffmpeg".to_owned(), "system".to_owned())]),
            &BTreeMap::from([("ffmpeg".to_owned(), custom)]),
        );
        assert_eq!(fs::read(&link).expect("linked custom"), b"custom");

        apply_tool_sources(
            Some(&tools),
            Some(&data),
            &BTreeMap::from([("ffmpeg".to_owned(), "system".to_owned())]),
            &BTreeMap::new(),
        );
        assert!(
            !link.exists(),
            "removing the custom muxer does not restore a bundled link under System"
        );

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[cfg(windows)]
    #[test]
    fn a_bundled_mkvmerge_runtime_dlls_follow_the_toolbin_link() {
        let root = temporary();
        let tools = root.join("tools");
        let data = root.join("data");
        let mkvmerge = binary_path(&tools, ToolFamily::MkvMerge);
        fs::create_dir_all(mkvmerge.parent().expect("bin")).expect("bin");
        fs::write(&mkvmerge, b"fixture").expect("mkvmerge");
        fs::write(
            mkvmerge.parent().expect("bin").join("Qt6Core.dll"),
            b"runtime",
        )
        .expect("Qt runtime");
        let toolbin = data.join("toolbin");
        fs::create_dir_all(&toolbin).expect("toolbin");
        fs::write(toolbin.join("stale.dll"), b"stale").expect("stale runtime");

        apply_tool_sources(
            Some(&tools),
            Some(&data),
            &BTreeMap::new(),
            &BTreeMap::new(),
        );
        assert!(
            toolbin.join("mkvmerge.exe").is_file(),
            "automatic selection links the staged muxer"
        );
        assert!(
            toolbin.join("Qt6Core.dll").is_file(),
            "the runtime closure is staged beside the link"
        );
        assert!(
            !toolbin.join("stale.dll").exists(),
            "a previous provider's runtime is removed"
        );

        apply_tool_sources(
            Some(&tools),
            Some(&data),
            &BTreeMap::from([("mkvmerge".to_owned(), "system".to_owned())]),
            &BTreeMap::new(),
        );
        assert!(!toolbin.join("mkvmerge.exe").exists());
        assert!(!toolbin.join("Qt6Core.dll").exists());

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn a_bundled_binary_and_metric_library_are_detected_by_name() {
        let root = temporary();
        let ffmpeg = binary_path(&root, ToolFamily::Ffmpeg);
        fs::create_dir_all(ffmpeg.parent().expect("bin")).expect("bin");
        fs::write(&ffmpeg, b"fixture").expect("ffmpeg");
        fs::create_dir_all(root.join("lib")).expect("lib");
        fs::write(root.join("lib").join("libvmaf.dll"), b"fixture").expect("libvmaf");
        // The Linux/macOS spelling the bundle stages, not only the Windows DLL.
        fs::write(root.join("lib").join("libfmetrics.so"), b"fixture").expect("libfmetrics");

        assert!(bundled_available("ffmpeg", Some(&root)));
        assert!(bundled_available("metric:vmaf", Some(&root)));
        assert!(bundled_available("metric:ssimulacra2", Some(&root)));
        assert!(!bundled_available("mkvmerge", Some(&root)));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn a_staged_scene_model_is_found_by_the_bundle() {
        let root = temporary();
        assert_eq!(scene_model(Some(&root)), None, "no model is not an error");

        let model = root.join("model").join("transnetv2.onnx");
        fs::create_dir_all(model.parent().expect("model")).expect("model directory");
        fs::write(&model, b"fixture").expect("model file");

        assert_eq!(scene_model(Some(&root)), Some(model.clone()));
        assert_eq!(scene_model(None), None, "a host without tools has no model");
        fs::remove_dir_all(root).expect("cleanup");
    }
}
