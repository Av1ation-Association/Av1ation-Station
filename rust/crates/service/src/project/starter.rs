//! The one starter project template seeded into a data directory with no settings file.
//!
//! The document is compiled in so a first run has a complete, reviewed recipe without
//! shipping a user file or reaching the network. Once written it is an ordinary
//! `ProjectTemplate`: the user may edit or delete it, and it is never marked default
//! automatically.

use av1ation_contracts::project::ProjectTemplate;
use av1ation_contracts::settings::GeneralDefaults;
use serde::Deserialize;
use serde_json::Value;

use super::{config, projects, videos};

const STARTER_TEMPLATE_JSON: &str = include_str!("starter-template.json");

/// The name a fresh install sees. It is distinct from the list's default marker and from
/// the common user-created `Default` name, so the two concepts cannot be confused.
const STARTER_TEMPLATE_NAME: &str = "Recommended";

/// The subset of `ProjectTemplate` the seed file owns; the id and timestamp are generated
/// when the template is actually inserted.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StarterDocument {
    config: Value,
    general: GeneralDefaults,
}

/// Build the starter template, validating both documents before the service writes them.
///
/// A malformed compiled asset is a programming error, not a user error, but returning the
/// detail lets startup log it and continue with an empty template list instead of failing
/// the whole host.
pub(crate) fn project_template() -> Result<ProjectTemplate, String> {
    let document: StarterDocument = serde_json::from_str(STARTER_TEMPLATE_JSON)
        .map_err(|error| format!("the starter template is not valid JSON: {error}"))?;
    let engine = projects::default_config();
    config::validate(&document.config, &engine)?;
    let general = projects::validate_general(&document.general).map_err(|error| {
        format!(
            "the starter General section is invalid: {}",
            error.message()
        )
    })?;

    Ok(ProjectTemplate {
        id: uuid::Uuid::new_v4().to_string(),
        name: STARTER_TEMPLATE_NAME.to_owned(),
        config: document.config,
        general,
        updated_at: Some(videos::iso8601(videos::now_epoch())),
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn pointer<'a>(value: &'a Value, path: &str) -> &'a Value {
        value
            .pointer(path)
            .unwrap_or_else(|| panic!("the starter template has no {path}"))
    }

    #[test]
    fn the_starter_is_a_valid_recommended_template() {
        let starter = project_template().expect("the compiled starter is valid");

        assert_eq!(starter.name, "Recommended");
        assert!(uuid::Uuid::parse_str(&starter.id).is_ok());
        assert!(starter.updated_at.is_some());
        assert_eq!(
            starter.general.input_kind,
            av1ation_contracts::protocol::InputKind::Ffms2
        );
    }

    #[test]
    fn the_starter_carries_the_recipe_without_the_machine_scripts() {
        let starter = project_template().expect("the compiled starter is valid");
        let value = &starter.config;

        assert_eq!(
            pointer(value, "/encoder/SVTAV1/options/crf/Number/value"),
            &json!(25)
        );
        assert_eq!(
            pointer(value, "/encoder/SVTAV1/options/preset/Number/value"),
            &json!(4)
        );
        assert_eq!(
            pointer(value, "/encoder/SVTAV1/photon_noise/iso"),
            &json!(200)
        );
        assert_eq!(
            pointer(
                value,
                "/sequences/scene_detector/input/Video/filters/0/OutputFormat/height"
            ),
            &json!(540)
        );
        assert_eq!(
            pointer(
                value,
                "/sequences/scene_detector/input/Video/filters/0/OutputFormat/width"
            ),
            &json!(960)
        );
        assert_eq!(
            pointer(value, "/sequences/noise_scaler/threshold"),
            &json!(0.002)
        );
        assert_eq!(
            pointer(
                value,
                "/sequences/target_quality/metric/SSIMULACRA2/target_range"
            ),
            &json!([79, 81])
        );
        assert_eq!(
            pointer(
                value,
                "/sequences/target_quality/probing/strategy/Subset/length/Frames"
            ),
            &json!(11)
        );
        assert_eq!(
            pointer(
                value,
                "/sequences/target_quality/probing/strategy/Subset/position"
            ),
            &json!("Middle")
        );
        assert_eq!(
            pointer(
                value,
                "/sequences/target_quality/probing/encoder_options/preset/Number/value"
            ),
            &json!(6)
        );
        assert_eq!(
            pointer(value, "/sequences/parallel_encoder/workers"),
            &json!(2)
        );
        assert!(
            value
                .pointer("/sequences/scene_concatenator/method/mkvmerge")
                .is_some()
        );
        assert_eq!(
            pointer(value, "/sequences/target_quality/input"),
            &Value::Null
        );
        assert_eq!(
            pointer(value, "/sequences/parallel_encoder/input"),
            &Value::Null
        );

        let text = serde_json::to_string(value).expect("the starter serialises");
        assert!(!text.contains("VapourSynthScript"));
        assert!(!text.contains("sys.path"));
        assert!(!text.contains("P:"));
        assert!(starter.general.script.is_none());
        assert!(starter.general.index_file.is_none());
    }

    #[test]
    fn the_starter_has_no_unknown_configuration_sections() {
        let starter = project_template().expect("the compiled starter is valid");
        config::validate(&starter.config, &projects::default_config()).expect("known sections");
    }
}
