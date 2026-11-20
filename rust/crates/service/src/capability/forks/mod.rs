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
mod known;
use help::{parse_help, truncate};
use known::mismatch_warning;
pub(crate) use known::{ALL as KNOWN, KnownFork, detect as detect_profile, find as find_known};

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

/// The option key prefix a project encoder document uses to remember a build selection.
///
/// The engine document has no field for a fork, so the selection is a disabled `Bool`
/// option: it survives a reload, identifies the saved record, and never reaches argv. This
/// is the one codec for that marker on the service side; run preparation must not spell it
/// independently.
const MARKER_PREFIX: &str = "__av1ation_fork_";

/// The saved fork id a project encoder document selects, if it carries the marker.
///
/// The editor names the catalogue row (`fork:<id>`), while settings key the record by
/// `<id>`, so the catalogue prefix is removed here. A marker whose value is not a disabled
/// `Bool` is an ordinary option, not a selection; the first option with the marker's shape
/// wins, so an unrelated option that shares the prefix cannot mask it.
pub(crate) fn document_fork(document: &Value) -> Option<String> {
    let body = document.as_object()?.values().next()?.as_object()?;
    let options = body.get("options")?.as_object()?;
    let (name, _) = options.iter().find(|(name, parameter)| {
        name.starts_with(MARKER_PREFIX) && is_disabled_marker(parameter)
    })?;
    let id = name.strip_prefix(MARKER_PREFIX)?;
    Some(id.strip_prefix("fork:").unwrap_or(id).to_owned())
}

/// Whether one option is the disabled `Bool` a build selection is stored as.
///
/// The value is false, so the engine never emits it. An ordinary option that happens to
/// share the prefix fails this shape and is not a selection.
fn is_disabled_marker(parameter: &Value) -> bool {
    parameter
        .get("Bool")
        .and_then(|boolean| boolean.get("value"))
        .and_then(Value::as_bool)
        == Some(false)
}

/// Probe one executable as a build of `base`. The family stamp check is the same one the
/// Dependencies screen uses, so a path that is not this encoder is rejected before a fork is
/// saved.
pub(crate) fn probe(base: &str, path: &Path) -> EncoderForkProbe {
    let Some(family) = ToolFamily::parse(base) else {
        return unavailable(format!("`{base}` is not an encoder this build can drive."));
    };
    if family.capability() != av1ation_engine::capability::preflight::Capability::Encode {
        return unavailable(
            "FFmpeg is a muxing provider; add an encoder family instead.".to_owned(),
        );
    }

    let check = av1ation_engine::capability::preflight::probe_tool(family, path);
    if !check.available {
        return unavailable(check.detail);
    }

    let version = check
        .detail
        .rsplit_once(" · ")
        .map(|(_, version)| version.to_owned())
        .or(Some(check.detail.clone()));

    let (help, raw_help, parameters) = match help_output(path, help_args(base)) {
        Ok(text) => {
            let parameters = parse_help(&text);
            (truncate(&text), text, parameters)
        }
        Err(error) => (error, String::new(), BTreeMap::new()),
    };
    let profile = detect_profile(base, &raw_help, version.as_deref());

    EncoderForkProbe {
        available: true,
        version,
        detail: help,
        parameters,
        profile: profile.map(|known| known.id.to_owned()),
    }
}

fn unavailable(detail: String) -> EncoderForkProbe {
    EncoderForkProbe {
        available: false,
        version: None,
        detail,
        parameters: BTreeMap::new(),
        profile: None,
    }
}

/// SVT ships its complete option list behind `--full-help`; Essential's ordinary `--help`
/// is reduced. x264 and x265 likewise use `--fullhelp`. Fall back to `--help` when the
/// longer spelling fails, so an older or unusual build still probes.
fn help_args(base: &str) -> &'static [&'static str] {
    match base {
        "svt-av1" => &["--full-help", "--help"],
        "x264" | "x265" => &["--fullhelp", "--help"],
        _ => &["--help"],
    }
}

/// The result of reconciling one probe with the shipped table its build belongs to.
pub(crate) struct ProbeMerge {
    pub(crate) parameters: BTreeMap<ParameterKey, ParameterDescriptor>,
    pub(crate) profile: Option<String>,
    pub(crate) warning: Option<String>,
}

