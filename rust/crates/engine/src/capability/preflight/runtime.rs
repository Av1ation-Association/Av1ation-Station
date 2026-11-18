//! Process and library probes: VapourSynth, metric backends, and executable commands.

use super::*;

/// Whether the VapourSynth plugins that provide a metric are loaded.
///
/// `libraries()` reports native libraries only; the plugin branch is a separate backend, so
/// it must be answered separately. The fixed namespace list also gives Settings a
/// per-plugin view of what a script or a filter can import, without claiming the core is
/// missing.
#[derive(Debug, Clone, Copy, Default)]
pub(super) struct PluginPresence {
    pub(super) vship: bool,
    pub(super) vszip: bool,
}

/// The plugin namespaces this application's inputs, filters, and metrics require.
///
/// The list is deliberately fixed: the wrapper exposes lookup by namespace, not a stable
/// enumeration contract, and the inventory must not change shape with whatever happens to
/// be loaded on one machine. The namespace is what a script writes after `core.`, which is
/// often an abbreviation rather than the package name: BestSource is `bs`, MVUtensils is
/// `mvu`, ZoomVTools is `zoomv`, DGDecNV is `dgdecodenv`, and vs-fgs is `fgs` even though
/// its identifier is `com.vs.fgs`. Every filter that calls an external plugin is covered
/// here; `Rescale`
/// needs the `vsscale`/`vskernels` Python modules, which are not plugin namespaces and are
/// not part of this list.
const VAPOURSYNTH_PLUGINS: &[(&str, &str)] = &[
    ("bs", "BestSource"),
    ("ffms2", "FFMS2"),
    ("dgdecodenv", "DGDecNV"),
    ("lsmas", "L-SMASH-Works"),
    ("vszip", "vszip"),
    ("mvu", "MVUtensils"),
    ("zoomv", "ZoomVTools"),
    ("fgs", "vs-fgs"),
    ("vship", "vship"),
];

pub(super) fn plugin_probes(core: Option<&vapoursynth::core::CoreRef<'_>>) -> Vec<PluginProbe> {
    VAPOURSYNTH_PLUGINS
        .iter()
        .map(|(namespace, label)| {
            let plugin =
                core.and_then(|core| core.get_plugin_by_namespace(namespace).ok().flatten());
            PluginProbe {
                namespace: (*namespace).to_owned(),
                label: (*label).to_owned(),
                available: plugin.is_some(),
                detail: match plugin {
                    Some(plugin) => plugin.path().map_or_else(
                        || "Loaded".to_owned(),
                        |path| format!("Loaded · {}", path.to_string_lossy()),
                    ),
                    None => "Not loaded".to_owned(),
                },
            }
        })
        .collect()
}

/// The metric catalogue, filtered per metric rather than per library.
///
/// A metric is available when at least one backend that implements it is usable. This is
/// the projection the settings screen renders; a missing optional library removes only the
/// metrics it alone can provide.
pub(super) fn metric_probes(
    libraries: &[andean_condor::metrics::MetricLibraryInfo],
    plugins: PluginPresence,
) -> Vec<Probe> {
    let loaded = |name: &str| {
        libraries
            .iter()
            .find(|library| library.name == name && library.available)
    };

    let vship = loaded("libvship");
    let fmetrics = loaded("fmetrics");
    let vmaf = loaded("libvmaf");

    let version = |library: Option<&andean_condor::metrics::MetricLibraryInfo>| {
        library.map_or_else(
            || "loaded".to_owned(),
            |library| {
                library
                    .version
                    .clone()
                    .unwrap_or_else(|| "loaded".to_owned())
            },
        )
    };

    let score = if vship.is_some() {
        Some(format!("libvship {}", version(vship)))
    } else if fmetrics.is_some() {
        Some(format!("fmetrics {}", version(fmetrics)))
    } else if plugins.vship {
        Some("VapourSynth vship plugin".to_owned())
    } else {
        None
    };

    let score_missing = || {
        Probe::missing(
            "metric:ssimulacra2",
            "SSIMULACRA2",
            Capability::Metric,
            "No SSIMULACRA2 backend loaded.".to_owned(),
            "Install fmetrics for a CPU path, libvship plus a Vulkan driver for a GPU path, or VapourSynth plus the vship plugin.",
        )
    };

    let score_row = |id: &str, label: &str| match &score {
        Some(detail) => Probe::found(id, label, Capability::Metric, detail.clone()),
        None => {
            let mut row = score_missing();
            row.id = id.to_owned();
            row.label = label.to_owned();
            row
        }
    };

    vec![
        match &vmaf {
            Some(library) => Probe::found(
                "metric:vmaf",
                "VMAF",
                Capability::Metric,
                format!("libvmaf {}", version(Some(library))),
            ),
            None => Probe::missing(
                "metric:vmaf",
                "VMAF",
                Capability::Metric,
                "libvmaf is not loaded.".to_owned(),
                "Install libvmaf; set VMAF_LIB_DIR for a non-standard location, or supply a model path when the built-in models are absent.",
            ),
        },
        score_row("metric:ssimulacra2", "SSIMULACRA2"),
        score_row("metric:butteraugli", "BUTTERAUGLI"),
        score_row("metric:cvvdp", "CVVDP"),
        if plugins.vszip {
            Probe::found(
                "metric:xpsnr",
                "XPSNR",
                Capability::Metric,
                "VapourSynth vszip plugin".to_owned(),
            )
        } else {
            Probe::missing(
                "metric:xpsnr",
                "XPSNR",
                Capability::Metric,
                "XPSNR needs VapourSynth and the vszip plugin; there is no fallback.".to_owned(),
                "Install VapourSynth and the vszip plugin.",
            )
        },
    ]
}

