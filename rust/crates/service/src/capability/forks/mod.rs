//! Encoder forks: a named build of a known encoder with its own parameter set.
//!
//! The engine catalogue names one executable per encoder base. A user's fork is the same
//! base with a different binary and possibly extra flags, so the engine model cannot name
//! it as a new variant. A fork is therefore a saved catalogue entry whose executable path is
//! written into the project's engine encoder document when it is selected, and whose parsed
//! parameters become that document's starting options.
//!
//! The `--help` parse is deliberately best-effort: a fork's help is free-form text, so a
//! descriptor the parser cannot type is kept as text and the user can correct or remove it.
//! The probe never runs project media or encode arguments.

mod help;
use help::{parse_help, truncate};

use std::{
    collections::BTreeMap,
    path::Path,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use av1ation_contracts::encoder::{
    Choice, ChoiceSpec, DescriptorSource, EncoderDescriptor, EncoderFork, EncoderForkProbe,
    NumberSpec, ParameterDescriptor, ParameterKey, ParameterKind, ParameterValue, PathSpec,
    TextFormat, TextSpec, Widget,
};
use av1ation_engine::capability::catalogue;
use av1ation_engine::capability::preflight::ToolFamily;
use av1ation_engine::platform::hide_console;
use serde_json::Value;

const HELP_TIMEOUT: Duration = Duration::from_secs(8);
const HELP_LIMIT: usize = 20_000;

/// Probe one executable as a build of `base`. The family stamp check is the same one the
/// Dependencies screen uses, so a path that is not this encoder is rejected before a fork is
/// saved.
pub(crate) fn probe(base: &str, path: &Path) -> EncoderForkProbe {
    let Some(family) = ToolFamily::parse(base) else {
        return EncoderForkProbe {
            available: false,
            version: None,
            detail: format!("`{base}` is not an encoder this build can drive."),
            parameters: BTreeMap::new(),
        };
    };
    if family.capability() != av1ation_engine::capability::preflight::Capability::Encode {
        return EncoderForkProbe {
            available: false,
            version: None,
            detail: "FFmpeg is a muxing provider; add an encoder family instead.".to_owned(),
            parameters: BTreeMap::new(),
        };
    }

    let check = av1ation_engine::capability::preflight::probe_tool(family, path);
    if !check.available {
        return EncoderForkProbe {
            available: false,
            version: None,
            detail: check.detail,
            parameters: BTreeMap::new(),
        };
    }

    let version = check
        .detail
        .rsplit_once(" · ")
        .map(|(_, version)| version.to_owned())
        .or(Some(check.detail.clone()));

    let (help, parameters) = match help_output(path) {
        Ok(text) => {
            let parameters = parse_help(&text);
            (truncate(&text), parameters)
        }
        Err(error) => (error, BTreeMap::new()),
    };

    EncoderForkProbe {
        available: true,
        version,
        detail: help,
        parameters,
    }
}

/// Project a saved fork into the catalogue shape the Encoders screen already renders.
pub(crate) fn descriptor(fork: &EncoderFork) -> EncoderDescriptor {
    let default = catalogue::encoders()
        .into_iter()
        .find(|encoder| encoder.id == fork.base)
        .and_then(|encoder| with_executable(encoder.default, fork))
        .unwrap_or(Value::Null);
    let available = Path::new(&fork.executable).is_file();

    EncoderDescriptor {
        id: format!("fork:{}", fork.id),
        base: fork.base.clone(),
        label: fork.label.clone(),
        default,
        parameters: fork
            .parameters
            .iter()
            .map(|(key, descriptor)| (key.canonical().to_owned(), descriptor.clone()))
            .collect(),
        source: DescriptorSource::Probed,
        executable: Some(fork.executable.clone()),
        version: fork.version.clone(),
        available,
        fork: true,
        overridden: fork.parameters_edited,
    }
}

/// Write a fork's executable and starting options into an engine encoder document. The
/// document is externally tagged, so the single variant key is the one to update.
fn with_executable(mut document: Value, fork: &EncoderFork) -> Option<Value> {
    let tag = document.as_object()?.keys().next()?.to_owned();
    let body = document.get_mut(&tag)?.as_object_mut()?;
    body.insert(
        "executable".to_owned(),
        Value::String(fork.executable.clone()),
    );
    if !fork.parameters.is_empty() {
        let options = body
            .entry("options")
            .or_insert_with(|| serde_json::json!({}));
        if let Some(object) = options.as_object_mut() {
            for (key, parameter) in options_for(fork) {
                object.insert(key, parameter);
            }
        }
    }
    Some(document)
}

/// Turn a fork's descriptors into the engine's `CLIParameter` map, so selecting the fork
/// starts the project from the build's own flags rather than silently dropping them.
fn options_for(fork: &EncoderFork) -> BTreeMap<String, Value> {
    let mut options = BTreeMap::new();
    for (key, descriptor) in &fork.parameters {
        let name = key.canonical().trim_start_matches('-').to_owned();
        if name.is_empty() {
            continue;
        }
        let prefix = if key.canonical().starts_with("--") {
            "--"
        } else if key.canonical().starts_with('-') {
            "-"
        } else {
            "--"
        };
        if let Some(parameter) = cli_parameter(prefix, descriptor) {
            options.insert(name, parameter);
        }
    }
    options
}

fn cli_parameter(prefix: &str, descriptor: &ParameterDescriptor) -> Option<Value> {
    let value = descriptor.default.clone()?;
    let delimiter = descriptor
        .delimiter
        .as_ref()
        .map(|delimiter| match delimiter {
            av1ation_contracts::encoder::Delimiter::Space => " ".to_owned(),
            av1ation_contracts::encoder::Delimiter::Joined(joined) => joined.clone(),
        })
        .unwrap_or_else(|| " ".to_owned());

    match descriptor.kind {
        ParameterKind::Flag => Some(serde_json::json!({
            "Bool": { "prefix": prefix, "value": matches!(value, ParameterValue::Bool(true)) }
        })),
        ParameterKind::Number(_) => {
            let number = match value {
                ParameterValue::Number(number) => number,
                ParameterValue::Text(text) => text.parse().ok()?,
                _ => return None,
            };
            Some(serde_json::json!({
                "Number": { "prefix": prefix, "delimiter": delimiter, "value": number }
            }))
        }
        _ => {
            let text = match value {
                ParameterValue::Text(text) => text,
                ParameterValue::Number(number) => number.to_string(),
                ParameterValue::Bool(value) => value.to_string(),
                _ => return None,
            };
            Some(serde_json::json!({
                "String": { "prefix": prefix, "delimiter": delimiter, "value": text }
            }))
        }
    }
}

/// Derive a stable slug from a display name, refusing an empty result.
pub(crate) fn slug(label: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for character in label.to_ascii_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            last_dash = false;
        } else if !last_dash && !slug.is_empty() {
            slug.push('-');
            last_dash = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        "encoder-fork".to_owned()
    } else {
        slug
    }
}