/// Merge one probe into the fork it belongs to.
///
/// `row` is the shipped identity of the row being edited, so a known row keeps its table even
/// when the executable reports a different build. `remembered` is the profile a saved user
/// fork matched before this probe; it keeps that table when the new help no longer shows the
/// signature. A newly detected profile otherwise wins.
pub(crate) fn merge_probe(
    row: Option<&'static KnownFork>,
    remembered: Option<&str>,
    probe: &EncoderForkProbe,
) -> ProbeMerge {
    let detected = probe.profile.as_deref().and_then(find_known);
    let target = row.or(detected).or_else(|| remembered.and_then(find_known));
    let curated = target.map(KnownFork::table);
    let parameters = merge_parameters(
        curated.as_ref(),
        &probe.parameters,
        target.map(|known| known.doc_link),
    );
    ProbeMerge {
        parameters,
        profile: target.map(|known| known.id.to_owned()),
        warning: row.and_then(|known| mismatch_warning(known, detected)),
    }
}

/// Project a saved fork into the catalogue shape the Encoders screen already renders.
pub(crate) fn descriptor(fork: &EncoderFork) -> EncoderDescriptor {
    let default = catalogue::encoders()
        .into_iter()
        .find(|encoder| encoder.id == fork.base)
        .and_then(|encoder| with_executable(encoder.default, fork))
        .unwrap_or(Value::Null);
    let available = !fork.executable.is_empty() && Path::new(&fork.executable).is_file();
    let mut parameters: BTreeMap<String, ParameterDescriptor> = fork
        .parameters
        .iter()
        .map(|(key, descriptor)| (key.canonical().to_owned(), descriptor.clone()))
        .collect();
    crate::capability::descriptors::resolve_descriptors(&mut parameters);

    EncoderDescriptor {
        id: format!("fork:{}", fork.id),
        base: fork.base.clone(),
        label: fork.label.clone(),
        default,
        parameters,
        source: DescriptorSource::Probed,
        executable: (!fork.executable.is_empty()).then(|| fork.executable.clone()),
        version: fork.version.clone(),
        available,
        fork: true,
        warning: fork.warning.clone(),
        overridden: fork.parameters_edited,
    }
}

