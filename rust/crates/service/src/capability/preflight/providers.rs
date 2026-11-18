use super::*;

/// What one dependency row offers: the source this process resolves and its alternatives.
#[derive(Default)]
pub(super) struct RowProviders {
    selected: Option<String>,
    providers: Vec<PreflightProvider>,
}

/// The runtime this process loaded plus the alternative Settings can choose next.
pub(super) fn vapoursynth_providers(provider: &ProviderState, probe: &Probe) -> RowProviders {
    let active_system = provider.selected == crate::capability::vapoursynth::Source::System;
    RowProviders {
        selected: Some(provider.selected.as_str().to_owned()),
        providers: vec![
            PreflightProvider {
                source: crate::capability::vapoursynth::Source::Bundled
                    .as_str()
                    .to_owned(),
                available: provider.bundled_available,
                detail: provider.bundled_detail.clone(),
                active: !active_system,
                checked: true,
            },
            PreflightProvider {
                source: crate::capability::vapoursynth::Source::System
                    .as_str()
                    .to_owned(),
                available: active_system && probe.available,
                detail: if active_system {
                    probe.detail.clone()
                } else {
                    "Restart with System selected to probe this machine's VapourSynth.".to_owned()
                },
                active: active_system,
                checked: active_system,
            },
        ],
    }
}

/// The metric backend this process loaded plus the alternative Settings can choose next.
pub(super) fn metric_providers(
    probe: &Probe,
    tools_dir: Option<&Path>,
    applied_metrics: Option<&str>,
) -> RowProviders {
    let library = tools_dir.and_then(|directory| toolchain::metric_library(directory, &probe.id));
    // The bundle supplies one library per metric family, so a process-wide `bundled` does
    // not mean every metric row is served by it: a metric whose library the target does
    // not stage still loads from the system installation.
    let bundled_active = applied_metrics == Some("bundled") && library.is_some();
    let selected = if bundled_active { "bundled" } else { "system" };
    RowProviders {
        selected: Some(selected.to_owned()),
        providers: vec![
            PreflightProvider {
                source: "bundled".to_owned(),
                available: library.is_some(),
                // A metric can have more than one bundled backend (libvship and fmetrics),
                // and the engine picks whichever can run. Naming one file would claim a
                // backend the row's own detail may contradict, so the card names the
                // directory the bundle stages.
                detail: library.as_ref().map_or_else(
                    || "No bundled library is staged for this metric.".to_owned(),
                    |path| {
                        format!(
                            "Bundled metric libraries · {}",
                            path.parent().unwrap_or(path).display()
                        )
                    },
                ),
                active: bundled_active,
                checked: true,
            },
            PreflightProvider {
                // The loader caches the library it opened and the hint points at
                // `tools/lib`, so the engine's probe is the bundled library. The machine's
                // own installation is only probed after a restart with System selected.
                source: "system".to_owned(),
                available: !bundled_active && probe.available,
                detail: if bundled_active {
                    "Restart with System selected to probe this machine's installation.".to_owned()
                } else {
                    probe.detail.clone()
                },
                active: !bundled_active,
                checked: !bundled_active,
            },
        ],
    }
}

