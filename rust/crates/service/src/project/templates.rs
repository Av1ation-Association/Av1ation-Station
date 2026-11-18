//! Portable project-template files.
//!
//! A template is only useful on another machine when the machine-specific parts are gone.
//! Export and import share one sanitizer so a hand-edited archive cannot carry a path the
//! exporter would have removed, and the report names what was removed without repeating the
//! value.

use std::collections::BTreeSet;

use av1ation_contracts::{
    project::{
        ProjectTemplate, ProjectTemplateArchive, ProjectTemplateArchiveKind,
        ProjectTemplateArchiveTemplate, ProjectTemplateExportReport,
    },
    protocol::{InputKind, OutputMode},
    script::ScriptInputMode,
};
use serde_json::Value;

/// A template whose host-specific fields have been cleared.
#[derive(Debug)]
pub(crate) struct SanitizedTemplate {
    /// The portable document.
    pub(crate) template: ProjectTemplateArchiveTemplate,
    /// Labels for every cleared field, in stable order.
    pub(crate) removed: Vec<String>,
    /// Whether an inline script travels with the template.
    pub(crate) includes_scripts: bool,
    /// Whether script variables travel with the template.
    pub(crate) includes_variables: bool,
}

/// Build the file bytes and the report the export endpoint returns.
pub(crate) fn export_document(
    template: &ProjectTemplate,
) -> Result<(ProjectTemplateArchive, ProjectTemplateExportReport), String> {
    let sanitized = sanitize(ProjectTemplateArchiveTemplate {
        name: template.name.clone(),
        config: template.config.clone(),
        general: template.general.clone(),
    })?;
    let archive = ProjectTemplateArchive {
        kind: ProjectTemplateArchiveKind::ProjectTemplate,
        schema_version: 1,
        exported_at: crate::project::videos::iso8601(crate::project::videos::now_epoch()),
        template: sanitized.template,
    };
    let report = ProjectTemplateExportReport {
        removed: sanitized.removed,
        includes_scripts: sanitized.includes_scripts,
        includes_variables: sanitized.includes_variables,
    };
    Ok((archive, report))
}

/// Clear every field that names a path on the exporting machine.
///
/// A General file-mode script cannot be made portable: the file is the input, and an empty
/// path would be rejected on import. The one honest answer is to refuse the export and tell
/// the user to switch that input to inline text or to a different kind.
pub(crate) fn sanitize(
    mut template: ProjectTemplateArchiveTemplate,
) -> Result<SanitizedTemplate, String> {
    let mut removed = BTreeSet::new();
    let mut includes_scripts = false;
    let mut includes_variables = !template.general.variables.is_empty();

    if template.general.input_kind == InputKind::VapourSynthScript {
        let mode = template
            .general
            .script_mode
            .unwrap_or(ScriptInputMode::File);
        if mode == ScriptInputMode::File {
            return Err(
                "This template's General input opens a script file on this machine.".to_owned(),
            );
        }
        includes_scripts = template
            .general
            .script_text
            .as_deref()
            .is_some_and(|text| !text.trim().is_empty());
    }

    if template.general.output_folder.is_some()
        || template.general.output_mode == OutputMode::Folder
    {
        template.general.output_folder = None;
        template.general.output_mode = OutputMode::NextToInput;
        removed.insert("Output folder".to_owned());
    }
    if template.general.index_file.is_some() {
        template.general.index_file = None;
        removed.insert("FFMS2 index".to_owned());
    }
    if template.general.script.is_some() {
        template.general.script = None;
        removed.insert("Script file".to_owned());
    }

    sanitize_config(
        &mut template.config,
        &mut removed,
        &mut includes_scripts,
        &mut includes_variables,
    );

    Ok(SanitizedTemplate {
        template,
        removed: removed.into_iter().collect(),
        includes_scripts,
        includes_variables,
    })
}

