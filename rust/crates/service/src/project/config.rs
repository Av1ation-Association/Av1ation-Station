//! Effective configuration resolution and provenance.
//!
//! Resolution walks the engine's own serialised default document. That document is
//! emitted by `andean-condor`, so the field list is generated rather than maintained by
//! hand. A leaf is any non-object value, including `null` (an unset optional sequence)
//! and a list (which replaces as a unit). An object is a section whose keys resolve
//! individually, which is what stops an override of one leaf from dropping its siblings.
//!
//! A section the project supplies with a key the default does not have is treated as a
//! whole replacement. Externally tagged engine enums (`encoder`, `scene_detector.method`)
//! serialise that way, so changing the variant replaces the section instead of inventing
//! child paths the variant does not own.

use std::collections::BTreeMap;

use av1ation_contracts::settings::{EffectiveConfig, ResolvedValue, ValueSource};
use serde_json::{Map, Value};

/// Every addressable leaf path in a configuration document, sorted.
///
/// This is also the set an override may address, so an override cannot point at a section
/// path and silently replace the section's siblings.
pub(crate) fn leaf_paths(defaults: &Value) -> Vec<String> {
    let mut paths = Vec::new();
    if let Value::Object(root) = defaults {
        for (key, value) in root {
            collect(value, key, &mut paths);
        }
    }
    paths
}

fn collect(value: &Value, path: &str, paths: &mut Vec<String>) {
    match value {
        Value::Object(fields) if !fields.is_empty() => {
            for (key, child) in fields {
                collect(child, &join(path, key), paths);
            }
        }
        _ => paths.push(path.to_owned()),
    }
}

fn join(prefix: &str, key: &str) -> String {
    if prefix.is_empty() {
        key.to_owned()
    } else {
        format!("{prefix}.{key}")
    }
}

/// Whether a video may replace one whole configuration section at `path`.
///
/// A video inherits or replaces at the level the UI offers — one sequence, or the encoder —
/// rather than leaf by leaf. That matters when a section changes shape: choosing a different
/// encoder variant writes one replacement document, while leaf overrides would leave the
/// inherited variant's options beside the chosen one and hand the engine two encoders. Only
/// the two roots the engine document actually has are addressable this way.
///
/// Leaf paths remain addressable for callers that need a single field; `accepts_override` is
/// the wider check the video route applies.
pub(crate) fn accepts_override(defaults: &Value, path: &str) -> bool {
    let segments: Vec<&str> = path.split('.').collect();
    let section = matches!(segments.as_slice(), ["encoder"] | ["sequences", _]);
    if !section {
        return false;
    }
    let mut cursor = defaults;
    for segment in segments {
        let Some(next) = cursor.get(segment) else {
            return false;
        };
        cursor = next;
    }
    true
}

/// Check a replacement configuration document against the default document's shape.
///
/// Unknown top-level sections and unknown fields in a multi-field section are rejected, so
/// a typo is caught here. A one-key section whose child is unknown is accepted as a
/// replacement, because externally tagged engine enums serialise exactly that way and the
/// engine's own `validate()` owns the semantics of the variant.
pub(crate) fn validate(document: &Value, defaults: &Value) -> Result<(), String> {
    let (Some(fields), Value::Object(default_root)) = (document.as_object(), defaults) else {
        return Err(format!(
            "A configuration must be a JSON object, not {}.",
            kind(document)
        ));
    };
    for key in fields.keys() {
        if !default_root.contains_key(key) {
            return Err(format!("`{key}` is not a known configuration section."));
        }
    }
    for (key, value) in fields {
        if let Some(default) = default_root.get(key) {
            validate_node(value, default, key)?;
        }
    }
    Ok(())
}

/// The engine's `Option<...>` sequence configurations.
///
/// Their default document value is the config the engine ships, not `null`, so shape alone
/// cannot tell that `null` is a valid value: `null` is how a sequence is switched off.
/// Writing one has to survive validation or Disable silently fails and the draft stays dirty.
const OPTIONAL_SEQUENCES: &[&str] = &[
    "noise_detector",
    "noise_scaler",
    "target_quality",
    "quality_check",
];

/// Whether an address may hold a JSON `null` even though its default does not.
///
/// Every sequence input is `Option<Input>`: absent means "inherit the General input", which
/// is exactly what the override editor writes when the user clears the override.
fn is_nullable(path: &str) -> bool {
    let Some(rest) = path.strip_prefix("sequences.") else {
        return false;
    };
    if !rest.contains('.') {
        return OPTIONAL_SEQUENCES.contains(&rest);
    }
    rest.ends_with(".input") || rest.ends_with(".metric_input")
}

