//! Turn the engine's raw CLI parameter map into the generated parameter vocabulary.
//!
//! The engine stores `HashMap<String, CLIParameter>` and serialises it verbatim. The UI needs
//! a closed value kind and a control per parameter, so the service maps that map once, here.
//! Anything the engine cannot express — minima, maxima, units, labels, choice lists — comes
//! from the curated table below; a parameter no table names keeps the engine's honest
//! name as its label instead of an invented one.
//!
//! The table only offers flags the encoders themselves accept. A flag the user's build does
//! not support is removed in the editor and refused by the encoder, never hidden here.

mod catalogue;
use catalogue::catalogue;

use std::collections::BTreeMap;

use av1ation_contracts::encoder::{
    Choice, ChoicePresentation, ChoiceSpec, ChoiceValueKind, CollectionPresentation, Delimiter,
    NumberSpec, ParameterDescriptor, ParameterKind, ParameterValue, TextSpec, Widget,
};
use serde_json::Value;

/// How a catalogue entry describes one parameter, whether the engine seeds it or not.
enum CatalogueKind {
    Flag,
    Integer {
        min: Option<f64>,
        max: Option<f64>,
        unit: Option<&'static str>,
    },
    /// A numeric value the encoder accepts in fractions, such as CRF's 0.25 steps.
    Float {
        min: Option<f64>,
        max: Option<f64>,
        step: Option<f64>,
    },
    /// A string value from a closed set the encoder documents. The engine stores such an
    /// option as an untyped `String`; the set is what turns it into a select.
    Choice(&'static [&'static str]),
    /// A numeric value whose numbers mean something (`0` is `yuv400`) and whose accepted
    /// values may include fractions, such as HEVC level 5.1. The encoder still receives the
    /// number; the labels are what the user reads.
    Numbered(&'static [(f64, &'static str)]),
    Text,
}

/// One parameter this build knows by its canonical CLI spelling.
struct CatalogueEntry {
    /// The full CLI spelling, so a single-dash flag such as `-D` stays correct.
    key: &'static str,
    label: &'static str,
    description: &'static str,
    group: &'static str,
    kind: CatalogueKind,
    advanced: bool,
}

/// Map the engine's parameter document to descriptors keyed by canonical CLI spelling.
///
/// A variant this build does not know is skipped instead of guessed, so an engine upgrade can
/// add a parameter kind without producing a wrongly typed field.
pub(crate) fn parameters(raw: &Value) -> BTreeMap<String, ParameterDescriptor> {
    let mut descriptors = BTreeMap::new();
    let Some(fields) = raw.as_object() else {
        return descriptors;
    };

    for (name, parameter) in fields {
        let Some((tag, body)) = variant(parameter) else {
            continue;
        };
        let prefix = body
            .get("prefix")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let raw_delimiter = body.get("delimiter").and_then(Value::as_str);

        let (kind, default, delimiter) = match tag {
            "Bool" => (
                ParameterKind::Flag,
                body.get("value")
                    .and_then(Value::as_bool)
                    .map(ParameterValue::Bool),
                None,
            ),
            "Number" => {
                let Some(value) = body.get("value").and_then(Value::as_f64) else {
                    continue;
                };
                (
                    ParameterKind::Number(NumberSpec {
                        // The engine's default value is the only type evidence it gives.
                        integer: value.fract() == 0.0,
                        min: None,
                        max: None,
                        step: None,
                        unit: None,
                    }),
                    Some(ParameterValue::Number(value)),
                    delimiter(raw_delimiter),
                )
            }
            "String" => {
                let Some(value) = body.get("value").and_then(Value::as_str) else {
                    continue;
                };
                (
                    ParameterKind::Text(TextSpec {
                        max_len: None,
                        pattern: None,
                        multiline: false,
                        format: None,
                    }),
                    Some(ParameterValue::Text(value.to_owned())),
                    delimiter(raw_delimiter),
                )
            }
            _ => continue,
        };

        descriptors.insert(
            format!("{prefix}{name}"),
            ParameterDescriptor {
                delimiter,
                // The engine does not label its options; the option name is the honest label
                // until the catalogue below names it.
                label: name.clone(),
                description: None,
                doc_link: None,
                kind,
                default,
                widget: Widget::Auto,
                advanced: false,
                group: None,
                relations: Vec::new(),
            },
        );
    }

    descriptors
}

