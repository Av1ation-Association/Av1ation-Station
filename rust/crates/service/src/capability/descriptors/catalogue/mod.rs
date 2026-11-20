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
    use crate::capability::forks::KNOWN;
    use std::collections::BTreeMap;

    fn by_key(entries: &[CatalogueEntry]) -> BTreeMap<&'static str, CatalogueEntry> {
        entries.iter().map(|entry| (entry.key, *entry)).collect()
    }

    #[test]
    fn every_fork_states_only_real_differences_from_the_base() {
        let base = by_key(SVT_AV1);
        for known in &KNOWN {
            let id = known.id;
            let fork = forks::table(id).expect("a shipped fork has a table");
            let declared: BTreeMap<_, _> = fork
                .additions
                .iter()
                .chain(fork.overrides)
                .map(|entry| (entry.key, *entry))
                .collect();
            assert_eq!(
                declared.len(),
                fork.additions.len() + fork.overrides.len(),
                "{id} declares a key twice"
            );
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
                assert!(
                    base.get(entry.key).is_some_and(|base| base != entry),
                    "{id} overrides {} without a differing base row",
                    entry.key
                );
            }

            let composed = by_key(&fork_catalogue(id).expect("a composed fork table"));
            let expected: BTreeMap<_, _> = base
                .iter()
                .filter(|(key, _)| !fork.removals.contains(key))
                .map(|(key, entry)| (*key, *entry))
                .chain(declared)
                .collect();
            assert_eq!(composed, expected, "{id}");
        }
    }
}
