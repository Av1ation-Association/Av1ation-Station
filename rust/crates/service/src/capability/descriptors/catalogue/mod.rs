use super::*;
use std::collections::BTreeMap;

/// The shipped rows for a known fork: the base table with the fork's stated differences.
///
/// Composition is by canonical key. An override replaces the base row, an addition inserts a
/// row the base does not have, and a removal drops a row the fork's build does not accept.
/// Every other row is inherited, so one base correction reaches both forks.
pub(super) fn fork_catalogue(id: &str) -> Option<Vec<CatalogueEntry>> {
    let fork = forks::table(id)?;
    let mut rows: BTreeMap<&'static str, CatalogueEntry> =
        SVT_AV1.iter().map(|entry| (entry.key, *entry)).collect();
    for key in fork.removals {
        rows.remove(key);
    }
    for entry in fork.overrides.iter().chain(fork.additions) {
        rows.insert(entry.key, *entry);
    }
    Some(rows.into_values().collect())
}

pub(super) fn catalogue(id: &str) -> Option<(Delimiter, &'static [CatalogueEntry])> {
    let equals = || Delimiter::Joined("=".to_owned());
    let entry = match id {
        "svt-av1" => (Delimiter::Space, SVT_AV1),
        "aom" => (equals(), AOM),
        "rav1e" => (Delimiter::Space, RAV1E),
        "vpx" => (equals(), VPX),
        "avm" => (equals(), AVM),
        "x264" => (Delimiter::Space, X264),
        "x265" => (Delimiter::Space, X265),
        "vvenc" => (Delimiter::Space, VVENC),
        "ffmpeg" => (Delimiter::Space, FFMPEG),
        _ => return None,
    };
    Some(entry)
}

// `Docs/Parameters.md` in the SVT-AV1 repository is the source for this table: labels,
mod aom;
mod avm;
mod ffmpeg;
mod forks;
mod rav1e;
mod svt_av1;
mod vpx;
mod vvenc;
mod x264;
mod x265;
use aom::AOM;
use avm::AVM;
use ffmpeg::FFMPEG;
use rav1e::RAV1E;
use svt_av1::SVT_AV1;
use vpx::VPX;
use vvenc::VVENC;
use x264::X264;
use x265::X265;
pub(super) const fn entry(
    key: &'static str,
    label: &'static str,
    description: &'static str,
    group: &'static str,
    kind: CatalogueKind,
    advanced: bool,
) -> CatalogueEntry {
    entry_default(
        key,
        label,
        description,
        group,
        kind,
        advanced,
        CatalogueDefault::None,
    )
}

/// The same row with the default the encoder uses when the flag is not sent.
pub(super) const fn entry_default(
    key: &'static str,
    label: &'static str,
    description: &'static str,
    group: &'static str,
    kind: CatalogueKind,
    advanced: bool,
    default: CatalogueDefault,
) -> CatalogueEntry {
    CatalogueEntry {
        key,
        label,
        description,
        group,
        kind,
        advanced,
        default,
    }
}

pub(super) const fn flag() -> CatalogueKind {
    CatalogueKind::Flag
}

pub(super) const fn int(min: Option<f64>, max: Option<f64>) -> CatalogueKind {
    CatalogueKind::Integer {
        min,
        max,
        unit: None,
    }
}

/// An integer with the unit the encoder's help states for it.
pub(super) const fn int_unit(
    min: Option<f64>,
    max: Option<f64>,
    unit: &'static str,
) -> CatalogueKind {
    CatalogueKind::Integer {
        min,
        max,
        unit: Some(unit),
    }
}

pub(super) const fn float(min: Option<f64>, max: Option<f64>, step: Option<f64>) -> CatalogueKind {
    CatalogueKind::Float { min, max, step }
}

pub(super) const fn text() -> CatalogueKind {
    CatalogueKind::Text
}

pub(super) const fn choice(values: &'static [&'static str]) -> CatalogueKind {
    CatalogueKind::Choice(values)
}

pub(super) const fn numbered(values: &'static [(f64, &'static str)]) -> CatalogueKind {
    CatalogueKind::Numbered(values)
}

pub(super) const fn path(directory: bool) -> CatalogueKind {
    CatalogueKind::Path { directory }
}

pub(super) const fn number_default(value: f64) -> CatalogueDefault {
    CatalogueDefault::Number(value)
}

pub(super) const fn text_default(value: &'static str) -> CatalogueDefault {
    CatalogueDefault::Text(value)
}

#[cfg(test)]
mod tests {
    use super::svt_av1::SVT_AV1;
    use super::{fork_catalogue, forks};
    use crate::capability::descriptors::CatalogueEntry;
    use std::collections::BTreeMap;