/// The engine's parameter map plus this build's labels, descriptions and common flags.
///
/// An engine-seeded parameter keeps the engine's delimiter and default: those are observed
/// facts. The table adds presentation and may replace a kind the engine could only infer
/// (an untyped string or a bare number) with the closed set the encoder documents. A
/// parameter the table adds carries the default the encoder's help states when there is
/// one, and nothing is sent until the user chooses a value.
pub(crate) fn builtin(id: &str, raw: &Value) -> BTreeMap<String, ParameterDescriptor> {
    let mut descriptors = parameters(raw);
    let Some((delimiter, entries)) = catalogue(id) else {
        return descriptors;
    };

    for entry in entries {
        if let Some(descriptor) = descriptors.get_mut(entry.key) {
            descriptor.label = entry.label.to_owned();
            descriptor.description = Some(entry.description.to_owned());
            descriptor.group = Some(entry.group.to_owned());
            descriptor.advanced = entry.advanced;
            descriptor.doc_link = docs(id).map(str::to_owned);
            apply_catalogue_kind(&mut descriptor.kind, &entry.kind);
            prune_choice_default(descriptor);
            continue;
        }
        let documented = catalogue_default(id, entry.key).map(ParameterValue::Number);
        let documented_text = catalogue_text_default(id, entry.key)
            .map(|value| ParameterValue::Text(value.to_owned()));
        let (kind, default) = match &entry.kind {
            CatalogueKind::Flag => (ParameterKind::Flag, Some(ParameterValue::Bool(false))),
            CatalogueKind::Integer { min, max, unit } => (
                ParameterKind::Number(NumberSpec {
                    integer: true,
                    min: *min,
                    max: *max,
                    step: None,
                    unit: (*unit).map(str::to_owned),
                }),
                documented,
            ),
            CatalogueKind::Float { min, max, step } => (
                ParameterKind::Number(NumberSpec {
                    integer: false,
                    min: *min,
                    max: *max,
                    step: *step,
                    unit: None,
                }),
                documented,
            ),
            CatalogueKind::Choice(values) => (choice_kind(values), documented_text),
            CatalogueKind::Numbered(values) => (numbered_kind(values), documented),
            CatalogueKind::Text => (
                ParameterKind::Text(TextSpec {
                    max_len: None,
                    pattern: None,
                    multiline: false,
                    format: None,
                }),
                documented_text,
            ),
        };
        descriptors.insert(
            entry.key.to_owned(),
            ParameterDescriptor {
                delimiter: match &kind {
                    ParameterKind::Flag => None,
                    _ => Some(delimiter.clone()),
                },
                label: entry.label.to_owned(),
                description: Some(entry.description.to_owned()),
                doc_link: docs(id).map(str::to_owned),
                kind,
                default,
                widget: Widget::Auto,
                advanced: entry.advanced,
                group: Some(entry.group.to_owned()),
                relations: Vec::new(),
            },
        );
    }

    resolve_descriptors(&mut descriptors);
    descriptors
}

/// Resolve every `Auto` widget once, so the API, the docs snapshot and the renderer agree.
/// An explicit widget is evidence and is left alone.
pub(crate) fn resolve_descriptors(descriptors: &mut BTreeMap<String, ParameterDescriptor>) {
    for descriptor in descriptors.values_mut() {
        if matches!(descriptor.widget, Widget::Auto) {
            descriptor.widget = auto_widget(&descriptor.kind);
        }
    }
}

/// The one widget rule for `Auto`, shared by the service, the snapshot and the tests.
fn auto_widget(kind: &ParameterKind) -> Widget {
    match kind {
        ParameterKind::Flag => Widget::Toggle,
        ParameterKind::Choice(_) => Widget::ChoiceInput {
            presentation: ChoicePresentation::Auto,
        },
        ParameterKind::Path(_) => Widget::PathPicker,
        ParameterKind::Duration(_) => Widget::DurationInput,
        ParameterKind::Collection(_) => Widget::CollectionInput {
            presentation: CollectionPresentation::Chips,
        },
        ParameterKind::Text(spec) => Widget::TextInput {
            placeholder: None,
            multiline: spec.multiline,
        },
        ParameterKind::Number(spec) => {
            if spec.integer && spec.min == Some(0.0) && spec.max == Some(1.0) {
                return Widget::Switch;
            }
            let slider = matches!((spec.min, spec.max), (Some(min), Some(max)) if max > min && max - min <= 100.0);
            if slider {
                Widget::Slider {
                    step: spec.step.or(spec.integer.then_some(1.0)),
                    marks: Vec::new(),
                }
            } else {
                Widget::NumberInput { step: spec.step }
            }
        }
    }
}

