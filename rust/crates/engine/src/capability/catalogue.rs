//! The encoder catalogue the configuration UI renders.
//!
//! The list and every default parameter come from the engine's own `EncoderBase`, so a
//! fork that adds an encoder or changes a default changes the UI without a second table of
//! numbers here. Each entry carries the full engine `Encoder` document the service would
//! start from, which is what lets a project's encoder be replaced rather than merged.

use andean_condor::models::encoder::{Encoder, EncoderBase};

/// One encoder with its engine-provided defaults.
#[derive(Debug, Clone)]
pub struct EncoderSummary {
    /// The engine's wire id, for example `svt-av1`.
    pub id: String,
    /// Human-readable label.
    pub label: String,
    /// The engine `Encoder` document a new project starts from.
    pub default: serde_json::Value,
    /// The encoder's default CLI parameters, keyed by option name.
    pub parameters: serde_json::Value,
}

/// The engine's wire id for an `Encoder` document, for example `svt-av1`.
///
/// The service needs the id to look the encoder up in the preflight inventory; it must not
/// guess from the document's serde variant key, which is not the wire value.
pub fn base_id(document: &serde_json::Value) -> Option<String> {
    serde_json::from_value::<Encoder>(document.clone())
        .ok()
        .map(|encoder| encoder.base().to_string())
}

/// The friendly label for one engine `Encoder` document.
///
/// The scene table stores a complete encoder per scene, so the Scenes rail would otherwise
/// show a serde variant name (`SVTAV1`) or nothing. The label comes from the same catalogue
/// the encoder picker uses, so a renamed encoder reaches both surfaces. It reads the label
/// table directly: a detection checkpoint calls this once per scene, and constructing every
/// encoder's default document here would make that path scale with the catalogue rather
/// than with the row.
pub fn encoder_label(document: &serde_json::Value) -> Option<String> {
    let base = serde_json::from_value::<Encoder>(document.clone())
        .ok()?
        .base();
    labelled_bases()
        .into_iter()
        .find(|(candidate, _)| *candidate == base)
        .map(|(_, label)| label.to_owned())
}

/// The speed value a scene encoder currently carries, as a number.
///
/// The scene table stores a complete encoder, but the speed lives in a different parameter
/// for each encoder family. The engine's own `speed()` accessor is the only table of those
/// names, so a chart or reset must read it rather than guessing at `preset` or `cpu-used`.
pub fn encoder_speed(document: &serde_json::Value) -> Option<f64> {
    serde_json::from_value::<Encoder>(document.clone())
        .ok()?
        .speed()?
        .parse::<f64>()
        .ok()
}

/// Reject a document the engine cannot deserialize as an `Encoder`.
///
/// Saving an invalid encoder into a scene would only fail at encode time, after the
/// singleton was reserved. The check is deliberately the engine's own deserializer rather
/// than a second shape table.
pub fn validate_encoder(document: &serde_json::Value) -> Result<(), String> {
    serde_json::from_value::<Encoder>(document.clone())
        .map(|_| ())
        .map_err(|error| format!("The encoder is not a valid engine document: {error}"))
}

/// The one label table, so a picker entry and a scene row cannot disagree.
///
/// The labels are the engine enum's own names, not the executable names: `aomenc` and
/// `vpxenc` are how the binary is invoked, while a user choosing an encoder is choosing a
/// codec implementation. The wire id remains the executable family.
fn labelled_bases() -> [(EncoderBase, &'static str); 9] {
    [
        (EncoderBase::SVTAV1, "SVT-AV1"),
        (EncoderBase::AOM, "AOM"),
        (EncoderBase::RAV1E, "rav1e"),
        (EncoderBase::VPX, "VPX"),
        (EncoderBase::AVM, "AVM"),
        (EncoderBase::X264, "x264"),
        (EncoderBase::X265, "x265"),
        (EncoderBase::VVenC, "VVenC"),
        (EncoderBase::FFmpeg, "FFmpeg"),
    ]
}

/// Every encoder this build can offer, in the engine's declaration order.
///
/// `FFmpeg` is included because it is a real encoder path, not only a muxer; the UI decides
/// whether to show it based on the preflight row for its executable.
pub fn encoders() -> Vec<EncoderSummary> {
    labelled_bases()
        .into_iter()
        .filter_map(|(base, label)| {
            let encoder = Encoder::default_from_base(&base, false);
            let id: &'static str = base.into();
            Some(EncoderSummary {
                id: id.to_owned(),
                label: label.to_owned(),
                parameters: serde_json::to_value(encoder.parameters()).ok()?,
                default: serde_json::to_value(&encoder).ok()?,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_encoder_has_a_wire_id_and_round_trips_its_default() {
        let encoders = encoders();
        assert_eq!(encoders.len(), 9, "every EncoderBase variant is offered");
        for entry in encoders {
            assert!(!entry.id.is_empty(), "{} has no id", entry.label);
            assert!(
                entry.parameters.is_object(),
                "{} has no parameter map",
                entry.label
            );
            let parsed: Encoder =
                serde_json::from_value(entry.default).expect("the default document round-trips");
            assert_eq!(parsed.base().to_string(), entry.id);
        }
    }

    #[test]
    fn a_document_reports_its_catalogue_label() {
        let document =
            serde_json::to_value(Encoder::default_from_base(&EncoderBase::SVTAV1, false))
                .expect("the default encoder serialises");
        assert_eq!(encoder_label(&document).as_deref(), Some("SVT-AV1"));
        assert_eq!(encoder_label(&serde_json::json!(null)), None);
    }

    #[test]
    fn an_invalid_document_is_rejected_before_it_reaches_a_scene() {
        assert!(validate_encoder(&serde_json::json!({ "Nope": {} })).is_err());
        let valid = serde_json::to_value(Encoder::default_from_base(&EncoderBase::X264, false))
            .expect("the default encoder serialises");
        assert!(validate_encoder(&valid).is_ok());
    }

    #[test]
    fn a_document_reports_the_engines_wire_id() {
        let document =
            serde_json::to_value(Encoder::default_from_base(&EncoderBase::SVTAV1, false))
                .expect("the default encoder serialises");
        assert_eq!(base_id(&document).as_deref(), Some("svt-av1"));
        assert_eq!(base_id(&serde_json::json!(null)), None);
    }
}