/// The executable family this process resolves plus the alternative Settings can choose.
pub(super) fn executable_providers(
    family: ToolFamily,
    setting: &str,
    probe: &Probe,
    sources: &BTreeMap<String, String>,
    tools_dir: Option<&Path>,
) -> RowProviders {
    let bundled = tools_dir.map(|directory| toolchain::binary_path(directory, family));
    let bundled_present = bundled.as_ref().is_some_and(|path| path.is_file());
    let configured = sources.get(setting).map(String::as_str);
    let selected = match configured {
        Some("system") => "system",
        Some("bundled") => "bundled",
        _ if bundled_present => "bundled",
        _ => "system",
    };
    let bundled_active = selected == "bundled";
    // The service puts its own `ffmpeg`/`mkvmerge` link first on PATH, so while the bundle
    // is active the engine's PATH probe is the bundled program. The System alternative is
    // reported unchecked, like a non-selected VapourSynth runtime, instead of claiming the
    // bundled version as the machine's installation.
    let system_shadowed =
        bundled_active && matches!(family, ToolFamily::Ffmpeg | ToolFamily::MkvMerge);
    let bundled_detail = bundled.as_ref().map_or_else(
        || "This build carries no bundled toolchain.".to_owned(),
        |path| {
            if path.is_file() {
                format!("Bundled executable · {}", path.display())
            } else {
                format!("The bundled executable is missing ({})", path.display())
            }
        },
    );
    RowProviders {
        selected: Some(selected.to_owned()),
        providers: vec![
            PreflightProvider {
                source: "bundled".to_owned(),
                available: bundled_present,
                detail: bundled_detail,
                active: bundled_active,
                checked: true,
            },
            PreflightProvider {
                source: "system".to_owned(),
                available: !system_shadowed && probe.available,
                detail: if system_shadowed {
                    "Restart with System selected to probe this machine's installation.".to_owned()
                } else {
                    probe.detail.clone()
                },
                active: !bundled_active,
                checked: !system_shadowed,
            },
        ],
    }
}

pub(super) fn check_from(
    probe: Probe,
    path: Option<String>,
    vapoursynth: Option<&ProviderState>,
    sources: &BTreeMap<String, String>,
    tools_dir: Option<&Path>,
    applied_metrics: Option<&str>,
) -> PreflightCheck {
    let custom = path.is_some();
    let is_vapoursynth = probe.id == crate::capability::vapoursynth::SETTING_ID;
    let setting = toolchain::setting_id(&probe.id);
    // The saved choice belongs to the capability, not to the row: every metric row reads
    // the one `metrics` key, and the FFmpeg encoder row shares `ffmpeg` with the muxer row.
    let configured_source = setting
        .as_deref()
        .and_then(|setting| sources.get(setting).cloned());
    let RowProviders {
        selected: selected_source,
        providers,
    } = if is_vapoursynth {
        vapoursynth.map_or_else(RowProviders::default, |provider| {
            vapoursynth_providers(provider, &probe)
        })
    } else if let Some(setting) = &setting {
        if setting == toolchain::METRICS_ID {
            metric_providers(&probe, tools_dir, applied_metrics)
        } else if let Some(family) = toolchain::family_for_setting(setting) {
            executable_providers(family, setting, &probe, sources, tools_dir)
        } else {
            RowProviders::default()
        }
    } else {
        RowProviders::default()
    };

    // A bundled executable does not need a PATH probe: its absolute path is what the launcher
    // writes into the run document. Its presence is the availability fact, and the detail
    // names the path so a broken stage is visible instead of silently falling back.
    let bundled_selected = !is_vapoursynth
        && setting.as_deref() != Some(toolchain::METRICS_ID)
        && selected_source.as_deref() == Some("bundled");
    let (available, detail, remediation) = if bundled_selected {
        let bundled = setting
            .as_deref()
            .and_then(toolchain::family_for_setting)
            .and_then(|family| {
                tools_dir.map(|directory| toolchain::binary_path(directory, family))
            });
        match bundled {
            Some(path) if path.is_file() => (true, format!("Bundled · {}", path.display()), None),
            _ => (
                false,
                "The selected bundled executable is missing.".to_owned(),
                Some("Choose System, or reinstall the release toolchain.".to_owned()),
            ),
        }
    } else {
        (probe.available, probe.detail, probe.remediation)
    };

    PreflightCheck {
        id: probe.id,
        label: probe.label,
        capability: probe.capability.as_str().to_owned(),
        available,
        detail,
        remediation,
        origin: custom.then(|| "custom".to_owned()),
        path,
        selected_source,
        configured_source,
        providers,
        plugins: probe
            .plugins
            .into_iter()
            .map(|plugin| PreflightPlugin {
                namespace: plugin.namespace,
                label: plugin.label,
                available: plugin.available,
                detail: plugin.detail,
            })
            .collect(),
    }
}
