//! Optional external dependencies the engine can use.
//!
//! The probes live beside the engine adapter, not in the desktop host, so both the app and
//! the Phase 2 service report the same inventory. In particular, VapourSynth is loaded the
//! way the encoder loads it — through VSScript — and encoder executables are named by the
//! engine's own `EncoderBase` list rather than by a second, drifting table.

use std::{
    panic::{self, AssertUnwindSafe},
    path::Path,
    process::{Command, Output, Stdio},
    thread,
    time::{Duration, Instant},
};

use andean_condor::models::encoder::{Encoder, EncoderBase};

/// The capability a dependency provides.
///
/// A capability may have more than one provider, so the inventory is grouped by this value
/// rather than by executable name. A missing optional dependency removes only its own group.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Capability {
    Decode,
    Encode,
    Muxing,
    Metric,
    Application,
}

impl Capability {
    /// The stable wire value used by the HTTP contract and the UI group headings.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Decode => "decode",
            Self::Encode => "encode",
            Self::Muxing => "muxing",
            Self::Metric => "metric",
            Self::Application => "application",
        }
    }
}

/// One optional dependency the engine can use.
///
/// `available` is deliberately separate from `detail`: a probe that ran but found nothing
/// must still render as "not installed", never as a version string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Probe {
    /// Stable key, for example `vapoursynth` or `encoder:svt-av1`.
    pub id: String,
    /// Human-readable name for the dependency row.
    pub label: String,
    /// Capability group this dependency belongs to.
    pub capability: Capability,
    /// Whether the probe actually found and loaded the dependency.
    pub available: bool,
    /// Observed version, executable name, or the reason it is unavailable.
    pub detail: String,
    /// What to install or configure when the dependency is unavailable.
    pub remediation: Option<String>,
    /// Plugin namespaces checked inside this dependency, when it has any.
    pub plugins: Vec<PluginProbe>,
}

/// One plugin namespace a dependency exposes, such as a VapourSynth plugin.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginProbe {
    /// The namespace a script calls, for example `vszip`.
    pub namespace: String,
    /// Human-readable plugin name.
    pub label: String,
    /// Whether the loaded dependency exposes the namespace.
    pub available: bool,
    /// The path the plugin loaded from, or why it is absent.
    pub detail: String,
}

impl Probe {
    fn found(id: &str, label: &str, capability: Capability, detail: String) -> Self {
        Self {
            id: id.to_owned(),
            label: label.to_owned(),
            capability,
            available: true,
            detail,
            remediation: None,
            plugins: Vec::new(),
        }
    }

    fn missing(
        id: &str,
        label: &str,
        capability: Capability,
        detail: String,
        remediation: &str,
    ) -> Self {
        Self {
            id: id.to_owned(),
            label: label.to_owned(),
            capability,
            available: false,
            detail,
            remediation: Some(remediation.to_owned()),
            plugins: Vec::new(),
        }
    }
}

/// Probe every optional dependency once, in a stable order.
///
/// The service caches the result in `AppState` and serves it from `/api/health`; the UI
/// never re-runs `which` itself and the desktop host does not keep a second probe table.
pub fn detect() -> Vec<Probe> {
    let (vapoursynth, plugins) = vapoursynth();
    let mut probes = vec![
        vapoursynth,
        command(
            "ffmpeg",
            "FFmpeg",
            Capability::Muxing,
            "ffmpeg",
            &["-version"],
            "Install FFmpeg and put `ffmpeg` on PATH for muxing paths that shell out to it.",
        ),
        command(
            "mkvmerge",
            "MKVToolNix",
            Capability::Muxing,
            "mkvmerge",
            &["--version"],
            "Install MKVToolNix and put `mkvmerge` on PATH for the muxing fallback.",
        ),
    ];
    probes.extend(encoders());
    let libraries = andean_condor::metrics::libraries();
    probes.extend(metric_probes(&libraries, plugins));
    probes
}

mod runtime;
mod tools;