/// A stable, filesystem-friendly download name for one template.
pub(crate) fn filename_for(name: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;
    for character in name.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            previous_dash = false;
        } else if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        return "template.json".to_owned();
    }
    let stem = slug
        .strip_suffix("-template")
        .filter(|stem| !stem.is_empty())
        .unwrap_or(slug);
    format!("{stem}-template.json")
}

fn sanitize_config(
    config: &mut Value,
    removed: &mut BTreeSet<String>,
    includes_scripts: &mut bool,
    includes_variables: &mut bool,
) {
    let Some(root) = config.as_object_mut() else {
        return;
    };
    if let Some(encoders) = root.get_mut("encoder").and_then(Value::as_object_mut) {
        for encoder in encoders.values_mut() {
            let Some(encoder) = encoder.as_object_mut() else {
                continue;
            };
            if encoder
                .get("executable")
                .and_then(Value::as_str)
                .is_some_and(|path| !path.trim().is_empty())
            {
                encoder.insert("executable".to_owned(), Value::Null);
                removed.insert("Custom encoder executable".to_owned());
            }
        }
    }

    let Some(sequences) = root.get_mut("sequences").and_then(Value::as_object_mut) else {
        return;
    };
    for (name, sequence) in sequences.iter_mut() {
        let Some(sequence) = sequence.as_object_mut() else {
            continue;
        };
        if sequence
            .get("scenes_directory")
            .and_then(Value::as_str)
            .is_some_and(|path| !path.trim().is_empty())
        {
            sequence.insert("scenes_directory".to_owned(), Value::String(String::new()));
            removed.insert("Scene directories".to_owned());
        }
        for key in ["input", "metric_input"] {
            let Some(input) = sequence.get_mut(key) else {
                continue;
            };
            let mut scan = InputScan::default();
            scan_input(input, &mut scan);
            *includes_scripts |= scan.scripts;
            *includes_variables |= scan.variables;
            if scan.has_path {
                *input = Value::Null;
                removed.insert("Sequence input paths".to_owned());
            }
        }

        if name == "scene_detector"
            && let Some(transnetv2) = sequence
                .get_mut("method")
                .and_then(Value::as_object_mut)
                .and_then(|method| method.get_mut("TransNetV2"))
                .and_then(Value::as_object_mut)
            && transnetv2
                .get("model_path")
                .and_then(Value::as_str)
                .is_some_and(|path| !path.trim().is_empty())
        {
            transnetv2.insert("model_path".to_owned(), Value::Null);
            removed.insert("TransNetV2 model path".to_owned());
        }

        if name == "scene_concatenator"
            && sequence
                .get("output")
                .and_then(Value::as_str)
                .is_some_and(|output| !output.trim().is_empty())
        {
            sequence.insert("output".to_owned(), Value::Null);
            removed.insert("Sequence output path".to_owned());
        }
    }
}

#[derive(Default)]
struct InputScan {
    has_path: bool,
    scripts: bool,
    variables: bool,
}

fn scan_input(input: &Value, scan: &mut InputScan) {
    let Some(object) = input.as_object() else {
        return;
    };
    for tag in ["Video", "VapourSynth"] {
        if let Some(body) = object.get(tag).and_then(Value::as_object)
            && body
                .get("path")
                .and_then(Value::as_str)
                .is_some_and(|path| !path.trim().is_empty())
        {
            scan.has_path = true;
        }
    }
    let Some(body) = object.get("VapourSynthScript").and_then(Value::as_object) else {
        return;
    };
    if let Some(source) = body.get("source").and_then(Value::as_object) {
        if source
            .get("Path")
            .and_then(Value::as_str)
            .is_some_and(|path| !path.trim().is_empty())
        {
            scan.has_path = true;
        }
        if source
            .get("Text")
            .and_then(Value::as_str)
            .is_some_and(|text| !text.trim().is_empty())
        {
            scan.scripts = true;
        }
    }
    if body
        .get("variables")
        .and_then(Value::as_object)
        .is_some_and(|variables| !variables.is_empty())
    {
        scan.variables = true;
    }
}

#[cfg(test)]
mod tests {
    use av1ation_contracts::settings::GeneralDefaults;
    use serde_json::json;