fn validate_node(value: &Value, default: &Value, path: &str) -> Result<(), String> {
    if value.is_null() && is_nullable(path) {
        return Ok(());
    }
    if is_encoder_options(path) {
        return if value.is_object() {
            Ok(())
        } else {
            Err(format!("`{path}` must be an object, not {}.", kind(value)))
        };
    }
    if path == "sequences.scene_concatenator.method" && value == "Ivf" {
        // `ConcatMethod::Ivf` is a unit enum variant, so it serialises as a string while
        // the default variant is an externally tagged object. The variant has no fields
        // to validate; an unknown string still falls through to the object check.
        return Ok(());
    }
    match default {
        Value::Object(default_fields) if !default_fields.is_empty() => {
            let Some(fields) = value.as_object() else {
                return Err(format!(
                    "`{path}` is a configuration section and must be an object, not {}.",
                    kind(value)
                ));
            };
            if is_replacement_variant(default_fields, fields) {
                return Ok(());
            }
            for (key, child) in fields {
                let child_path = join(path, key);
                let Some(child_default) = default_fields.get(key) else {
                    return Err(format!(
                        "`{child_path}` is not a known configuration field."
                    ));
                };
                validate_node(child, child_default, &child_path)?;
            }
            Ok(())
        }
        Value::Object(_) => {
            if value.is_object() {
                Ok(())
            } else {
                Err(format!("`{path}` must be an object, not {}.", kind(value)))
            }
        }
        default if same_kind(default, value) => Ok(()),
        default => Err(format!(
            "`{path}` must be {}, not {}.",
            kind(default),
            kind(value)
        )),
    }
}

/// Encoder parameters are descriptor-backed, not a closed section in the default document.
/// A new release can offer a parameter the stored defaults do not mention (for example SVT's
/// `tune`), and the engine validates the resulting encoder document. Keeping this map open
/// is what lets that descriptor-backed parameter save instead of looking like a typo.
fn is_encoder_options(path: &str) -> bool {
    path.starts_with("encoder.") && path.ends_with(".options")
}

/// A one-key object whose key the default section does not own is a replacement variant,
/// not a field. A multi-field section never qualifies, so a typo cannot hide there.
fn is_replacement_variant(default: &Map<String, Value>, supplied: &Map<String, Value>) -> bool {
    default.len() == 1
        && supplied.len() == 1
        && supplied.keys().all(|key| !default.contains_key(key))
}

fn same_kind(default: &Value, value: &Value) -> bool {
    matches!(
        (default, value),
        (Value::Null, _)
            | (Value::Bool(_), Value::Bool(_))
            | (Value::Number(_), Value::Number(_))
            | (Value::String(_), Value::String(_))
            | (Value::Array(_), Value::Array(_))
    )
}

fn kind(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "a boolean",
        Value::Number(_) => "a number",
        Value::String(_) => "a string",
        Value::Array(_) => "a list",
        Value::Object(_) => "an object",
    }
}

/// Resolve every leaf from the project document, then the video overrides, then the
/// engine defaults.
///
/// The project document is a full copy of the defaults at creation, so a leaf that still
/// equals its default reports `Default`. That is the only provenance a full-copy document
/// can prove; an explicit edit back to the default value is indistinguishable from never
/// having edited it.
pub(crate) fn resolve(
    defaults: &Value,
    project: &Value,
    overrides: &BTreeMap<String, Value>,
) -> EffectiveConfig {
    let mut values = BTreeMap::new();
    if let (Value::Object(default_root), Value::Object(project_root)) = (defaults, project) {
        for key in union_keys(default_root, project_root) {
            resolve_node(
                default_root.get(&key),
                project_root.get(&key),
                overrides,
                &key,
                &mut values,
            );
        }
    }

    // An override the walk could not reach still belongs to the result. Validation rejects
    // such a path, so this only keeps the resolver total for callers that do not validate.
    for (path, value) in overrides {
        values.entry(path.clone()).or_insert_with(|| ResolvedValue {
            value: value.clone(),
            source: ValueSource::Overridden,
        });
    }

    EffectiveConfig {
        values,
        updated_at: None,
    }
}