/// The value a closed-set or text parameter uses when the encoder does not seed it.
///
/// Kept apart from `catalogue_default` because a choice's default is its own value, not a
/// number. Only a default the shipped build's help states is listed here.
fn catalogue_text_default(id: &str, key: &str) -> Option<&'static str> {
    match (id, key) {
        ("svt-av1", "--asm") => Some("max"),
        ("svt-av1", "--level") => Some("0"),
        ("vvenc", "--preset") => Some("medium"),
        _ => None,
    }
}

/// The value the encoder uses when a catalogue-only parameter is not sent.
///
/// A row the engine seeded keeps the engine's own default, because that is the value a run
/// actually sends. Every other row starts unset, which would show a switch as off even where
/// the encoder defaults it on, and would hide a quantiser default the user needs to know
/// about. These are the values the shipped SVT-AV1 4.0.1 build prints in `--full-help`
/// (which supersedes the upstream table where the two disagree) and the values aomenc's help
/// states for its numeric booleans. A parameter whose help states no fixed default, or a
/// preset-dependent one, stays unset.
fn catalogue_default(id: &str, key: &str) -> Option<f64> {
    let value = match (id, key) {
        ("svt-av1", "--max-qp") => 63.0,
        ("svt-av1", "--min-qp") => 1.0,
        ("svt-av1", "--aq-mode") => 2.0,
        ("svt-av1", "--gop-constraint-rc") => 0.0,
        ("svt-av1", "--enable-variance-boost") => 1.0,
        ("svt-av1", "--variance-boost-strength") => 1.0,
        ("svt-av1", "--variance-octile") => 4.0,
        ("svt-av1", "--enable-qm") => 1.0,
        ("svt-av1", "--qm-min") => 2.0,
        ("svt-av1", "--qm-max") => 15.0,
        ("svt-av1", "--chroma-qm-min") => 4.0,
        ("svt-av1", "--chroma-qm-max") => 15.0,
        ("svt-av1", "--lossless") => 0.0,
        ("svt-av1", "--sharp-tx") => 0.0,
        ("svt-av1", "--complex-hvs") => 0.0,
        ("svt-av1", "--sharpness") => 1.0,
        ("svt-av1", "--ac-bias") => 0.25,
        ("svt-av1", "--tf-strength") => 1.0,
        ("svt-av1", "--luminance-qp-bias") => 10.0,
        ("svt-av1", "--qp-scale-compress-strength") => 1.0,
        ("svt-av1", "--tune") => 1.0,
        ("svt-av1", "--film-grain") => 0.0,
        ("svt-av1", "--film-grain-denoise") => 0.0,
        ("svt-av1", "--adaptive-film-grain") => 0.0,
        ("svt-av1", "--photon-noise-chroma") => 0.0,
        ("svt-av1", "--keyint") => -2.0,
        ("svt-av1", "--min-keyint") => -1.0,
        ("svt-av1", "--irefresh-type") => 2.0,
        ("svt-av1", "--scd") => 1.0,
        ("svt-av1", "--lookahead") => -1.0,
        ("svt-av1", "--pred-struct") => 2.0,
        ("svt-av1", "--enable-dg") => 0.0,
        ("svt-av1", "--rtc") => 0.0,
        ("svt-av1", "--startup-mg-size") => 0.0,
        ("svt-av1", "--auto-tiling") => 1.0,
        ("svt-av1", "--enable-tf") => 1.0,
        ("svt-av1", "--enable-dlf") => 2.0,
        ("svt-av1", "--enable-cdef") => 1.0,
        ("svt-av1", "--enable-restoration") => 1.0,
        ("svt-av1", "--enable-mfmv") => -1.0,
        ("svt-av1", "--enable-overlays") => 0.0,
        ("svt-av1", "--scm") => 2.0,
        ("svt-av1", "--tile-columns") => 0.0,
        ("svt-av1", "--tile-rows") => 0.0,
        ("svt-av1", "--lp") => 0.0,
        ("svt-av1", "--profile") => 0.0,
        ("svt-av1", "--color-format") => 1.0,
        ("svt-av1", "--avif") => 0.0,
        ("svt-av1", "--progress") => 2.0,
        ("svt-av1", "--enable-stat-report") => 0.0,
        ("svt-av1", "--fast-decode") => 0.0,
        ("svt-av1", "--low-memory") => 0.0,
        ("vvenc", "--qp") => 32.0,
        ("aom", "--enable-qm") => 1.0,
        _ => return None,
    };
    Some(value)
}

