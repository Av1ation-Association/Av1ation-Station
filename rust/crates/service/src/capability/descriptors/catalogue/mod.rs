use super::*;

/// The delimiter and curated rows for one engine encoder id.
///
/// The delimiter follows what the engine already seeds for that executable; adding a flag
/// with the other spelling would produce `--crf=25` for an encoder that expects `--crf 25`.
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
    CatalogueEntry {
        key,
        label,
        description,
        group,
        kind,
        advanced,
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