    use super::*;

    fn template(config: Value, general: GeneralDefaults) -> ProjectTemplateArchiveTemplate {
        ProjectTemplateArchiveTemplate {
            name: "Portable".to_owned(),
            config,
            general,
        }
    }

    #[test]
    fn export_clears_paths_without_echoing_them() {
        let config = json!({
            "encoder": { "SVTAV1": { "executable": "C:/Tools/x265.exe" } },
            "sequences": {
                "scene_detector": {
                    "input": { "Video": { "path": "C:/media/clip.mkv", "filters": [] } },
                    "method": { "TransNetV2": { "model_path": "C:/models/model.onnx" } }
                },
                "parallel_encoder": { "scenes_directory": "C:/scenes" },
                "scene_concatenator": {
                    "scenes_directory": "C:/scenes",
                    "output": "C:/media/out.mkv"
                }
            }
        });
        let sanitized = sanitize(template(config, GeneralDefaults::default())).expect("sanitize");

        assert_eq!(
            sanitized.template.config["encoder"]["SVTAV1"]["executable"],
            Value::Null
        );
        assert_eq!(
            sanitized.template.config["sequences"]["scene_detector"]["input"],
            Value::Null
        );
        assert_eq!(
            sanitized.template.config["sequences"]["scene_detector"]["method"]["TransNetV2"]["model_path"],
            Value::Null
        );
        assert_eq!(
            sanitized.template.config["sequences"]["parallel_encoder"]["scenes_directory"],
            ""
        );
        assert_eq!(
            sanitized.template.config["sequences"]["scene_concatenator"]["output"],
            Value::Null
        );
        assert_eq!(
            sanitized.removed,
            vec![
                "Custom encoder executable",
                "Scene directories",
                "Sequence input paths",
                "Sequence output path",
                "TransNetV2 model path",
            ]
        );
        let report = sanitized.removed.join(" ");
        assert!(!report.contains("C:/"));
    }

    #[test]
    fn inline_scripts_and_variables_are_reported_as_kept() {
        let mut general = GeneralDefaults {
            input_kind: InputKind::VapourSynthScript,
            script_mode: Some(ScriptInputMode::Text),
            script_text: Some("clip = core.std.BlankClip()".to_owned()),
            ..GeneralDefaults::default()
        };
        general
            .variables
            .insert("strength".to_owned(), "3".to_owned());
        let config = json!({
            "sequences": {
                "quality_check": {
                    "metric_input": {
                        "VapourSynthScript": {
                            "source": { "Text": "clip = core.std.BlankClip()" },
                            "variables": { "sigma": "2" }
                        }
                    }
                }
            }
        });
        let sanitized = sanitize(template(config, general)).expect("sanitize");

        assert!(sanitized.includes_scripts);
        assert!(sanitized.includes_variables);
    }

    #[test]
    fn a_general_script_file_refuses_export() {
        let general = GeneralDefaults {
            input_kind: InputKind::VapourSynthScript,
            script_mode: Some(ScriptInputMode::File),
            script: Some("C:/scripts/clip.vpy".to_owned()),
            ..GeneralDefaults::default()
        };
        let error = sanitize(template(json!({}), general)).expect_err("file mode is not portable");
        assert!(error.contains("script file"));
    }

    #[test]
    fn folder_output_becomes_next_to_input() {
        let general = GeneralDefaults {
            output_mode: OutputMode::Folder,
            output_folder: Some("D:/renders".to_owned()),
            ..GeneralDefaults::default()
        };
        let sanitized = sanitize(template(json!({}), general)).expect("sanitize");
        assert_eq!(
            sanitized.template.general.output_mode,
            OutputMode::NextToInput
        );
        assert_eq!(sanitized.template.general.output_folder, None);
        assert_eq!(sanitized.removed, vec!["Output folder"]);
    }

    #[test]
    fn filenames_are_slugged() {
        assert_eq!(filename_for("My Template"), "my-template.json");
        assert_eq!(filename_for("***"), "template.json");
    }
}