/// The reference document for one engine encoder's CLI, usually its own repository.
///
/// Every curated row points at the same authoritative page: the repositories publish one
/// options document per encoder rather than a stable anchor per flag.
fn docs(id: &str) -> Option<&'static str> {
    match id {
        "svt-av1" => {
            Some("https://gitlab.com/AOMediaCodec/SVT-AV1/-/blob/master/Docs/Parameters.md")
        }
        "aom" => Some("https://aomedia.googlesource.com/aom/+/master/apps/aomenc.c"),
        "rav1e" => Some("https://github.com/xiph/rav1e/blob/master/README.md"),
        "vpx" => Some("https://www.webmproject.org/docs/encoder-parameters/"),
        "avm" => Some("https://aomedia.googlesource.com/avm/+/main/apps/aomenc.c"),
        "x264" => Some("https://www.videolan.org/developers/x264.html"),
        "x265" => Some("https://x265.readthedocs.io/en/stable/cli.html"),
        "vvenc" => Some("https://github.com/fraunhoferhhi/vvenc/wiki/Usage"),
        "ffmpeg" => Some("https://ffmpeg.org/ffmpeg-codecs.html"),
        _ => None,
    }
}

/// Apply the curated row to the kind the engine inferred. A closed set replaces a bare
/// string or number; a range fills only the constraints the engine left blank.
fn apply_catalogue_kind(kind: &mut ParameterKind, catalogue: &CatalogueKind) {
    // A closed text set is more specific than the engine's untyped string, but it does not
    // replace a number or flag: an encoder can reuse a spelling.
    if let CatalogueKind::Choice(values) = catalogue {
        if matches!(kind, ParameterKind::Text(_)) {
            *kind = choice_kind(values);
        }
        return;
    }
    // A labeled number replaces the range when the table lists every accepted value.
    if let CatalogueKind::Numbered(values) = catalogue {
        if matches!(kind, ParameterKind::Number(_)) {
            *kind = numbered_kind(values);
        }
        return;
    }
    let ParameterKind::Number(spec) = kind else {
        return;
    };
    match catalogue {
        CatalogueKind::Integer { min, max, unit } => {
            spec.min = spec.min.or(*min);
            spec.max = spec.max.or(*max);
            if spec.unit.is_none() {
                spec.unit = (*unit).map(str::to_owned);
            }
        }
        CatalogueKind::Float { min, max, step } => {
            spec.integer = false;
            spec.min = spec.min.or(*min);
            spec.max = spec.max.or(*max);
            spec.step = spec.step.or(*step);
        }
        _ => {}
    }
}

