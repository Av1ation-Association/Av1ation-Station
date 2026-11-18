use std::collections::BTreeMap;

use av1ation_contracts::encoder::{EncoderFork, ParameterDescriptor, ParameterKey};

use crate::capability::descriptors;

/// A fork whose parameter table ships with the application.
///
/// The executable is still the user's: a known fork is a catalogue entry plus a saved path,
/// not a bundled binary. The table is app-owned so a new release can improve descriptions
/// without touching the user's settings.
pub(crate) struct KnownFork {
    pub(crate) id: &'static str,
    pub(crate) label: &'static str,
    pub(crate) base: &'static str,
    pub(crate) doc_link: &'static str,
    /// Flags whose presence in the full help identifies this profile.
    pub(crate) signatures: &'static [&'static str],
}

impl KnownFork {
    /// The shipped table, keyed by canonical CLI spelling.
    pub(crate) fn table(&self) -> BTreeMap<ParameterKey, ParameterDescriptor> {
        descriptors::fork_parameters(self.id, self.doc_link)
    }

    /// The settings record used when a known row has no saved state yet.
    pub(crate) fn seed(&self) -> EncoderFork {
        EncoderFork {
            id: self.id.to_owned(),
            label: self.label.to_owned(),
            base: self.base.to_owned(),
            executable: String::new(),
            version: None,
            profile: Some(self.id.to_owned()),
            warning: None,
            parameters: self.table(),
            parameters_edited: false,
        }
    }
}

pub(crate) const ESSENTIAL: KnownFork = KnownFork {
    id: "svt-av1-essential",
    label: "SVT-AV1-Essential",
    base: "svt-av1",
    doc_link: "https://github.com/nekotrix/SVT-AV1-Essential/blob/Essential-v4.3.0/Docs/Parameters.md",
    signatures: &[
        "--enable-alt-cdef",
        "--enable-alt-dlf",
        "--distortion-bias-preset",
    ],
};

pub(crate) const FIVE_FISH: KnownFork = KnownFork {
    id: "svt-av1-5fish",
    label: "SVT-AV1-5Fish",
    base: "svt-av1",
    doc_link: "https://github.com/5fish/SVT-AV1/blob/main/Docs/Parameters.md",
    signatures: &[
        "--lineart-psy-bias",
        "--texture-psy-bias",
        "--balancing-q-bias",
    ],
};

pub(crate) const ALL: [KnownFork; 2] = [ESSENTIAL, FIVE_FISH];

pub(crate) fn find(id: &str) -> Option<&'static KnownFork> {
    ALL.iter().find(|known| known.id == id)
}

/// Identify a build from its full help and version line.
///
/// 5Fish wins a tie: it incorporates features from other SVT forks, so a combined build
/// should not be labelled Essential just because one Essential flag is present.
pub(crate) fn detect(base: &str, help: &str, version: Option<&str>) -> Option<&'static KnownFork> {
    if base != "svt-av1" {
        return None;
    }
    if FIVE_FISH.signatures.iter().any(|flag| has_flag(help, flag)) {
        return Some(&FIVE_FISH);
    }
    if ESSENTIAL.signatures.iter().any(|flag| has_flag(help, flag))
        || version.is_some_and(|value| value.to_ascii_lowercase().contains("essential"))
    {
        return Some(&ESSENTIAL);
    }
    None
}

/// Whether a help line offers exactly this long option, rather than a prefix of another.
fn has_flag(help: &str, flag: &str) -> bool {
    help.lines().any(|line| {
        line.split_whitespace().any(|token| {
            let token = token.trim_end_matches(',');
            token == flag
                || token
                    .strip_prefix(flag)
                    .is_some_and(|rest| rest.starts_with('='))
        })
    })
}

/// The warning shown when a known row's executable does not show its signature.
pub(super) fn mismatch_warning(known: &KnownFork, detected: Option<&KnownFork>) -> Option<String> {
    if detected.is_some_and(|found| found.id == known.id) {
        return None;
    }
    let detected = detected.map_or("no shipped profile".to_owned(), |found| {
        found.label.to_owned()
    });
    Some(format!(
        "This build does not show the {} signature (detected: {}). The {} table is applied anyway; check that the binary is the build you intended.",
        known.label, detected, known.label
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_signature_flag_is_matched_as_a_whole_token() {
        let help = "--lineart-psy-bias [0-7]\n--enable-alt-cdef [0-3]\n";
        assert!(has_flag(help, "--lineart-psy-bias"));
        assert!(!has_flag("--lineart-psy-bias-long", "--lineart-psy-bias"));
    }

    #[test]
    fn five_fish_wins_a_tie() {
        let help = "--lineart-psy-bias [0-7]\n--enable-alt-cdef [0-3]\n";
        assert_eq!(
            detect("svt-av1", help, None).map(|known| known.id),
            Some("svt-av1-5fish")
        );
    }

    #[test]
    fn an_essential_banner_identifies_an_older_build() {
        assert_eq!(
            detect("svt-av1", "", Some("SVT-AV1-Essential v4.0.1")).map(|known| known.id),
            Some("svt-av1-essential")
        );
    }
}