#[cfg(test)]
use runtime::PluginPresence;
use runtime::{command, metric_probes, vapoursynth};
use tools::encoders;
#[cfg(test)]
use tools::{ENCODER_BASES, encoder_id};
pub use tools::{ToolFamily, probe_executable, probe_tool};

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use andean_condor::metrics::MetricLibraryInfo;

    use super::{runtime::plugin_probes, *};

    fn library(name: &'static str, available: bool) -> MetricLibraryInfo {
        MetricLibraryInfo {
            name,
            available,
            version: available.then(|| "test".to_owned()),
            details: Vec::new(),
            devices: Vec::new(),
        }
    }

    fn metric<'a>(id: &str, probes: &'a [Probe]) -> &'a Probe {
        probes
            .iter()
            .find(|probe| probe.id == id)
            .expect("the metric row exists")
    }

    #[test]
    fn the_metric_table_follows_the_backend_columns() {
        let only_cpu = metric_probes(&[library("fmetrics", true)], PluginPresence::default());
        assert!(metric("metric:ssimulacra2", &only_cpu).available);
        assert!(metric("metric:butteraugli", &only_cpu).available);
        assert!(metric("metric:cvvdp", &only_cpu).available);
        assert!(!metric("metric:vmaf", &only_cpu).available);
        assert!(!metric("metric:xpsnr", &only_cpu).available);

        let only_plugin = metric_probes(
            &[],
            PluginPresence {
                vship: true,
                vszip: true,
            },
        );
        assert_eq!(
            metric("metric:ssimulacra2", &only_plugin).detail,
            "VapourSynth vship plugin"
        );
        assert!(metric("metric:xpsnr", &only_plugin).available);
        assert!(!metric("metric:vmaf", &only_plugin).available);
    }

    #[test]
    fn an_unavailable_metric_names_a_concrete_install() {
        let none = metric_probes(&[], PluginPresence::default());
        for id in [
            "metric:vmaf",
            "metric:ssimulacra2",
            "metric:butteraugli",
            "metric:cvvdp",
            "metric:xpsnr",
        ] {
            let row = metric(id, &none);
            assert!(!row.available, "{id}");
            assert!(row.remediation.is_some(), "{id}");
            assert_eq!(row.capability, Capability::Metric);
        }
        assert!(
            metric("metric:vmaf", &none)
                .remediation
                .as_deref()
                .is_some_and(|hint| hint.contains("libvmaf"))
        );
        assert!(
            metric("metric:xpsnr", &none)
                .remediation
                .as_deref()
                .is_some_and(|hint| hint.contains("vszip"))
        );
    }

    #[test]
    fn a_native_library_wins_over_the_plugin_and_reports_its_version() {
        let both = metric_probes(
            &[library("libvship", true), library("libvmaf", true)],
            PluginPresence {
                vship: true,
                vszip: true,
            },
        );
        assert_eq!(metric("metric:ssimulacra2", &both).detail, "libvship test");
        assert_eq!(metric("metric:vmaf", &both).detail, "libvmaf test");
    }

    #[test]
    fn every_encoder_has_a_unique_stable_probe_id() {
        let probes: Vec<Probe> = encoders().collect();
        assert_eq!(probes.len(), 9);

        let mut ids = HashSet::new();
        for probe in probes {
            assert!(probe.id.starts_with("encoder:"), "{}", probe.id);
            assert!(!probe.label.is_empty(), "{}", probe.id);
            assert!(ids.insert(probe.id.clone()), "duplicate {}", probe.id);
        }
    }

    #[test]
    fn a_missing_binary_is_reported_as_unavailable() {
        let probe = probe_executable(
            "missing",
            "Missing",
            Capability::Encode,
            Path::new("av1ation-definitely-not-installed"),
            &["--version"],
            "Install the custom executable.",
        );
        assert!(!probe.available);
        assert_eq!(probe.capability, Capability::Encode);
        assert!(probe.detail.contains("av1ation-definitely-not-installed"));
        assert_eq!(
            probe.remediation.as_deref(),
            Some("Install the custom executable.")
        );
    }

    #[test]
    fn capability_wire_values_are_stable() {
        assert_eq!(Capability::Decode.as_str(), "decode");
        assert_eq!(Capability::Encode.as_str(), "encode");
        assert_eq!(Capability::Muxing.as_str(), "muxing");
        assert_eq!(Capability::Metric.as_str(), "metric");
        assert_eq!(Capability::Application.as_str(), "application");
    }

    #[test]
    fn a_missing_runtime_still_names_the_plugins_a_script_can_require() {
        let plugins = plugin_probes(None);
        let namespaces: Vec<&str> = plugins
            .iter()
            .map(|plugin| plugin.namespace.as_str())
            .collect();
        for expected in [
            "bs",
            "ffms2",
            "dgdecodenv",
            "lsmas",
            "vszip",
            "mvu",
            "zoomv",
            "fgs",
            "vship",
        ] {
            assert!(namespaces.contains(&expected), "{expected}");
        }
        // Namespaces are the strings a script writes after `core.`; package names such as
        // `bestsource`, `mvutensils`, or `zoomvtools` never match a loaded plugin.
        for absent in [
            "bestsource",
            "mvutensils",
            "zoomvtools",
            "mvtools",
            "fmtconv",
        ] {
            assert!(!namespaces.contains(&absent), "{absent}");
        }
        assert_eq!(namespaces.len(), 9, "one row per required plugin");
        assert!(
            plugins
                .iter()
                .all(|plugin| !plugin.available && plugin.detail == "Not loaded")
        );
    }

    #[test]
    fn custom_families_round_trip_and_keep_their_capability() {
        for family in ToolFamily::ALL {
            assert_eq!(ToolFamily::parse(family.as_str()), Some(family));
            assert!(!family.label().is_empty());
            assert!(!family.executable_name().is_empty());
            assert!(!family.target_id().is_empty());
        }
        assert_eq!(ToolFamily::parse("not-a-tool"), None);
        assert_eq!(ToolFamily::Ffmpeg.capability(), Capability::Muxing);
        assert_eq!(ToolFamily::MkvMerge.capability(), Capability::Muxing);
        assert_eq!(ToolFamily::SvtAv1.capability(), Capability::Encode);
        assert_eq!(ToolFamily::Ffmpeg.target_id(), "ffmpeg");
        assert_eq!(ToolFamily::MkvMerge.target_id(), "mkvmerge");
    }

    #[test]
    fn every_engine_encoder_has_one_custom_family() {
        for base in ENCODER_BASES {
            let wire = base.to_string();
            let family = ToolFamily::parse(&wire)
                .unwrap_or_else(|| panic!("no custom family for engine encoder {wire}"));
            if wire == "ffmpeg" {
                // FFmpeg is also an `EncoderBase`, but its custom family satisfies the
                // muxing row, not an `encoder:` row.
                assert_eq!(family.target_id(), "ffmpeg");
                assert_eq!(family.capability(), Capability::Muxing);
            } else {
                assert_eq!(family.target_id(), encoder_id(base));
                assert_eq!(family.capability(), Capability::Encode);
            }
        }

        // Exactly one family per engine base, plus mkvmerge; FFmpeg is already an engine
        // base and its family is the muxing row rather than an `encoder:` row.
        assert_eq!(ToolFamily::ALL.len(), ENCODER_BASES.len() + 1);
        let mut wires: Vec<&str> = ToolFamily::ALL.iter().map(|f| f.as_str()).collect();
        wires.sort_unstable();
        wires.dedup();
        assert_eq!(wires.len(), ToolFamily::ALL.len());
    }

    #[test]
    fn a_family_only_accepts_its_own_version_stamp() {
        assert!(ToolFamily::SvtAv1.matches("SVT-AV1 Encoder Lib v2.3"));
        assert!(ToolFamily::Ffmpeg.matches("ffmpeg version 8.1 Copyright"));
        assert!(ToolFamily::X265.matches("x265 (build 4.1)"));
        assert!(!ToolFamily::X265.matches("x264 0.164"));
        assert!(!ToolFamily::Aom.matches("x264 0.164"));
        assert!(ToolFamily::Rav1e.matches("rav1e 0.8.0 (a2f01b3) (release)"));
        assert!(ToolFamily::VVenC.matches("vvencapp version 1.13.0 [Windows]"));
        assert!(ToolFamily::MkvMerge.matches("mkvmerge v103.0 ('The Darkness') 64-bit"));
        assert!(!ToolFamily::MkvMerge.matches("x264 0.164"));
    }

    #[test]
    fn the_two_aom_lineages_do_not_accept_each_other() {
        let av1 = "    av1    - AOMedia Project AV1 Encoder Psy101 3.13.0 (default)";
        let av2 = "    av2    - AOMedia Project AV2 Encoder 1.0.0 (default)";

        assert!(ToolFamily::Aom.matches(av1));
        assert!(!ToolFamily::Aom.matches(av2));
        assert!(ToolFamily::Avm.matches(av2));
        assert!(!ToolFamily::Avm.matches(av1));
    }
}