fn numbered_kind(values: &[(f64, &'static str)]) -> ParameterKind {
    ParameterKind::Choice(ChoiceSpec {
        options: values
            .iter()
            .map(|(value, label)| Choice {
                value: ParameterValue::Number(*value),
                label: (*label).to_owned(),
                description: None,
                doc_link: None,
            })
            .collect(),
        value_kind: Some(ChoiceValueKind::Number),
        multiple: false,
        min_selected: 1,
        max_selected: Some(1),
    })
}

fn choice_kind(values: &[&str]) -> ParameterKind {
    ParameterKind::Choice(ChoiceSpec {
        options: values
            .iter()
            .map(|value| Choice {
                value: ParameterValue::Text((*value).to_owned()),
                label: (*value).to_owned(),
                description: None,
                doc_link: None,
            })
            .collect(),
        value_kind: Some(ChoiceValueKind::Text),
        multiple: false,
        min_selected: 1,
        max_selected: Some(1),
    })
}

/// A stated default that is not one of the choices would be refused by the encoder.
fn prune_choice_default(descriptor: &mut ParameterDescriptor) {
    let ParameterKind::Choice(spec) = &descriptor.kind else {
        return;
    };
    let listed = match &descriptor.default {
        Some(ParameterValue::Text(default)) => spec
            .options
            .iter()
            .any(|option| matches!(&option.value, ParameterValue::Text(value) if value == default)),
        Some(ParameterValue::Number(default)) => spec.options.iter().any(
            |option| matches!(&option.value, ParameterValue::Number(value) if value == default),
        ),
        Some(_) | None => true,
    };
    if !listed {
        descriptor.default = None;
    }
}

/// The externally tagged variant and its body, for example `("Number", {...})`.
fn variant(parameter: &Value) -> Option<(&str, &serde_json::Map<String, Value>)> {
    let (tag, body) = parameter.as_object()?.iter().next()?;
    Some((tag.as_str(), body.as_object()?))
}

/// `" "` is two argv entries; any other spelling is joined into one entry.
fn delimiter(raw: Option<&str>) -> Option<Delimiter> {
    raw.map(|value| {
        if value == " " {
            Delimiter::Space
        } else {
            Delimiter::Joined(value.to_owned())
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_three_engine_variants_become_typed_descriptors() {
        let raw = json!({
            "crf": { "Number": { "prefix": "--", "delimiter": " ", "value": 25.0 } },
            "preset": { "String": { "prefix": "--", "delimiter": "=", "value": "slow" } },
            "stitchable": { "Bool": { "prefix": "--", "value": true } }
        });
        let descriptors = parameters(&raw);

        let crf = &descriptors["--crf"];
        assert_eq!(crf.delimiter, Some(Delimiter::Space));
        assert_eq!(
            crf.kind,
            ParameterKind::Number(NumberSpec {
                integer: true,
                min: None,
                max: None,
                step: None,
                unit: None,
            })
        );
        assert_eq!(crf.default, Some(ParameterValue::Number(25.0)));
        assert_eq!(crf.widget, Widget::Auto);

        assert_eq!(
            descriptors["--preset"].delimiter,
            Some(Delimiter::Joined("=".to_owned()))
        );
        assert_eq!(
            descriptors["--preset"].default,
            Some(ParameterValue::Text("slow".to_owned()))
        );

        let flag = &descriptors["--stitchable"];
        assert_eq!(flag.kind, ParameterKind::Flag);
        assert_eq!(flag.delimiter, None);
        assert_eq!(flag.default, Some(ParameterValue::Bool(true)));
    }

    #[test]
    fn a_fractional_default_is_not_integer_only() {
        let raw = json!({
            "sigma": { "Number": { "prefix": "--", "delimiter": " ", "value": 1.5 } }
        });
        let kind = &parameters(&raw)["--sigma"].kind;
        let ParameterKind::Number(spec) = kind else {
            panic!("the parameter is a number");
        };
        assert!(!spec.integer);
    }

    #[test]
    fn a_parameter_kind_this_build_does_not_know_is_skipped() {
        let raw = json!({
            "future": { "Duration": { "prefix": "--", "delimiter": " ", "value": 3 } },
            "crf": { "Number": { "prefix": "--", "delimiter": " ", "value": 25.0 } }
        });
        let descriptors = parameters(&raw);
        assert_eq!(descriptors.len(), 1);
        assert!(descriptors.contains_key("--crf"));
    }

    #[test]
    fn the_catalogue_names_engine_parameters_without_changing_their_evidence() {
        let raw = json!({
            "crf": { "Number": { "prefix": "--", "delimiter": "=", "value": 25.0 } }
        });
        let descriptors = builtin("svt-av1", &raw);
        let crf = &descriptors["--crf"];
        assert_eq!(crf.label, "Constant Rate Factor");
        assert!(crf.description.is_some());
        assert_eq!(crf.group.as_deref(), Some("Rate control"));
        // The engine's delimiter and default are observed facts; the table only adds text.
        assert_eq!(crf.delimiter, Some(Delimiter::Joined("=".to_owned())));
        assert_eq!(crf.default, Some(ParameterValue::Number(25.0)));
    }

    #[test]
    fn the_catalogue_seeds_added_flags_with_the_build_default() {
        let descriptors = builtin("svt-av1", &json!({}));
        let tune = &descriptors["--tune"];
        // The shipped build prints `default is 1`; a catalogue row carries it so the sheet
        // starts where the encoder does instead of at the first option in the list.
        assert_eq!(tune.default, Some(ParameterValue::Number(1.0)));
        assert_eq!(tune.delimiter, Some(Delimiter::Space));
        let ParameterKind::Choice(spec) = &tune.kind else {
            panic!("tune is a labeled numeric choice");
        };
        // `--tune` accepts 0-4 in this build; option 5 was removed upstream.
        assert_eq!(spec.options.len(), 5);
        assert_eq!(spec.options[0].label, "VQ");
        assert_eq!(spec.options[4].label, "MS-SSIM");
        assert_eq!(spec.value_kind, Some(ChoiceValueKind::Number));
        // A closed set carries its default as its own kind of value.
        assert_eq!(
            descriptors["--asm"].default,
            Some(ParameterValue::Text("max".to_owned()))
        );
    }

    #[test]
    fn a_documented_enum_reaches_an_engine_seeded_string() {
        let raw = json!({
            "asm": { "String": { "prefix": "--", "delimiter": " ", "value": "max" } }
        });
        let descriptors = builtin("svt-av1", &raw);
        let asm = &descriptors["--asm"];
        let ParameterKind::Choice(spec) = &asm.kind else {
            panic!("the documented instruction set is a choice");
        };
        assert!(spec.options.len() >= 10);
        assert_eq!(spec.value_kind, Some(ChoiceValueKind::Text));
        assert_eq!(asm.default, Some(ParameterValue::Text("max".to_owned())));
    }

    #[test]
    fn a_fractional_enum_reaches_an_engine_seeded_number() {
        let raw = json!({
            "level-idc": { "Number": { "prefix": "--", "delimiter": " ", "value": 5.0 } }
        });
        let descriptors = builtin("x265", &raw);
        let level = &descriptors["--level-idc"];
        let ParameterKind::Choice(spec) = &level.kind else {
            panic!("HEVC levels are a labelled choice");
        };
        assert!(
            spec.options
                .iter()
                .any(|option| option.value == ParameterValue::Number(5.1)),
            "the picker offers 5.1"
        );
        // The engine seeds the level as a number; the conversion must not discard it.
        assert_eq!(level.default, Some(ParameterValue::Number(5.0)));
        assert!(matches!(level.widget, Widget::ChoiceInput { .. }));
    }

    #[test]
    fn a_documented_number_enum_becomes_a_labeled_choice() {
        let raw = json!({
            "color-format": { "Number": { "prefix": "--", "delimiter": " ", "value": 1.0 } }
        });
        let descriptors = builtin("svt-av1", &raw);
        let color = &descriptors["--color-format"];
        let ParameterKind::Choice(spec) = &color.kind else {
            panic!("the chroma formats are a labeled choice");
        };
        assert_eq!(spec.options.len(), 4);
        assert_eq!(spec.value_kind, Some(ChoiceValueKind::Number));
        assert_eq!(spec.options[1].value, ParameterValue::Number(1.0));
        assert_eq!(spec.options[1].label, "YUV 4:2:0");
        assert_eq!(color.default, Some(ParameterValue::Number(1.0)));

        // A default the list does not contain would make the encoder reject the value.
        let raw = json!({
            "color-format": { "Number": { "prefix": "--", "delimiter": " ", "value": 9.0 } }
        });
        let descriptors = builtin("svt-av1", &raw);
        assert_eq!(descriptors["--color-format"].default, None);
    }

    #[test]
    fn a_documented_range_reaches_an_engine_seeded_parameter() {
        let raw = json!({
            "crf": { "Number": { "prefix": "--", "delimiter": " ", "value": 25.0 } }
        });
        let descriptors = builtin("svt-av1", &raw);
        let crf = &descriptors["--crf"];
        let ParameterKind::Number(spec) = &crf.kind else {
            panic!("crf is numeric");
        };
        assert!(!spec.integer, "the parameters document allows 0.25 steps");
        assert_eq!((spec.min, spec.max), (Some(1.0), Some(70.0)));
        assert_eq!(spec.step, Some(0.25));
        // The engine's observed default is not replaced by the document's default.
        assert_eq!(crf.default, Some(ParameterValue::Number(25.0)));
        assert!(crf.doc_link.is_some());
    }

    #[test]
    fn encoders_do_not_share_one_parameter_map() {
        let svt = builtin("svt-av1", &json!({}));
        let aom = builtin("aom", &json!({}));
        assert!(svt.contains_key("--crf"));
        assert!(!aom.contains_key("--crf"));
        assert_ne!(
            svt.keys().collect::<Vec<_>>(),
            aom.keys().collect::<Vec<_>>()
        );
    }

    #[test]
    fn svt_text_matches_its_parameters_document() {
        let descriptors = builtin("svt-av1", &json!({}));
        let irefresh = descriptors["--irefresh-type"]
            .description
            .as_deref()
            .unwrap_or_default();
        assert!(irefresh.contains("open GOP"), "{irefresh}");
        let min_keyint = descriptors["--min-keyint"]
            .description
            .as_deref()
            .unwrap_or_default();
        assert!(min_keyint.contains("mini-GOP"), "{min_keyint}");
        assert_eq!(
            descriptors["--crf"].doc_link.as_deref(),
            Some("https://gitlab.com/AOMediaCodec/SVT-AV1/-/blob/master/Docs/Parameters.md")
        );
    }

    #[test]
    fn vvenc_and_ffmpeg_start_from_a_useful_catalogue() {
        for (id, key) in [
            ("vvenc", "--preset"),
            ("vvenc", "--qp"),
            ("ffmpeg", "-crf"),
            ("ffmpeg", "-c:v"),
        ] {
            let descriptors = builtin(id, &json!({}));
            let entry = descriptors
                .get(key)
                .unwrap_or_else(|| panic!("{id} has no {key}"));
            assert!(entry.description.is_some(), "{id} {key} has no description");
        }
    }

    #[test]
    fn a_single_dash_flag_keeps_its_spelling() {
        let descriptors = builtin("x265", &json!({}));
        assert!(descriptors.contains_key("-D"));
        assert!(!descriptors.contains_key("--D"));
    }

    #[test]
    fn every_shipped_descriptor_is_complete_and_has_a_concrete_widget() {
        for encoder in av1ation_engine::capability::catalogue::encoders() {
            let descriptors = builtin(&encoder.id, &encoder.parameters);
            assert!(!descriptors.is_empty(), "{} has no parameters", encoder.id);
            for (key, descriptor) in descriptors {
                assert!(
                    !descriptor.label.trim().is_empty(),
                    "{} {key} has no label",
                    encoder.id
                );
                assert_ne!(
                    descriptor.label, key,
                    "{} {key} still reads like a flag",
                    encoder.id
                );
                assert!(
                    descriptor
                        .description
                        .as_deref()
                        .is_some_and(|text| !text.trim().is_empty()),
                    "{} {key} has no description",
                    encoder.id
                );
                assert!(
                    descriptor
                        .group
                        .as_deref()
                        .is_some_and(|text| !text.trim().is_empty()),
                    "{} {key} has no group",
                    encoder.id
                );
                assert!(
                    descriptor
                        .doc_link
                        .as_deref()
                        .is_some_and(|text| !text.trim().is_empty()),
                    "{} {key} has no documentation link",
                    encoder.id
                );
                assert_valid_descriptor(&encoder.id, &key, &descriptor);
            }
        }
    }

    #[test]
    fn website_snapshot_matches_all_shipped_descriptors() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../apps/website/src/gallery/encoder-parameters.json");
        let text = std::fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
        let snapshot: BTreeMap<String, BTreeMap<String, ParameterDescriptor>> =
            serde_json::from_str(&text).expect("website snapshot parses");
        let mut expected = BTreeMap::new();
        for encoder in av1ation_engine::capability::catalogue::encoders() {
            expected.insert(
                encoder.id.clone(),
                builtin(&encoder.id, &encoder.parameters),
            );
        }

        assert_eq!(
            snapshot.keys().collect::<Vec<_>>(),
            expected.keys().collect::<Vec<_>>(),
            "the website snapshot must cover every shipped encoder"
        );
        for (encoder, descriptors) in &expected {
            let published = snapshot.get(encoder).expect("encoder is in the snapshot");
            assert_eq!(
                published.keys().collect::<Vec<_>>(),
                descriptors.keys().collect::<Vec<_>>(),
                "{encoder} parameter keys drifted"
            );
            for (key, descriptor) in descriptors {
                assert_eq!(
                    serde_json::to_value(published.get(key)).expect("published descriptor"),
                    serde_json::to_value(descriptor).expect("resolved descriptor"),
                    "{encoder} {key} drifted from the website snapshot"
                );
            }
        }
    }

    #[test]
    fn auto_widgets_follow_the_contract_rules() {
        let number = |min, max, step, integer| {
            ParameterKind::Number(NumberSpec {
                integer,
                min,
                max,
                step,
                unit: None,
            })
        };
        assert_eq!(
            auto_widget(&number(Some(0.0), Some(1.0), None, true)),
            Widget::Switch
        );
        assert!(matches!(
            auto_widget(&number(Some(1.0), Some(70.0), Some(0.25), false)),
            Widget::Slider {
                step: Some(0.25),
                ..
            }
        ));
        assert!(matches!(
            auto_widget(&number(Some(0.0), None, None, true)),
            Widget::NumberInput { .. }
        ));
        assert!(matches!(
            auto_widget(&number(Some(0.0), Some(1.0), Some(0.05), false)),
            Widget::Slider { .. }
        ));
        assert_eq!(auto_widget(&ParameterKind::Flag), Widget::Toggle);
    }

    #[test]
    fn an_explicit_widget_survives_resolution() {
        let raw = json!({
            "crf": { "Number": { "prefix": "--", "delimiter": " ", "value": 25.0 } }
        });
        let mut descriptors = builtin("svt-av1", &raw);
        descriptors
            .get_mut("--crf")
            .expect("crf is in the map")
            .widget = Widget::NumberInput { step: Some(0.25) };

        resolve_descriptors(&mut descriptors);

        assert_eq!(
            descriptors["--crf"].widget,
            Widget::NumberInput { step: Some(0.25) }
        );
    }

    fn assert_valid_descriptor(encoder: &str, key: &str, descriptor: &ParameterDescriptor) {
        assert_eq!(
            descriptor.widget,
            auto_widget(&descriptor.kind),
            "{encoder} {key} widget"
        );
        if let Widget::Slider { step, marks } = &descriptor.widget {
            assert!(
                step.is_none_or(|value| value > 0.0),
                "{encoder} {key} has an invalid step"
            );
            let mut seen = Vec::new();
            for mark in marks {
                assert!(
                    mark.value.is_finite(),
                    "{encoder} {key} has a non-finite mark"
                );
                assert!(
                    !seen.contains(&mark.value),
                    "{encoder} {key} repeats a mark"
                );
                seen.push(mark.value);
                assert!(
                    mark.label
                        .as_deref()
                        .is_none_or(|label| !label.trim().is_empty()),
                    "{encoder} {key} has an empty mark label"
                );
            }
        }
        match &descriptor.kind {
            ParameterKind::Flag => {
                assert!(
                    descriptor.default.is_none()
                        || matches!(descriptor.default.as_ref(), Some(ParameterValue::Bool(_))),
                    "{encoder} {key} has a non-boolean default"
                );
            }
            ParameterKind::Number(spec) => {
                if let (Some(min), Some(max)) = (spec.min, spec.max) {
                    assert!(min <= max, "{encoder} {key} has an inverted range");
                }
                assert!(!spec.integer || spec.step.is_none_or(|step| step.fract() == 0.0));
                assert!(
                    spec.step.is_none_or(|step| step > 0.0),
                    "{encoder} {key} step"
                );
                assert!(
                    spec.unit
                        .as_deref()
                        .is_none_or(|unit| !unit.trim().is_empty())
                );
                if let Some(ParameterValue::Number(value)) = descriptor.default.as_ref() {
                    assert!(
                        value.is_finite(),
                        "{encoder} {key} has a non-finite default"
                    );
                    assert!(
                        spec.min.is_none_or(|min| *value >= min),
                        "{encoder} {key} below min"
                    );
                    assert!(
                        spec.max.is_none_or(|max| *value <= max),
                        "{encoder} {key} above max"
                    );
                } else {
                    assert!(
                        descriptor.default.is_none(),
                        "{encoder} {key} has a non-number default"
                    );
                }
            }
            ParameterKind::Choice(spec) => {
                assert!(!spec.options.is_empty(), "{encoder} {key} has no choices");
                for option in &spec.options {
                    assert!(
                        !option.label.trim().is_empty(),
                        "{encoder} {key} choice label"
                    );
                }
            }
            _ => {}
        }
    }
}