    /// One fork's intentional differences from the base table, by key: additions,
    /// overrides, and removals.
    type Divergence = (
        &'static str,
        &'static [&'static str],
        &'static [&'static str],
        &'static [&'static str],
    );

    /// A row copied from the base belongs in inheritance, not in this list, and a new
    /// difference has to be named here, so an accidental copy fails this test.
    const DIVERGENCE: &[Divergence] = &[
        (
            "svt-av1-essential",
            &[
                "--dolby-vision-rpu",
                "--hdr10plus-json",
                "--fgs-seed",
                "--enable-alt-cdef",
                "--enable-alt-dlf",
                "--noise-adaptive-filtering",
                "--pin",
                "--distortion-bias-preset",
                "--noise-norm-strength",
                "--photon-noise",
                "--quality",
                "--tx-bias",
                "--zones",
                "--speed",
            ],
            &[
                "--enable-mfmv",
                "--scm",
                "--enable-cdef",
                "--enable-kf-tf",
                "--enable-restoration",
                "--enable-tf",
                "--asm",
                "--level",
                "--profile",
                "--tier",
                "--auto-tiling",
                "--tile-columns",
                "--tile-rows",
                "--ac-bias",
                "--adaptive-film-grain",
                "--chroma-qm-max",
                "--chroma-qm-min",
                "--complex-hvs",
                "--enable-qm",
                "--enable-variance-boost",
                "--film-grain",
                "--film-grain-denoise",
                "--lossless",
                "--luminance-qp-bias",
                "--photon-noise-chroma",
                "--qm-max",
                "--qm-min",
                "--sharp-tx",
                "--sharpness",
                "--tf-strength",
                "--tune",
                "--variance-boost-curve",
                "--variance-boost-strength",
                "--variance-octile",
                "--aq-mode",
                "--cqp",
                "--crf",
                "--gop-constraint-rc",
                "--max-qp",
                "--mbr",
                "--mbr-overshoot-pct",
                "--min-qp",
                "--passes",
                "--qp",
                "--qp-scale-compress-strength",
                "--rc",
                "--tbr",
                "--fast-decode",
                "--low-memory",
                "--preset",
                "--enable-dg",
                "--hierarchical-levels",
                "--irefresh-type",
                "--keyint",
                "--lookahead",
                "--min-keyint",
                "--pred-struct",
                "--scd",
                "--startup-mg-size",
            ],
            &[
                "--rtc",
                "--enable-dlf",
                "--enable-overlays",
                "--lp",
                "--input-depth",
                "--color-format",
                "--avif",
                "--progress",
                "--enable-stat-report",
                "--svtav1-params",
                "--hbd-mds",
            ],
        ),
        (
            "svt-av1-5fish",
            &[
                "--cdef-bias-damping-offset",
                "--cdef-bias-max-cdef",
                "--cdef-bias-max-sec-cdef-rel",
                "--cdef-bias-min-cdef",
                "--dlf-bias-max-dlf",
                "--dlf-bias-min-dlf",
                "--enable-tpl-la",
                "--photon-noise",
                "--texture-cdef-bias-max-cdef",
                "--texture-cdef-bias-max-sec-cdef-rel",
                "--texture-cdef-bias-min-cdef",
                "--dolby-vision-rpu",
                "--enable-hdr",
                "--hdr10plus-json",
                "--cdef-bias",
                "--dlf-bias",
                "--dlf-sharpness",
                "--filtering-noise-detection",
                "--noise-level-thr",
                "--alt-ssim-tuning",
                "--alt-tf-decay",
                "--fps",
                "--frame-luma-bias",
                "--kf-tf-strength",
                "--max-32-tx-size",
                "--nch",
                "--noise-norm-strength",
                "--psy-bias-coeff-lvl-offset",
                "--psy-bias-disable-me-8x8",
                "--psy-bias-disable-sgrproj",
                "--psy-bias-disable-warped-motion",
                "--psy-bias-inter-mode-bias",
                "--psy-bias-mds0-intra-inter-mode-bias",
                "--psy-bias-mds0-sad",
                "--psy-bias-optimize-b",
                "--psy-bias-qm-bias",
                "--psy-bias-sharpness-rounding",
                "--tx-bias",
                "--pin",
                "--lineart-psy-bias",
                "--lineart-variance-thr",
                "--noise-psy-bias",
                "--psy-bias-dg",
                "--texture-psy-bias",
                "--texture-psy-bias-optimize-b",
                "--texture-variance-thr",
                "--balancing-luminance-beta-bias",
                "--balancing-luminance-lambda-bias",
                "--balancing-mg-dist-r0-bias",
                "--balancing-noise-level-r0-bias",
                "--balancing-q-bias",
                "--balancing-r0-dampening-layer",
                "--balancing-texture-lambda-bias",
                "--balancing-tpl-intra-mode-beta-bias",
                "--balancing-variance-beta-bias",
                "--chroma-grain",
                "--lineart-energy-bias",
                "--satd-bias",
                "--static-fgs-seed",
                "--texture-ac-bias",
                "--texture-energy-bias",
                "--enable-alt-curve",
                "--low-q-taper",
            ],
            &[
                "--enable-mfmv",
                "--photon-noise-chroma",
                "--scm",
                "--roi-map-file",
                "--enable-cdef",
                "--enable-restoration",
                "--enable-tf",
                "--asm",
                "--hbd-mds",
                "--level",
                "--profile",
                "--sharp-tx",
                "--tile-columns",
                "--tile-rows",
                "--ac-bias",
                "--adaptive-film-grain",
                "--chroma-qm-max",
                "--chroma-qm-min",
                "--enable-qm",
                "--enable-variance-boost",
                "--film-grain",
                "--film-grain-denoise",
                "--luminance-qp-bias",
                "--qm-max",
                "--qm-min",
                "--sharpness",
                "--tf-strength",
                "--tune",
                "--variance-boost-strength",
                "--variance-octile",
                "--aq-mode",
                "--auto-tiling",
                "--crf",
                "--gop-constraint-rc",
                "--max-qp",
                "--mbr",
                "--min-qp",
                "--passes",
                "--qp",
                "--qp-scale-compress-strength",
                "--rc",
                "--tbr",
                "--fast-decode",
                "--preset",
                "--enable-dg",
                "--hierarchical-levels",
                "--irefresh-type",
                "--keyint",
                "--lookahead",
                "--min-keyint",
                "--pred-struct",
                "--scd",
                "--startup-mg-size",
                "--tier",
            ],
            &[
                "--lossless",
                "--complex-hvs",
                "--rtc",
                "--enable-dlf",
                "--enable-overlays",
                "--lp",
                "--input-depth",
                "--color-format",
                "--avif",
                "--progress",
                "--enable-stat-report",
                "--low-memory",
                "--svtav1-params",
                "--enable-intrabc",
                "--sframe-posi",
                "--sframe-qp",
                "--sframe-qp-offset",
                "--enable-kf-tf",
                "--max-tx-size",
                "--variance-boost-curve",
                "--cqp",
                "--max-inter-bitrate-pct",
                "--max-intra-bitrate-pct",
                "--startup-qp-offset",
                "--intra-period",
            ],
        ),
    ];

    fn by_key(entries: &[CatalogueEntry]) -> BTreeMap<&'static str, CatalogueEntry> {
        entries.iter().map(|entry| (entry.key, *entry)).collect()
    }

    #[test]
    fn the_fork_tables_state_every_difference_from_the_base() {
        let base = by_key(SVT_AV1);
        for (id, additions, overrides, removals) in DIVERGENCE {
            let fork = forks::table(id).expect("a declared fork");
            let declared_additions: Vec<_> = fork.additions.iter().map(|entry| entry.key).collect();
            assert_eq!(declared_additions.as_slice(), *additions, "{id} additions");
            let declared_overrides: Vec<_> = fork.overrides.iter().map(|entry| entry.key).collect();
            assert_eq!(declared_overrides.as_slice(), *overrides, "{id} overrides");
            assert_eq!(fork.removals, *removals, "{id} removals");

            let mut declared = BTreeMap::new();
            for entry in fork.additions.iter().chain(fork.overrides) {
                assert!(
                    declared.insert(entry.key, *entry).is_none(),
                    "{id} declares {} twice",
                    entry.key
                );
            }
            for key in fork.removals {
                assert!(
                    !declared.contains_key(key),
                    "{id} both removes and declares {key}"
                );
                assert!(
                    base.contains_key(key),
                    "{id} removes {key}, which the base does not have"
                );
            }
            for entry in fork.additions {
                assert!(
                    !base.contains_key(entry.key),
                    "{id} adds {}, which the base already has",
                    entry.key
                );
            }
            for entry in fork.overrides {
                let Some(base_entry) = base.get(entry.key) else {
                    panic!("{id} overrides {}, which the base does not have", entry.key);
                };
                assert_ne!(
                    entry, base_entry,
                    "{id} overrides {} with a copy of the base row",
                    entry.key
                );
            }

            let composed = by_key(&fork_catalogue(id).expect("a composed fork table"));
            let expected: BTreeMap<&str, CatalogueEntry> = base
                .iter()
                .filter(|(key, _)| !fork.removals.contains(key))
                .map(|(key, entry)| (*key, *entry))
                .chain(declared)
                .collect();
            assert_eq!(composed, expected, "{id}");
        }
    }
}