/// Project a shipped fork to the catalogue shape, using the saved path and edits when the
/// user has any. A known row exists even when no executable has been chosen yet; such a row
/// inherits `base_available`, because it runs the provider the base encoder resolves.
pub(crate) fn known_descriptor(
    known: &KnownFork,
    saved: Option<&EncoderFork>,
    base_available: bool,
) -> EncoderDescriptor {
    let mut fork = saved.cloned().unwrap_or_else(|| known.seed());
    // The label is app-owned so a renamed saved row cannot drift from the shipped name.
    fork.label = known.label.to_owned();
    let mut descriptor = descriptor(&fork);
    if fork.executable.is_empty() {
        descriptor.available = base_available;
    }
    descriptor.source = DescriptorSource::Known;
    descriptor
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

/// Merge a shipped table with the executable's help.
///
/// The table is authoritative for presentation and for flags the parser cannot type; the
/// help is authoritative for presence and stated defaults. A flag the help no longer lists
/// disappears, and a new flag is kept as an advanced, ungrouped row rather than dropped.
/// When the executable could not produce help, the table is kept so a temporarily missing
/// drive does not empty the editor.
fn merge_parameters(
    curated: Option<&BTreeMap<ParameterKey, ParameterDescriptor>>,
    help: &BTreeMap<ParameterKey, ParameterDescriptor>,
    doc_link: Option<&str>,
) -> BTreeMap<ParameterKey, ParameterDescriptor> {
    let Some(curated) = curated else {
        let mut parameters: BTreeMap<_, _> = help
            .iter()
            .filter(|(key, _)| !is_pipeline_flag(key.canonical()))
            .map(|(key, descriptor)| (key.clone(), descriptor.clone()))
            .collect();
        crate::capability::descriptors::resolve_descriptors(&mut parameters);
        return parameters;
    };
    if help.is_empty() {
        return curated
            .iter()
            .filter(|(key, _)| !is_pipeline_flag(key.canonical()))
            .map(|(key, descriptor)| (key.clone(), descriptor.clone()))
            .collect();
    }

    let mut merged = BTreeMap::new();
    for (key, descriptor) in curated {
        if is_pipeline_flag(key.canonical()) {
            continue;
        }
        let Some(parsed) = help.get(key) else {
            continue;
        };
        let mut descriptor = descriptor.clone();
        if parsed.default.is_some() {
            descriptor.default = parsed.default.clone();
        }
        if let Some(link) = doc_link {
            descriptor.doc_link = Some(link.to_owned());
        }
        merged.insert(key.clone(), descriptor);
    }
    for (key, parsed) in help {
        if merged.contains_key(key) || is_pipeline_flag(key.canonical()) {
            continue;
        }
        let mut descriptor = parsed.clone();
        descriptor.group = Some("Additional".to_owned());
        descriptor.advanced = true;
        if let Some(link) = doc_link {
            descriptor.doc_link = Some(link.to_owned());
        }
        merged.insert(key.clone(), descriptor);
    }
    crate::capability::descriptors::resolve_descriptors(&mut merged);
    merged
}

/// Options the project owns: paths, the config file, help/version, and diagnostics. They
/// are kept out of a fork table because offering them would let the editor fight the
/// pipeline or replace the frame geometry it already validated.
fn is_pipeline_flag(key: &str) -> bool {
    matches!(
        key,
        "-i" | "--input"
            | "-b"
            | "--output"
            | "-o"
            | "--config"
            | "--help"
            | "-h"
            | "--full-help"
            | "--fullhelp"
            | "--version"
            | "--progress"
            | "--no-progress"
            | "--hide-banner"
            | "--enable-stat-report"
            | "--stats"
            | "--log"
            | "--log-file"
            | "--log-level"
            | "--quiet"
            | "--verbose"
            | "--psnr"
            | "--ssim"
            | "--vmaf"
    )
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

fn help_output(executable: &Path, args: &[&str]) -> Result<String, String> {
    let mut last_error = None;
    for arg in args {
        match help_output_one(executable, arg) {
            Ok(text) if !text.trim().is_empty() => return Ok(text),
            Ok(_) => last_error = Some(format!("{arg} printed no help")),
            Err(error) => last_error = Some(error),
        }
    }
    Err(last_error.unwrap_or_else(|| "no help arguments were tried".to_owned()))
}

fn help_output_one(executable: &Path, arg: &str) -> Result<String, String> {
    let mut process = Command::new(executable);
    process
        .arg(arg)
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
    if !output.status.success() {
        // `--full-help` is the newest spelling; an older build rejects it with a short
        // error. Report that as a failure so the caller falls back to `--help` instead of
        // parsing the error as an option list.
        return Err(format!(
            "{} {arg} exited with {}",
            executable.display(),
            output.status
        ));
    }
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    let error_text = String::from_utf8_lossy(&output.stderr);
    if !error_text.trim().is_empty() {
        text.push('\n');
        text.push_str(&error_text);
    }
    Ok(text)
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
    fn a_disabled_marker_names_the_saved_fork() {
        let document = serde_json::json!({
            "SVTAV1": {
                "executable": null,
                "options": {
                    "--crf": { "Number": { "prefix": "--", "delimiter": " ", "value": 25.0 } },
                    "__av1ation_fork_fork:svt-av1-essential": {
                        "Bool": { "prefix": "--", "value": false }
                    }
                }
            }
        });
        assert_eq!(
            document_fork(&document).as_deref(),
            Some("svt-av1-essential")
        );
    }

    #[test]
    fn only_a_disabled_marker_names_a_selection() {
        let enabled = serde_json::json!({
            "SVTAV1": {
                "options": {
                    "__av1ation_fork_fork:svt-av1-essential": {
                        "Bool": { "prefix": "--", "value": true }
                    }
                }
            }
        });
        assert_eq!(document_fork(&enabled), None);

        let malformed = serde_json::json!({
            "SVTAV1": { "options": { "__av1ation_fork_fork:svt-av1-essential": "off" } }
        });
        assert_eq!(document_fork(&malformed), None);

        let ordinary = serde_json::json!({ "SVTAV1": { "options": { "--crf": {} } } });
        assert_eq!(document_fork(&ordinary), None);

        // An ordinary option with the prefix is skipped rather than masking the marker
        // that follows it.
        let masked = serde_json::json!({
            "SVTAV1": {
                "options": {
                    "__av1ation_fork_ordinary": {
                        "Bool": { "prefix": "--", "value": true }
                    },
                    "__av1ation_fork_fork:svt-av1-essential": {
                        "Bool": { "prefix": "--", "value": false }
                    }
                }
            }
        });
        assert_eq!(document_fork(&masked).as_deref(), Some("svt-av1-essential"));
    }

    #[test]
    fn fork_defaults_become_engine_options() {
        let mut fork = EncoderFork {
            id: "fork".to_owned(),
            label: "Fork".to_owned(),
            base: "svt-av1".to_owned(),
            executable: "C:/tools/svt.exe".to_owned(),
            version: None,
            profile: None,
            warning: None,
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

    /// A fake SVT build that rejects `--full-help` but answers `--help` with the Essential
    /// signature, like an older build that predates the longer spelling.
    #[cfg(windows)]
    fn fake_build_rejecting_full_help(dir: &Path) -> std::path::PathBuf {
        let script = "\
@echo off
if \"%~1\"==\"--version\" goto version
if \"%~1\"==\"--full-help\" goto reject
if \"%~1\"==\"--help\" goto help
exit /b 2
:version
echo SVT-AV1 Encoder Lib v4.3.0
exit /b 0
:reject
echo unknown option --full-help 1>&2
exit /b 3
:help
echo --enable-alt-cdef Alternative CDEF strength, default is 0 [0-3]
echo --crf Constant Rate Factor, default is 30 [1-70]
exit /b 0
";
        let path = dir.join("fake-svt-av1.cmd");
        std::fs::write(&path, script.replace('\n', "\r\n")).expect("fake encoder");
        path
    }

    #[cfg(unix)]
    fn fake_build_rejecting_full_help(dir: &Path) -> std::path::PathBuf {
        use std::os::unix::fs::PermissionsExt;

        let script = "\
#!/bin/sh
case \"$1\" in
  --version) echo 'SVT-AV1 Encoder Lib v4.3.0'; exit 0 ;;
  --full-help) echo 'unknown option --full-help' >&2; exit 3 ;;
  --help)
    echo '--enable-alt-cdef Alternative CDEF strength, default is 0 [0-3]'
    echo '--crf Constant Rate Factor, default is 30 [1-70]'
    exit 0 ;;
esac
exit 2
";
        let path = dir.join("fake-svt-av1");
        std::fs::write(&path, script).expect("fake encoder");
        let mut permissions = std::fs::metadata(&path)
            .expect("fake encoder metadata")
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&path, permissions).expect("fake encoder permissions");
        path
    }

    #[test]
    fn a_rejected_full_help_falls_back_to_help_and_still_detects_the_profile() {
        let dir =
            std::env::temp_dir().join(format!("av1ation-fork-fallback-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("test directory");
        let executable = fake_build_rejecting_full_help(&dir);

        let probe = probe("svt-av1", &executable);

        assert!(probe.available, "{}", probe.detail);
        assert_eq!(
            probe.profile.as_deref(),
            Some("svt-av1-essential"),
            "the fallback help carries the Essential signature: {}",
            probe.detail
        );
        assert!(
            probe
                .parameters
                .contains_key(&ParameterKey("--enable-alt-cdef".to_owned())),
            "the `--help` option list is parsed after `--full-help` fails: {}",
            probe.detail
        );
        assert!(
            !probe.detail.contains("unknown option"),
            "the editor shows the help, not the rejected spelling's error: {}",
            probe.detail
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_probe_defers_to_the_fork_table_where_the_fork_differs() {
        let known = find_known("svt-av1-essential").expect("the Essential fork is known");
        let curated = known.table();
        let alt_cdef = ParameterKey("--enable-alt-cdef".to_owned());
        let preset = ParameterKey("--preset".to_owned());
        let added = ParameterKey("--new-flag".to_owned());

        let parsed = |kind: ParameterKind, default: Option<ParameterValue>| ParameterDescriptor {
            delimiter: None,
            label: "Parsed".to_owned(),
            description: Some("Parsed help".to_owned()),
            doc_link: None,
            kind,
            default,
            widget: Widget::Auto,
            advanced: true,
            group: None,
            relations: Vec::new(),
        };
        let mut help = BTreeMap::new();
        help.insert(alt_cdef.clone(), parsed(ParameterKind::Flag, None));
        help.insert(
            preset.clone(),
            parsed(
                ParameterKind::Number(NumberSpec {
                    integer: true,
                    min: Some(0.0),
                    max: Some(13.0),
                    step: Some(1.0),
                    unit: None,
                }),
                Some(ParameterValue::Number(8.0)),
            ),
        );
        help.insert(added.clone(), parsed(ParameterKind::Flag, None));

        let merged = merge_parameters(Some(&curated), &help, None);

        // The build lists the fork-only flag, but its generic parse does not replace the
        // fork's own kind and group.
        let alt = &merged[&alt_cdef];
        assert_eq!(alt.kind, curated[&alt_cdef].kind);
        assert_eq!(alt.group.as_deref(), Some("Filtering"));
        assert_eq!(alt.default, curated[&alt_cdef].default);

        // A narrower range in the help does not replace the fork's range, while the help's
        // stated default is authoritative.
        let preset_row = &merged[&preset];
        assert_eq!(preset_row.kind, curated[&preset].kind);
        assert_eq!(preset_row.default, Some(ParameterValue::Number(8.0)));

        // A flag only the build lists is still offered, as an ungrouped advanced row.
        assert_eq!(merged[&added].group.as_deref(), Some("Additional"));
        assert!(merged[&added].advanced);

        // When the build does not list the fork-only flag, the probe removes it instead of
        // guessing that the fork still accepts it.
        let mut silent = BTreeMap::new();
        silent.insert(preset.clone(), parsed(ParameterKind::Flag, None));
        let merged = merge_parameters(Some(&curated), &silent, None);
        assert!(!merged.contains_key(&alt_cdef));
        assert_eq!(
            merged[&preset].default, curated[&preset].default,
            "a help line without a default leaves the fork's default in place"
        );
    }
}