/// VapourSynth is a library, not a CLI. The engine opens it through VSScript, which
/// discovers `VSSCRIPT_PATH`, the `vapoursynth` CLI's `get-vsscript` output, or the
/// platform library name. `vspipe` is not on that path and would misreport a machine that
/// has the library but not the pipe tool.
pub(super) fn vapoursynth() -> (Probe, PluginPresence) {
    let id = "vapoursynth";
    let label = "VapourSynth";

    let result = panic::catch_unwind(AssertUnwindSafe(
        || -> Result<(String, Vec<PluginProbe>), String> {
            // `Environment::new` panics when the VSScript API is absent, so check the
            // regular API first and catch the remaining load failures below.
            let _api = vapoursynth::api::API::get().ok_or_else(|| {
                "the VapourSynth API could not be loaded (set VSSCRIPT_PATH or install VapourSynth R70+)"
                    .to_owned()
            })?;
            let environment = vapoursynth::prelude::Environment::new().map_err(|error| {
                format!("the VSScript environment could not be created: {error}")
            })?;
            let core = environment
                .get_core()
                .map_err(|error| format!("the VapourSynth core could not be created: {error}"))?;
            let info = core.info();
            let version = info
                .version_string
                .lines()
                .map(str::trim)
                .find(|line| line.starts_with("Core "))
                .unwrap_or("VapourSynth core loaded");
            Ok((
                format!(
                    "{version} · API {}.{}",
                    info.api_version >> 16,
                    info.api_version & 0xffff
                ),
                plugin_probes(Some(&core)),
            ))
        },
    ));

    match result {
        Ok(Ok((detail, plugins))) => {
            let presence = PluginPresence {
                vship: plugins
                    .iter()
                    .any(|plugin| plugin.namespace == "vship" && plugin.available),
                vszip: plugins
                    .iter()
                    .any(|plugin| plugin.namespace == "vszip" && plugin.available),
            };
            let mut probe = Probe::found(id, label, Capability::Decode, detail);
            probe.plugins = plugins;
            (probe, presence)
        }
        Ok(Err(detail)) => {
            let mut probe = Probe::missing(
                id,
                label,
                Capability::Decode,
                detail,
                "Install VapourSynth for this platform and make sure the VSScript runtime is on PATH. Set `VSSCRIPT_PATH` for a portable install.",
            );
            probe.plugins = plugin_probes(None);
            (probe, PluginPresence::default())
        }
        Err(_) => {
            let mut probe = Probe::missing(
                id,
                label,
                Capability::Decode,
                "VSScript panicked while loading; check that Python and VapourSynth match the app architecture".to_owned(),
                "Install a VapourSynth build that matches the app architecture and Python version, then retry.",
            );
            probe.plugins = plugin_probes(None);
            (probe, PluginPresence::default())
        }
    }
}

pub(super) fn command(
    id: &str,
    label: &str,
    capability: Capability,
    binary: &str,
    args: &[&str],
    remediation: &str,
) -> Probe {
    probe_executable(id, label, capability, Path::new(binary), args, remediation)
}