fn resolve_node(
    default: Option<&Value>,
    project: Option<&Value>,
    overrides: &BTreeMap<String, Value>,
    path: &str,
    out: &mut BTreeMap<String, ResolvedValue>,
) {
    if let Some(overridden) = overrides.get(path) {
        out.insert(
            path.to_owned(),
            ResolvedValue {
                value: overridden.clone(),
                source: ValueSource::Overridden,
            },
        );
        return;
    }

    if is_encoder_options(path)
        && let (Some(Value::Object(default_fields)), Some(Value::Object(project_fields))) =
            (default, project)
    {
        if default_fields.is_empty() && project_fields.is_empty() {
            // An empty descriptor-backed map is still a leaf. Skipping it made the resolved
            // table omit the encoder's options while the engine document still had them.
            out.insert(
                path.to_owned(),
                ResolvedValue {
                    value: project
                        .cloned()
                        .unwrap_or_else(|| Value::Object(Map::new())),
                    source: ValueSource::Default,
                },
            );
            return;
        }
        for key in union_keys(default_fields, project_fields) {
            resolve_node(
                default_fields.get(&key),
                project_fields.get(&key),
                overrides,
                &join(path, &key),
                out,
            );
        }
        return;
    }

    match (default, project) {
        (Some(Value::Object(default_fields)), Some(Value::Object(project_fields)))
            if !default_fields.is_empty() && !replaces_section(default_fields, project_fields) =>
        {
            for key in union_keys(default_fields, project_fields) {
                resolve_node(
                    default_fields.get(&key),
                    project_fields.get(&key),
                    overrides,
                    &join(path, &key),
                    out,
                );
            }
        }
        (Some(Value::Object(default_fields)), None) if !default_fields.is_empty() => {
            for (key, child) in default_fields {
                resolve_node(Some(child), None, overrides, &join(path, key), out);
            }
        }
        (Some(default_value), Some(project_value)) => {
            out.insert(
                path.to_owned(),
                ResolvedValue {
                    value: project_value.clone(),
                    source: if values_equal(default_value, project_value) {
                        ValueSource::Default
                    } else {
                        ValueSource::Inherited
                    },
                },
            );
        }
        (Some(default_value), None) => {
            out.insert(
                path.to_owned(),
                ResolvedValue {
                    value: default_value.clone(),
                    source: ValueSource::Default,
                },
            );
        }
        (None, Some(project_value)) => {
            out.insert(
                path.to_owned(),
                ResolvedValue {
                    value: project_value.clone(),
                    source: ValueSource::Inherited,
                },
            );
        }
        (None, None) => {}
    }
}

/// A supplied section is a replacement when it carries a key the default section does not
/// own. Externally tagged enums serialise as a one-key object whose key is the variant.
fn replaces_section(default: &Map<String, Value>, supplied: &Map<String, Value>) -> bool {
    supplied
        .keys()
        .any(|key| !default.contains_key(key) || key.contains('.'))
}

fn union_keys(left: &Map<String, Value>, right: &Map<String, Value>) -> Vec<String> {
    let mut keys: Vec<String> = left.keys().chain(right.keys()).cloned().collect();
    keys.sort();
    keys.dedup();
    keys
}

/// Numbers compare by value so `1` and `1.0` are not reported as an edit.
fn values_equal(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Number(left), Value::Number(right)) => left
            .as_f64()
            .zip(right.as_f64())
            .is_some_and(|(left, right)| (left - right).abs() < f64::EPSILON),
        _ => left == right,
    }
}

/// Build the fully materialised document an encode worker receives.
///
/// The worker owns this value, so nothing it reads can change under it. Per-scene encoder
/// materialisation joins this snapshot when the encode pipeline lands.
pub(crate) fn materialise(
    defaults: &Value,
    project: &Value,
    overrides: &BTreeMap<String, Value>,
) -> Value {
    let resolved = resolve(defaults, project, overrides);
    let mut root = Map::new();
    for (path, resolved) in resolved.values {
        insert_path(&mut root, &path, resolved.value);
    }
    Value::Object(root)
}

/// Apply the machine-level TransNetV2 model to a run's materialised document.
///
/// The model file is an application setting, not project configuration: one file serves
/// every project, and the engine searches its bundle and cache only when no path is
/// configured. A project document that already pins `model_path` keeps its own value, so
/// an advanced per-project override is never overwritten by the machine-wide default.
pub(crate) fn pin_scene_model(document: &mut Value, model: &str) {
    let Some(method) = document
        .get_mut("sequences")
        .and_then(|sequences| sequences.get_mut("scene_detector"))
        .and_then(|scene| scene.get_mut("method"))
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    let Some(transnetv2) = method.get_mut("TransNetV2").and_then(Value::as_object_mut) else {
        return;
    };
    let unset = transnetv2.get("model_path").is_none_or(Value::is_null);
    if unset {
        transnetv2.insert("model_path".to_owned(), Value::String(model.to_owned()));
    }
}