fn help_output(executable: &Path) -> Result<String, String> {
    let mut process = Command::new(executable);
    process
        .args(["--help"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console(&mut process);

    let mut child = process
        .spawn()
        .map_err(|error| format!("{}: {error}", executable.display()))?;
    let deadline = Instant::now() + HELP_TIMEOUT;
    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => thread::sleep(Duration::from_millis(20)),
            Err(error) => {
                let _ = child.kill();
                return Err(format!("{}: {error}", executable.display()));
            }
        }
    }
    if child.try_wait().ok().flatten().is_none() {
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!(
            "{} did not print help within {} seconds",
            executable.display(),
            HELP_TIMEOUT.as_secs()
        ));
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("{}: {error}", executable.display()))?;
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    let error_text = String::from_utf8_lossy(&output.stderr);
    if !error_text.trim().is_empty() {
        text.push('\n');
        text.push_str(&error_text);
    }
    Ok(truncate(&text))
}

/// Parse the common `--flag <value>   description` shape. Encoders disagree about the
/// details, so a line that does not fit is skipped rather than guessed.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn help_lines_become_typed_descriptors() {
        let help = "\
--crf <int>        CRF value [0 - 63], default 25
--preset <n>       Encoder preset 0..13
--stitchable       Emit stitchable chunks
--tune <string>    Tune metric
";
        let parameters = parse_help(help);
        assert_eq!(parameters.len(), 4);

        let crf = &parameters[&ParameterKey("--crf".to_owned())];
        let ParameterKind::Number(spec) = &crf.kind else {
            panic!("crf is numeric");
        };
        assert_eq!(spec.min, Some(0.0));
        assert_eq!(spec.max, Some(63.0));

        assert_eq!(
            parameters[&ParameterKey("--stitchable".to_owned())].kind,
            ParameterKind::Flag
        );
        assert!(matches!(
            parameters[&ParameterKey("--tune".to_owned())].kind,
            ParameterKind::Text(_)
        ));
    }

    #[test]
    fn paths_and_text_formats_are_typed_from_help() {
        let help = concat!(
            "--config <file>       Path to the configuration file\n",
            "--log-dir <dir>       Directory for log files\n",
            "--contact <string>    Contact email address\n",
            "--callback <string>   Webhook URL\n",
            "--start <string>      ISO-8601 timestamp\n",
            "--fgs-table           Set the film grain model table path\n",
        );
        let parameters = parse_help(help);

        let config = &parameters[&ParameterKey("--config".to_owned())];
        let ParameterKind::Path(spec) = &config.kind else {
            panic!("a file metavariable is a path")
        };
        assert!(!spec.directory);

        let logs = &parameters[&ParameterKey("--log-dir".to_owned())];
        let ParameterKind::Path(spec) = &logs.kind else {
            panic!("a directory metavariable is a path")
        };
        assert!(spec.directory);

        let format = |key: &str| match &parameters[&ParameterKey(key.to_owned())].kind {
            ParameterKind::Text(spec) => spec.format,
            _ => panic!("{key} is not text"),
        };
        assert_eq!(format("--contact"), Some(TextFormat::Email));
        assert_eq!(format("--callback"), Some(TextFormat::Url));
        assert_eq!(format("--start"), Some(TextFormat::DateTime));

        // A line without a metavar is still a path when its prose names a file.
        assert!(matches!(
            parameters[&ParameterKey("--fgs-table".to_owned())].kind,
            ParameterKind::Path(_)
        ));
    }

    #[test]
    fn svt_prose_typing_makes_values_numbers_not_flags() {
        let help = concat!(
            "--mbr                        Maximum Bitrate (kbps) only applicable for CRF encoding, default is 0 [1-100000]\n",
            "--crf                        Constant Rate Factor value, default is 30 [1-70]\n",
            "--ac-bias                    Strength of AC bias in rate distortion, default is 0.25 [0.0-8.0]\n",
            "--film-grain-denoise         Apply denoising when film grain is ON, default is 0 [0: no denoising, 1: denoise by grain level]\n",
            "--speed                      Encoder speed. Available speeds are: slower, slow, medium, fast, faster. Default is slow.\n",
            "--zones                      CRF/CQP zones, format: start,end,quality, default is no zones\n",
            "--fgs-table                  Set the film grain model table path\n",
            "--webm                       Output WebM instead of IVF\n",
        );
        let parameters = parse_help(help);

        let number = |key: &str| {
            let ParameterKind::Number(spec) = &parameters[&ParameterKey(key.to_owned())].kind
            else {
                panic!("{key} is not numeric")
            };
            spec.clone()
        };
        let mbr = number("--mbr");
        assert_eq!((mbr.min, mbr.max), (Some(1.0), Some(100000.0)));
        assert_eq!(
            parameters[&ParameterKey("--mbr".to_owned())].default,
            Some(ParameterValue::Number(0.0))
        );

        let crf = number("--crf");
        assert_eq!((crf.min, crf.max), (Some(1.0), Some(70.0)));
        assert!(crf.integer);

        // A fractional default makes the control accept fractions rather than rounding them.
        let ac_bias = number("--ac-bias");
        assert!(!ac_bias.integer);
        assert_eq!(
            parameters[&ParameterKey("--ac-bias".to_owned())].default,
            Some(ParameterValue::Number(0.25))
        );
        assert_eq!(
            parameters[&ParameterKey("--ac-bias".to_owned())]
                .description
                .as_deref(),
            Some("Strength of AC bias in rate distortion"),
            "the typed range is not repeated in the description"
        );

        // A documented 0/1 pair becomes a labeled choice; the encoder still gets the number.
        let denoise = &parameters[&ParameterKey("--film-grain-denoise".to_owned())];
        let ParameterKind::Choice(choice) = &denoise.kind else {
            panic!("the documented 0/1 pair is a choice")
        };
        assert_eq!(choice.options.len(), 2);
        assert_eq!(
            choice.value_kind,
            Some(av1ation_contracts::encoder::ChoiceValueKind::Number)
        );
        assert_eq!(choice.options[0].value, ParameterValue::Number(0.0));
        assert_eq!(choice.options[1].label, "denoise by grain level");
        assert_eq!(denoise.default, Some(ParameterValue::Number(0.0)));

        let speed = &parameters[&ParameterKey("--speed".to_owned())];
        let ParameterKind::Choice(choice) = &speed.kind else {
            panic!("speed is an enumerated choice")
        };
        assert_eq!(choice.options.len(), 5);
        assert_eq!(
            choice.value_kind,
            Some(av1ation_contracts::encoder::ChoiceValueKind::Text)
        );
        assert_eq!(speed.default, Some(ParameterValue::Text("slow".to_owned())));

        assert!(matches!(
            parameters[&ParameterKey("--zones".to_owned())].kind,
            ParameterKind::Text(_)
        ));
        assert_eq!(
            parameters[&ParameterKey("--zones".to_owned())].default,
            None,
            "`default is no zones` is not the value `no`"
        );

        let webm = &parameters[&ParameterKey("--webm".to_owned())];
        assert_eq!(webm.kind, ParameterKind::Flag);
        assert_eq!(
            webm.default,
            Some(ParameterValue::Bool(false)),
            "a parsed switch starts off so selecting the build does not send it"
        );
    }

    #[test]
    fn keyed_numbers_become_labeled_choices() {
        let help = concat!(
            "--color-format               Colour format, default is 1 [0: yuv400, 1: yuv420, 2: yuv422, 3: yuv444]\n",
            "--progress                   Verbosity, default is 1 [0: quiet, 2: detailed]\n",
            "--aq-mode                    AQ mode, default is 1 [0: off, 1: variance base using AV1 segments, 2: delta-q prediction (default)]\n",
        );
        let parameters = parse_help(help);

        let color = &parameters[&ParameterKey("--color-format".to_owned())];
        let ParameterKind::Choice(choice) = &color.kind else {
            panic!("the chroma formats are a choice")
        };
        assert_eq!(choice.options.len(), 4);
        assert_eq!(choice.options[1].value, ParameterValue::Number(1.0));
        assert_eq!(choice.options[1].label, "yuv420");
        assert_eq!(color.default, Some(ParameterValue::Number(1.0)));
        assert_eq!(color.description.as_deref(), Some("Colour format"));

        // A gap in the documented keys means the unlisted value is still accepted.
        assert!(matches!(
            parameters[&ParameterKey("--progress".to_owned())].kind,
            ParameterKind::Number(_)
        ));

        // A comma inside a label stays in the label, and `(default)` is not part of it.
        let aq = &parameters[&ParameterKey("--aq-mode".to_owned())];
        let ParameterKind::Choice(choice) = &aq.kind else {
            panic!("the AQ modes are a choice")
        };
        assert_eq!(choice.options[1].label, "variance base using AV1 segments");
        assert_eq!(choice.options[2].label, "delta-q prediction");
        assert_eq!(aq.default, Some(ParameterValue::Number(1.0)));
    }

    #[test]
    fn a_bracketed_enum_list_becomes_a_choice() {
        let help = concat!(
            "--asm                        Limit assembly instruction set, default is max [c, mmx, sse, avx2, max]\n",
            "--chroma                       Chroma sample position, default is 'unknown' ['unknown', 'vertical'/'left']\n",
            "--format <string>              Output format, default is yuv420 [yuv420, yuv422]\n",
            "--force-key-frames            Force key frames at the comma separated specifiers\n",
        );
        let parameters = parse_help(help);

        let asm = &parameters[&ParameterKey("--asm".to_owned())];
        let ParameterKind::Choice(choice) = &asm.kind else {
            panic!("asm is an enumerated choice")
        };
        assert_eq!(choice.options.len(), 5);
        assert_eq!(
            asm.default,
            Some(ParameterValue::Text("max".to_owned())),
            "the stated default is one of the listed names"
        );
        assert_eq!(
            asm.description.as_deref(),
            Some("Limit assembly instruction set"),
            "the enum list and default belong to the control, not the prose"
        );

        // `'vertical'/'left'` spells one value two ways; both become selectable names.
        let chroma = &parameters[&ParameterKey("--chroma".to_owned())];
        let ParameterKind::Choice(choice) = &chroma.kind else {
            panic!("chroma is an enumerated choice")
        };
        assert_eq!(choice.options.len(), 3);

        // A metavariable does not hide a bracket list that says the value is enumerated.
        let format = &parameters[&ParameterKey("--format".to_owned())];
        assert!(matches!(format.kind, ParameterKind::Choice(_)));

        // "comma separated specifiers" is a value, not a switch.
        assert!(matches!(
            parameters[&ParameterKey("--force-key-frames".to_owned())].kind,
            ParameterKind::Text(_)
        ));
    }

    #[test]
    fn equals_forms_short_pairs_and_wrapped_descriptions_are_parsed() {
        let help = concat!(
            "-x, --extra <int>   Extra value [0 - 9]\n",
            "--mode=<string>   Mode name, default slow\n",
            "--long-desc <int> First line of the description\n",
            "                  and the range [2 - 8]\n",
            "--plain           A flag\n",
        );
        let parameters = parse_help(help);
        assert_eq!(parameters.len(), 4);

        // The long spelling of a short/long pair is the canonical key.
        let extra = &parameters[&ParameterKey("--extra".to_owned())];
        let ParameterKind::Number(spec) = &extra.kind else {
            panic!("extra is numeric");
        };
        assert_eq!(spec.max, Some(9.0));

        // `--mode=<string>` carries its metavar inside the token.
        let mode = &parameters[&ParameterKey("--mode".to_owned())];
        assert!(matches!(mode.kind, ParameterKind::Text(_)));
        assert_eq!(mode.default, Some(ParameterValue::Text("slow".to_owned())));

        // A wrapped description contributes the range on its second line.
        let wrapped = &parameters[&ParameterKey("--long-desc".to_owned())];
        let ParameterKind::Number(spec) = &wrapped.kind else {
            panic!("the wrapped value is numeric");
        };
        assert_eq!(spec.min, Some(2.0));
        assert_eq!(spec.max, Some(8.0));
        assert_eq!(
            wrapped.description.as_deref(),
            Some("First line of the description and the range")
        );
    }

    #[test]
    fn a_slug_is_stable_and_never_empty() {
        assert_eq!(slug("SVT-AV1 (my fork)"), "svt-av1-my-fork");
        assert_eq!(slug("***"), "encoder-fork");
    }

    #[test]
    fn fork_defaults_become_engine_options() {
        let mut fork = EncoderFork {
            id: "fork".to_owned(),
            label: "Fork".to_owned(),
            base: "svt-av1".to_owned(),
            executable: "C:/tools/svt.exe".to_owned(),
            version: None,
            parameters: BTreeMap::new(),
            parameters_edited: false,
        };
        fork.parameters.insert(
            ParameterKey("--crf".to_owned()),
            ParameterDescriptor {
                delimiter: Some(av1ation_contracts::encoder::Delimiter::Space),
                label: "CRF".to_owned(),
                description: None,
                doc_link: None,
                kind: ParameterKind::Number(NumberSpec {
                    integer: true,
                    min: Some(0.0),
                    max: Some(63.0),
                    step: Some(1.0),
                    unit: None,
                }),
                default: Some(ParameterValue::Number(20.0)),
                widget: Widget::Auto,
                advanced: false,
                group: None,
                relations: Vec::new(),
            },
        );
        let options = options_for(&fork);
        assert_eq!(options["crf"]["Number"]["value"], 20.0);
        assert_eq!(options["crf"]["Number"]["prefix"], "--");
    }
}