/// Give every per-sequence decode the source it reads when it names none.
///
/// A project or template document describes a decode, not a file: a sequence input carries
/// the kind, the filters and the script, but its path would point every video at one file,
/// so it is absent (or empty) there. Each video supplies the file, exactly as andean-condor's
/// `Option<Input>` inherits the run's input when a sequence has none. The launch route calls
/// this once per run, before the document reaches the engine, so every `Input::Video` and
/// `Input::VapourSynth` the engine receives has a concrete path. A video context keeps any
/// path it states and is never overwritten.
pub(crate) fn inherit_sequence_inputs(document: &mut Value, source: &str) {
    let Some(sequences) = document.get_mut("sequences").and_then(Value::as_object_mut) else {
        return;
    };
    for sequence in sequences.values_mut() {
        let Some(object) = sequence.as_object_mut() else {
            continue;
        };
        for key in ["input", "metric_input"] {
            if let Some(input) = object.get_mut(key) {
                fill_input_path(input, source);
            }
        }
    }
}

fn fill_input_path(input: &mut Value, source: &str) {
    let Some(object) = input.as_object_mut() else {
        return;
    };
    for tag in ["Video", "VapourSynth"] {
        let Some(body) = object.get_mut(tag).and_then(Value::as_object_mut) else {
            continue;
        };
        let unset = body
            .get("path")
            .and_then(Value::as_str)
            .is_none_or(|path| path.trim().is_empty());
        if unset {
            body.insert("path".to_owned(), Value::String(source.to_owned()));
        }
    }
}

fn insert_path(root: &mut Map<String, Value>, path: &str, value: Value) {
    let mut segments = path.split('.').peekable();
    let mut cursor = root;
    while let Some(segment) = segments.next() {
        if segments.peek().is_none() {
            cursor.insert(segment.to_owned(), value);
            return;
        }
        let Some(next) = cursor
            .entry(segment.to_owned())
            .or_insert_with(|| Value::Object(Map::new()))
            .as_object_mut()
        else {
            return;
        };
        cursor = next;
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use proptest::prelude::*;
    use serde_json::json;

    use super::*;

    fn defaults() -> Value {
        json!({
            "encoder": {
                "SVTAV1": { "options": {}, "pass": { "All": 1 } }
            },
            "sequences": {
                "scene_detector": {
                    "method": {
                        "AVSceneChange": {
                            "maximum_length": 240,
                            "minimum_length": 24,
                            "save_scores": false
                        }
                    }
                },
                "target_quality": null,
                "parallel_encoder": {
                    "workers": null,
                    "scenes_directory": ""
                },
                "scene_concatenator": {
                    "method": { "mkvmerge": { "extra_inputs": [] } }
                }
            }
        })
    }

    #[test]
    fn every_default_leaf_is_resolved_as_a_default() {
        let defaults = defaults();
        let resolved = resolve(&defaults, &defaults, &BTreeMap::new());
        let paths: BTreeSet<String> = resolved.values.keys().cloned().collect();

        assert_eq!(paths, leaf_paths(&defaults).into_iter().collect());
        assert!(
            resolved
                .values
                .values()
                .all(|value| value.source == ValueSource::Default)
        );
        // A section is not a leaf; its children are.
        assert!(!paths.contains("sequences"));
        assert!(!paths.contains("sequences.parallel_encoder"));
        assert!(paths.contains("sequences.parallel_encoder.workers"));
        // A list is one leaf, so it replaces as a unit.
        assert!(paths.contains("sequences.scene_concatenator.method.mkvmerge.extra_inputs"));
    }

    #[test]
    fn a_project_leaf_overrides_only_itself() {
        let defaults = defaults();
        let project = json!({
            "sequences": {
                "parallel_encoder": { "workers": 16 }
            }
        });
        let resolved = resolve(&defaults, &project, &BTreeMap::new());

        assert_eq!(
            resolved.values["sequences.parallel_encoder.workers"].value,
            json!(16)
        );
        assert_eq!(
            resolved.values["sequences.parallel_encoder.workers"].source,
            ValueSource::Inherited
        );
        assert_eq!(
            resolved.values["sequences.parallel_encoder.scenes_directory"].source,
            ValueSource::Default
        );
        assert_eq!(
            resolved.values["sequences.scene_detector.method.AVSceneChange.minimum_length"].value,
            json!(24)
        );
    }

    #[test]
    fn a_video_override_wins_over_the_project_and_nothing_else_is_overridden() {
        let defaults = defaults();
        let project = json!({ "sequences": { "parallel_encoder": { "workers": 16 } } });
        let overrides = BTreeMap::from([
            ("sequences.parallel_encoder.workers".to_owned(), json!(8)),
            (
                "sequences.scene_detector.method.AVSceneChange.minimum_length".to_owned(),
                json!(12),
            ),
        ]);

        let resolved = resolve(&defaults, &project, &overrides);

        assert_eq!(
            resolved.values["sequences.parallel_encoder.workers"].value,
            json!(8)
        );
        assert_eq!(
            resolved.values["sequences.parallel_encoder.workers"].source,
            ValueSource::Overridden
        );
        let overridden: BTreeSet<&String> = resolved
            .values
            .iter()
            .filter(|(_, value)| value.source == ValueSource::Overridden)
            .map(|(path, _)| path)
            .collect();
        assert_eq!(
            overridden,
            overrides.keys().collect::<BTreeSet<_>>(),
            "an override set a path its map did not name"
        );
    }

    #[test]
    fn a_replacement_encoder_variant_is_one_value_and_drops_the_old_variant() {
        let defaults = defaults();
        let project = json!({
            "encoder": { "x264": { "options": { "--crf": 20 } } }
        });
        let resolved = resolve(&defaults, &project, &BTreeMap::new());

        assert_eq!(
            resolved.values["encoder"].value,
            json!({ "x264": { "options": { "--crf": 20 } } })
        );
        assert_eq!(resolved.values["encoder"].source, ValueSource::Inherited);
        assert!(!resolved.values.contains_key("encoder.SVTAV1.options"));
        assert!(!resolved.values.contains_key("encoder.SVTAV1.pass.All"));
    }

    #[test]
    fn a_null_optional_section_is_a_leaf_and_accepts_its_replacement() {
        let defaults = defaults();
        let project = json!({
            "sequences": { "target_quality": { "maximum_probes": 4, "metric": "SSIMULACRA2" } }
        });
        let resolved = resolve(&defaults, &project, &BTreeMap::new());

        assert_eq!(
            resolved.values["sequences.target_quality"].value,
            json!({ "maximum_probes": 4, "metric": "SSIMULACRA2" })
        );
        assert_eq!(
            resolved.values["sequences.target_quality"].source,
            ValueSource::Inherited
        );
    }

    #[test]
    fn the_materialised_document_contains_every_leaf_once() {
        let defaults = defaults();
        let project = json!({ "sequences": { "parallel_encoder": { "workers": 16 } } });
        let overrides = BTreeMap::from([(
            "sequences.scene_detector.method.AVSceneChange.minimum_length".to_owned(),
            json!(12),
        )]);

        let materialised = materialise(&defaults, &project, &overrides);

        assert_eq!(
            materialised["sequences"]["parallel_encoder"]["workers"],
            json!(16)
        );
        assert_eq!(
            materialised["sequences"]["scene_detector"]["method"]["AVSceneChange"]["minimum_length"],
            json!(12)
        );
        assert_eq!(
            materialised["sequences"]["scene_detector"]["method"]["AVSceneChange"]["maximum_length"],
            json!(240)
        );
        assert_eq!(materialised["sequences"]["target_quality"], Value::Null);
        assert_eq!(materialised["encoder"], defaults["encoder"]);
        assert_eq!(
            materialised["sequences"]["scene_concatenator"]["method"]["mkvmerge"]["extra_inputs"],
            json!([])
        );
    }

    #[test]
    fn resolution_is_total_over_every_path_and_value_kind() {
        let defaults = defaults();
        let samples = [
            json!(null),
            json!(true),
            json!(0),
            json!(1.5),
            json!("text"),
            json!([]),
            json!([1, 2]),
            json!({}),
            json!({ "a": 1 }),
        ];

        for path in leaf_paths(&defaults) {
            for sample in &samples {
                let overrides = BTreeMap::from([(path.clone(), sample.clone())]);
                let resolved = resolve(&defaults, &json!({}), &overrides);

                assert_eq!(resolved.values[&path].value, *sample, "{path}");
                assert_eq!(
                    resolved.values[&path].source,
                    ValueSource::Overridden,
                    "{path}"
                );
                let overridden: BTreeSet<&String> = resolved
                    .values
                    .iter()
                    .filter(|(_, value)| value.source == ValueSource::Overridden)
                    .map(|(path, _)| path)
                    .collect();
                assert_eq!(overridden, BTreeSet::from([&path]), "{path}");
                let _ = materialise(&defaults, &json!({}), &overrides);
            }
        }
    }

    #[test]
    fn the_machine_model_fills_only_an_unset_transnetv2_method() {
        let mut document = json!({
            "sequences": {
                "scene_detector": {
                    "method": { "TransNetV2": { "minimum_length": 24, "model_path": null } }
                }
            }
        });
        pin_scene_model(&mut document, "D:/models/transnetv2.onnx");
        assert_eq!(
            document["sequences"]["scene_detector"]["method"]["TransNetV2"]["model_path"],
            "D:/models/transnetv2.onnx"
        );

        // A pinned path is the project's own choice and stays.
        let mut pinned = json!({
            "sequences": {
                "scene_detector": {
                    "method": { "TransNetV2": { "model_path": "C:/project/model.onnx" } }
                }
            }
        });
        pin_scene_model(&mut pinned, "D:/models/transnetv2.onnx");
        assert_eq!(
            pinned["sequences"]["scene_detector"]["method"]["TransNetV2"]["model_path"],
            "C:/project/model.onnx"
        );

        // A different detector does not grow a model path.
        let mut av = json!({
            "sequences": {
                "scene_detector": { "method": { "AVSceneChange": { "method": "Fast" } } }
            }
        });
        pin_scene_model(&mut av, "D:/models/transnetv2.onnx");
        assert_eq!(
            av["sequences"]["scene_detector"]["method"]["AVSceneChange"],
            json!({ "method": "Fast" })
        );
    }

    #[test]
    fn a_video_may_replace_one_sequence_or_the_encoder_but_not_an_arbitrary_object() {
        let defaults = defaults();

        assert!(accepts_override(&defaults, "encoder"));
        assert!(accepts_override(&defaults, "sequences.parallel_encoder"));
        assert!(!accepts_override(&defaults, "sequences"));
        assert!(!accepts_override(
            &defaults,
            "sequences.parallel_encoder.workers"
        ));
        assert!(!accepts_override(&defaults, "sequences.unknown"));
    }

    #[test]
    fn numbers_compare_by_value_not_representation() {
        assert!(values_equal(&json!(1), &json!(1.0)));
        assert!(!values_equal(&json!(1), &json!(2)));
    }

    #[test]
    fn validation_rejects_an_unknown_section_and_an_unknown_multi_field_field() {
        let defaults = defaults();

        let error = validate(&json!({ "future": {} }), &defaults).unwrap_err();
        assert!(
            error.contains("not a known configuration section"),
            "{error}"
        );

        let error = validate(
            &json!({ "sequences": { "parallel_encoder": { "workres": 1 } } }),
            &defaults,
        )
        .unwrap_err();
        assert!(error.contains("not a known configuration field"), "{error}");
    }

    #[test]
    fn a_one_key_section_accepts_a_replacement_variant() {
        let defaults = defaults();

        assert!(
            validate(
                &json!({ "encoder": { "x264": { "options": { "--crf": 20 } } } }),
                &defaults
            )
            .is_ok()
        );
        assert!(
            validate(
                &json!({
                    "sequences": {
                        "scene_detector": {
                            "method": { "AVSceneChange": { "minimum_length": 12 } }
                        }
                    }
                }),
                &defaults
            )
            .is_ok()
        );
    }

    #[test]
    fn validation_checks_value_kinds() {
        let defaults = defaults();

        assert!(
            validate(
                &json!({
                    "sequences": {
                        "scene_detector": {
                            "method": { "AVSceneChange": { "minimum_length": "twelve" } }
                        }
                    }
                }),
                &defaults
            )
            .is_err()
        );
        assert!(
            validate(
                &json!({ "sequences": { "parallel_encoder": { "scenes_directory": 5 } } }),
                &defaults
            )
            .is_err()
        );
        // `null` is the engine's "not configured", so any replacement shape is allowed.
        assert!(
            validate(
                &json!({ "sequences": { "target_quality": { "anything": true } } }),
                &defaults
            )
            .is_ok()
        );
    }

    #[test]
    fn a_disabled_optional_sequence_is_a_valid_null() {
        // The engine ships these defaults filled in, so the shape check would otherwise
        // reject the `null` the Disable button writes and the draft could never be saved.
        let defaults = json!({
            "sequences": {
                "noise_detector": { "reference_filters": [], "denoised_filters": [] },
                "target_quality": { "maximum_probes": 4 },
                "scene_detector": {
                    "input": { "Video": { "path": "", "filters": [] } },
                    "method": { "None": {} }
                },
                "scene_concatenator": { "method": { "mkvmerge": {} } }
            }
        });

        assert!(
            validate(
                &json!({ "sequences": {
                    "noise_detector": null,
                    "target_quality": null,
                    "scene_detector": { "input": null }
                } }),
                &defaults
            )
            .is_ok()
        );

        let disabled = json!({ "sequences": { "noise_detector": null } });
        let resolved = resolve(&defaults, &disabled, &BTreeMap::new());
        assert_eq!(
            resolved.values["sequences.noise_detector"].value,
            Value::Null
        );

        // A section the engine does not model as optional still has to be an object.
        assert!(
            validate(
                &json!({ "sequences": { "scene_concatenator": null } }),
                &defaults
            )
            .is_err()
        );
    }

    #[test]
    fn a_sequence_input_naming_no_file_takes_the_video_source() {
        let mut document = json!({
            "sequences": {
                "scene_detector": {
                    "input": {
                        "VapourSynth": { "path": "", "filters": [], "import_method": { "BestSource": {} } }
                    }
                },
                "parallel_encoder": {
                    "input": {
                        "Video": { "path": "", "filters": [], "import_method": { "FFMS2": { "cache_path": null, "index": null } } }
                    }
                },
                "quality_check": {
                    "input": null,
                    "metric_input": {
                        "Video": { "path": "/media/chosen.mp4", "filters": [], "import_method": { "FFMS2": { "cache_path": null, "index": null } } }
                    }
                },
                "noise_detector": {
                    "input": { "VapourSynthScript": { "source": { "Path": "/scripts/a.vpy" }, "filters": [], "variables": {}, "index": 0, "stream_concurrently": false } }
                }
            }
        });

        inherit_sequence_inputs(&mut document, "/media/clip.mp4");

        assert_eq!(
            document["sequences"]["scene_detector"]["input"]["VapourSynth"]["path"],
            json!("/media/clip.mp4")
        );
        assert_eq!(
            document["sequences"]["parallel_encoder"]["input"]["Video"]["path"],
            json!("/media/clip.mp4")
        );
        // A video context that named its own file keeps it.
        assert_eq!(
            document["sequences"]["quality_check"]["metric_input"]["Video"]["path"],
            json!("/media/chosen.mp4")
        );
        // A script names its own source; there is no path field to fill.
        assert_eq!(
            document["sequences"]["noise_detector"]["input"]["VapourSynthScript"]["source"]["Path"],
            json!("/scripts/a.vpy")
        );
    }

    /// A JSON leaf for generated documents. Numbers stay integral so every generated value
    /// round-trips through `serde_json` without a floating-point representation change.
    fn generated_leaf() -> impl Strategy<Value = Value> {
        prop_oneof![
            Just(Value::Null),
            any::<bool>().prop_map(Value::Bool),
            any::<i64>().prop_map(Value::from),
            "[ -~]{0,16}".prop_map(Value::String),
            prop::collection::vec(any::<i64>().prop_map(Value::from), 0..3).prop_map(Value::Array),
        ]
    }

    /// An arbitrary JSON document whose object keys are valid single path segments.
    fn generated_json() -> impl Strategy<Value = Value> {
        generated_leaf().prop_recursive(4, 32, 4, |inner| {
            prop::collection::btree_map("[a-z][a-z0-9_]{0,7}", inner, 0..4)
                .prop_map(|entries| Value::Object(entries.into_iter().collect()))
        })
    }

    /// An arbitrary configuration-shaped document.
    fn generated_object() -> impl Strategy<Value = Value> {
        prop::collection::btree_map("[a-z][a-z0-9_]{0,7}", generated_json(), 0..4)
            .prop_map(|entries| Value::Object(entries.into_iter().collect()))
    }

    /// A default document and a project built only from paths that exist in it.
    fn generated_defaults_with_selections() -> impl Strategy<Value = (Value, Vec<(String, Value)>)>
    {
        generated_object().prop_flat_map(|defaults| {
            let paths = leaf_paths(&defaults);
            let max = paths.len().min(4);
            prop::sample::subsequence(paths, 0..=max).prop_flat_map(move |chosen| {
                let values = prop::collection::vec(generated_json(), chosen.len());
                let defaults = defaults.clone();
                values.prop_map(move |values| {
                    (
                        defaults.clone(),
                        chosen.iter().cloned().zip(values).collect(),
                    )
                })
            })
        })
    }

    /// A default document and an override map over a subset of its leaf paths.
    fn generated_defaults_with_overrides() -> impl Strategy<Value = (Value, BTreeMap<String, Value>)>
    {
        generated_object().prop_flat_map(|defaults| {
            let paths = leaf_paths(&defaults);
            let max = paths.len().min(4);
            prop::sample::subsequence(paths, 0..=max).prop_flat_map(move |chosen| {
                let values = prop::collection::vec(generated_json(), chosen.len());
                let defaults = defaults.clone();
                values.prop_map(move |values| {
                    (
                        defaults.clone(),
                        chosen.iter().cloned().zip(values).collect(),
                    )
                })
            })
        })
    }

    /// A project document carrying only the supplied leaf values.
    fn project_from(selections: &[(String, Value)]) -> Value {
        let mut project = Map::new();
        for (path, value) in selections {
            insert_path(&mut project, path, value.clone());
        }
        Value::Object(project)
    }

    /// Every addressable path in a document, sections included.
    fn document_paths(value: &Value) -> BTreeSet<String> {
        fn walk(value: &Value, path: &str, paths: &mut BTreeSet<String>) {
            if !path.is_empty() {
                paths.insert(path.to_owned());
            }
            if let Value::Object(fields) = value {
                for (key, child) in fields {
                    let child_path = join(path, key);
                    walk(child, &child_path, paths);
                }
            }
        }

        let mut paths = BTreeSet::new();
        walk(value, "", &mut paths);
        paths
    }

    fn value_at_path<'a>(document: &'a Value, path: &str) -> Option<&'a Value> {
        let mut cursor = document;
        for segment in path.split('.') {
            cursor = cursor.get(segment)?;
        }
        Some(cursor)
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(128))]

        #[test]
        fn arbitrary_documents_never_panic_and_keep_every_override(
            defaults in generated_object(),
            project in generated_object(),
            overrides in prop::collection::btree_map(".{0,12}", generated_json(), 0..4),
        ) {
            let resolved = resolve(&defaults, &project, &overrides);
            let materialised = materialise(&defaults, &project, &overrides);

            prop_assert!(materialised.is_object());
            for (path, value) in &overrides {
                let entry = resolved
                    .values
                    .get(path)
                    .unwrap_or_else(|| panic!("override {path} was dropped"));
                prop_assert_eq!(&entry.value, value);
                prop_assert_eq!(entry.source, ValueSource::Overridden);
            }
        }

        #[test]
        fn every_resolved_path_is_in_the_default_shape(
            (defaults, selections) in generated_defaults_with_selections(),
        ) {
            let project = project_from(&selections);
            let resolved = resolve(&defaults, &project, &BTreeMap::new());
            let default_paths = document_paths(&defaults);

            for path in resolved.values.keys() {
                prop_assert!(
                    default_paths.contains(path),
                    "resolved {path}, which is not in the default document"
                );
            }
        }

        #[test]
        fn overrides_are_exactly_the_paths_reported_as_overridden(
            (defaults, overrides) in generated_defaults_with_overrides(),
            project in generated_object(),
        ) {
            let resolved = resolve(&defaults, &project, &overrides);
            let reported: BTreeSet<&String> = resolved
                .values
                .iter()
                .filter(|(_, value)| value.source == ValueSource::Overridden)
                .map(|(path, _)| path)
                .collect();

            prop_assert_eq!(reported, overrides.keys().collect::<BTreeSet<_>>());
            for (path, value) in &overrides {
                prop_assert_eq!(&resolved.values[path].value, value, "{}", path);
            }
        }

        #[test]
        fn materialising_the_defaults_returns_them_unchanged(defaults in generated_object()) {
            let materialised = materialise(&defaults, &defaults, &BTreeMap::new());
            prop_assert_eq!(materialised, defaults);
        }

        #[test]
        fn a_materialised_override_keeps_its_value(
            (defaults, overrides) in generated_defaults_with_overrides(),
        ) {
            let materialised = materialise(&defaults, &defaults, &overrides);
            for (path, value) in &overrides {
                prop_assert_eq!(
                    value_at_path(&materialised, path),
                    Some(value),
                    "override at {} did not survive materialisation",
                    path
                );
            }
        }
    }
}
