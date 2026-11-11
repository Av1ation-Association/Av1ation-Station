//! The VapourSynth plugins a run's scripts actually call.
//!
//! VSScript evaluates a script lazily, so a missing plugin is discovered only when the input
//! is opened, and its message — "No attribute with the name hqdn3d exists" — never says that
//! `hqdn3d` is a plugin. That is the wrong time and the wrong wording: a run has already
//! started, and the user has to know VapourSynth's namespace rules to act on it.
//!
//! This module reads the literal `core.<namespace>` and `core.<namespace>.<function>` calls a
//! script makes and asks the loaded core before the run starts. It is deliberately a static
//! check: Python can build its graph dynamically, and a full check of that needs evaluation.
//! The static check covers the calls a user writes, while [`explain_open_error`] translates
//! the dynamic remainder when it fails.

use std::{
    collections::{BTreeMap, BTreeSet},
    panic::{AssertUnwindSafe, catch_unwind},
};

use andean_condor::models::input::{Input as InputModel, VapourSynthScriptSource};
use serde_json::Value;

use crate::RunnerConfig;

/// Core methods that are attributes on the core object rather than plugin namespaces.
///
/// Without this list, `core.get_plugin_by_namespace("hqdn3d")` would look like a plugin
/// namespace called `get_plugin_by_namespace` and every script that inspects its environment
/// would be rejected. The list is the Python core's public surface, not a plugin table.
const CORE_MEMBERS: &[&str] = &[
    "add_log_handler",
    "api_version",
    "clear_cache",
    "core",
    "core_version",
    "create_video_frame",
    "flags",
    "get_format",
    "get_plugin_by_id",
    "get_plugin_by_namespace",
    "get_video_format",
    "info",
    "log_message",
    "max_cache_size",
    "max_vram_cache_size",
    "num_threads",
    "plugins",
    "query_video_format",
    "register_format",
    "remove_log_handler",
    "set_max_cache_size",
    "set_thread_count",
    "set_vulkan_device",
    "timings",
    "used_cache_size",
    "version",
    "version_number",
    "vulkan_device_info",
    "vulkan_devices",
];

/// One script the run will open, named for the error message.
struct Script {
    context: String,
    source: String,
}

/// A plugin namespace or function one script refers to.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Reference {
    namespace: String,
    function: Option<String>,
}

/// One reference a script makes that the loaded core does not provide.
///
/// The fields are deliberately separate rather than a single sentence: the preflight API
/// renders the namespace beside the section that called it, and the start error groups the
/// same facts into prose.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct PluginProblem {
    /// The script section that made the call, for example `Encoding`.
    pub context: String,
    /// The plugin namespace, for example `hqdn3d`.
    pub namespace: String,
    /// The function inside an installed namespace, when only that function is missing.
    pub function: Option<String>,
}

impl PluginProblem {
    /// One sentence naming the section and what is missing.
    pub fn detail(&self) -> String {
        match &self.function {
            None => format!(
                "The {} uses the `{}` VapourSynth plugin, but it is not installed.",
                context_label(&BTreeSet::from([self.context.clone()])),
                self.namespace
            ),
            Some(function) => format!(
                "The {} calls `core.{}.{function}`, but the `{}` plugin does not provide `{function}`.",
                context_label(&BTreeSet::from([self.context.clone()])),
                self.namespace,
                self.namespace
            ),
        }
    }

    /// What to install or remove to make the reference valid.
    pub fn remediation(&self) -> String {
        match &self.function {
            None => format!(
                "Install the `{}` VapourSynth plugin, or remove the filter that uses it.",
                self.namespace
            ),
            Some(function) => format!(
                "Install a build of the `{}` plugin that provides `{function}`, or remove the filter that calls it.",
                self.namespace
            ),
        }
    }
}

/// Answers whether the loaded core provides a plugin namespace or one of its functions.
///
/// The second argument is `None` for the namespace itself and `Some(function)` for a
/// function inside it. `None` means the core could not answer, so the reference is left to
/// the open rather than reported as missing; a host with no VapourSynth has no plugin table
/// to compare against. Tests inject a lookup built from a fixture, which is what exercises
/// the structured preflight result without a real VapourSynth install.
pub type PluginLookup = dyn Fn(&str, Option<&str>) -> Option<bool> + Send + Sync;

/// Check every VapourSynth script this run will open before the run starts.
///
/// `sequences` is the already-derived run order, so a single-sequence request checks only the
/// inputs that sequence opens. An unrelated override with a broken script therefore does not
/// block Scene Detection, matching the runner's one-at-a-time construction.
///
/// The values are the same engine documents the request carries. A host that has no
/// VapourSynth loaded cannot answer the question, so this check passes and the open itself
/// reports the missing runtime; rejecting every script there would remove the capability that
/// VapourSynth provides without adding a useful diagnosis.
pub fn validate_run_scripts(
    input: &Value,
    sequence_config: &Value,
    sequences: &[String],
) -> Result<(), String> {
    let problems = missing_plugins(input, sequence_config, sequences)?;
    if problems.is_empty() {
        Ok(())
    } else {
        Err(problems_message(&problems))
    }
}

/// The missing plugin references this run would encounter, without starting it.
///
/// The preflight reuses this so the page that owns an input can name a plugin before the
/// user presses Start. An unreadable script path is returned as the error, the same way a
/// start request reports it. A host with no usable VapourSynth returns an empty list: the
/// open itself has to report the missing runtime, because no plugin table exists to compare
/// against.
pub fn missing_plugins(
    input: &Value,
    sequence_config: &Value,
    sequences: &[String],
) -> Result<Vec<PluginProblem>, String> {
    let scripts = scripts_from_documents(input, sequence_config, sequences)?;
    Ok(installed_problems(&scripts))
}

/// The missing plugin references a run would encounter with a supplied plugin table.
///
/// This is the same parse and same problem grouping as [`missing_plugins`], with the live
/// core replaced. A caller can therefore exercise a project or a template with a fixture
/// lookup before any video exists, and a route test can assert the structured response
/// without installing VapourSynth.
pub fn missing_plugins_with_lookup(
    input: &Value,
    sequence_config: &Value,
    sequences: &[String],
    lookup: &PluginLookup,
) -> Result<Vec<PluginProblem>, String> {
    let scripts = scripts_from_documents(input, sequence_config, sequences)?;
    Ok(problems_from(&scripts, lookup))
}

fn scripts_from_documents(
    input: &Value,
    sequence_config: &Value,
    sequences: &[String],
) -> Result<Vec<Script>, String> {
    let input: InputModel = serde_json::from_value(input.clone())
        .map_err(|error| format!("The input is not valid: {error}"))?;
    let config: RunnerConfig = serde_json::from_value(sequence_config.clone())
        .map_err(|error| format!("The sequence configuration is not valid: {error}"))?;
    scripts_for_run(&input, &config, sequences)
}

/// Name a missing plugin when a VapourSynth open fails at runtime.
///
/// The pre-run scan covers literal calls. A script that builds its graph with `getattr`,
/// `exec`, or a helper imported from a local module bypasses it; this turns the engine's
/// namespace error into the same plug-in sentence, without pretending to know which sequence
/// failed (the terminal event already names that).
pub fn explain_open_error(input: &InputModel, message: &str) -> Option<String> {
    let name = missing_attribute(message)?;
    let source = script_source(input, "VapourSynth").ok().flatten()?;
    let references = references(&source);

    if references
        .iter()
        .any(|reference| reference.namespace == name)
    {
        return Some(missing_plugin_message(&name, "The VapourSynth script"));
    }
    if let Some(reference) = references
        .iter()
        .find(|reference| reference.function.as_deref() == Some(name.as_str()))
    {
        return Some(missing_function_message(
            &reference.namespace,
            &name,
            "The VapourSynth script",
        ));
    }

    // The access was dynamic, so the script text cannot say whether this was a namespace or
    // a function. Ask the core: a name that is not a namespace is the plugin case the user
    // needs to install.
    if namespace_is_loaded(&name).is_some_and(|loaded| !loaded) {
        Some(missing_plugin_message(&name, "The VapourSynth script"))
    } else {
        None
    }
}

/// The scripts this run's sequence list will open, in run order.
fn scripts_for_run(
    input: &InputModel,
    config: &RunnerConfig,
    sequences: &[String],
) -> Result<Vec<Script>, String> {
    let mut scripts = Vec::new();
    push_script(input, "General input", &mut scripts)?;
    for sequence in sequences {
        for (context, input) in sequence_inputs(config, sequence) {
            if let Some(input) = input {
                push_script(input, context, &mut scripts)?;
            }
        }
    }

    // The same override can serve Benchmarker and Parallel Encoder, or be repeated by two
    // sequence ids; one script should produce one context in the error, not a duplicate.
    scripts.sort_by(|left, right| {
        left.context
            .cmp(&right.context)
            .then_with(|| left.source.cmp(&right.source))
    });
    scripts.dedup_by(|left, right| left.context == right.context && left.source == right.source);
    Ok(scripts)
}

/// The input overrides one sequence opens, with the names the UI uses for those sections.
fn sequence_inputs<'a>(
    config: &'a RunnerConfig,
    sequence: &str,
) -> Vec<(&'static str, Option<&'a InputModel>)> {
    match sequence {
        "SceneDetector" => vec![("Scene detection", config.scene_detector.input.as_ref())],
        "NoiseDetector" => vec![(
            "Noise detection",
            config
                .noise_detector
                .as_ref()
                .and_then(|noise| noise.input.as_ref()),
        )],
        "TargetQuality" => config
            .target_quality
            .as_ref()
            .map_or_else(Vec::new, |quality| {
                vec![
                    ("Target quality", quality.input.as_ref()),
                    ("Target quality metric input", quality.metric_input.as_ref()),
                ]
            }),
        // Benchmarker opens the same decode as the encoder it resolves workers for.
        "Benchmarker" | "ParallelEncoder" => {
            vec![("Encoding", config.parallel_encoder.input.as_ref())]
        }
        "QualityCheck" => vec![(
            "Quality check",
            config
                .quality_check
                .as_ref()
                .and_then(|quality| quality.input.as_ref()),
        )],
        // Noise scaling, speed scaling, bitrate optimization, and concatenation consume data
        // rather than opening an input.
        _ => Vec::new(),
    }
}

fn push_script(input: &InputModel, context: &str, scripts: &mut Vec<Script>) -> Result<(), String> {
    let Some(source) = script_source(input, context)? else {
        return Ok(());
    };
    scripts.push(Script {
        context: context.to_owned(),
        source,
    });
    Ok(())
}

/// The text of a `VapourSynthScript` input, or `None` for every other input kind.
fn script_source(input: &InputModel, context: &str) -> Result<Option<String>, String> {
    let InputModel::VapourSynthScript { source, .. } = input else {
        return Ok(None);
    };
    match source {
        VapourSynthScriptSource::Text(text) => Ok(Some(text.clone())),
        VapourSynthScriptSource::Path(path) => {
            std::fs::read_to_string(path).map(Some).map_err(|error| {
                format!(
                    "The VapourSynth script for {context} could not be read ({}): {error}",
                    path.display()
                )
            })
        }
    }
}

/// Every reference one script makes, with comments and string literals removed first.
fn references(source: &str) -> Vec<Reference> {
    let tokens = tokens(source);
    let modules = module_aliases(&tokens);
    let cores = core_aliases(&tokens, &modules);
    let mut references = BTreeSet::new();

    for index in 0..tokens.len() {
        let Some(name) = ident(&tokens, index) else {
            continue;
        };

        // `vs.core.<namespace>` and `vapoursynth.core.<namespace>`.
        if modules.contains(name)
            && is_punct(&tokens, index + 1, '.')
            && ident(&tokens, index + 2) == Some("core")
            && is_punct(&tokens, index + 3, '.')
            && let Some(namespace) = ident(&tokens, index + 4)
            && !CORE_MEMBERS.contains(&namespace)
            && is_namespace(namespace)
        {
            references.insert(Reference {
                namespace: namespace.to_owned(),
                function: function_after(&tokens, index + 5),
            });
        }

        // A local alias for the core, including the conventional `core` itself. The core
        // created by VSScript is available as `core` even without an assignment.
        if cores.contains(name)
            && is_punct(&tokens, index + 1, '.')
            && let Some(namespace) = ident(&tokens, index + 2)
            && !CORE_MEMBERS.contains(&namespace)
            && is_namespace(namespace)
        {
            references.insert(Reference {
                namespace: namespace.to_owned(),
                function: function_after(&tokens, index + 3),
            });
        }
    }

    references.into_iter().collect()
}

/// A plugin function name only when the namespace is followed by one: `.Function`.
fn function_after(tokens: &[Token], dot: usize) -> Option<String> {
    if !is_punct(tokens, dot, '.') {
        return None;
    }
    let function = ident(tokens, dot + 1)?;
    (is_namespace(function) && !function.starts_with("__")).then(|| function.to_owned())
}

/// Whether a script supplies its own plugin at runtime.
///
/// `core.std.LoadPlugin` and `core.avs.LoadPlugin` make the loaded set depend on the script's
/// own control flow, so a namespace missing from this process is not proof that the script
/// will fail. The open itself covers that case.
fn loads_plugins(source: &str) -> bool {
    tokens(source).into_iter().any(|token| {
        matches!(
            token,
            Token::Ident(name) if name == "LoadPlugin" || name == "LoadAllPlugins"
        )
    })
}

fn is_namespace(name: &str) -> bool {
    let mut chars = name.chars();
    chars
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
        && chars.all(|char| char.is_ascii_alphanumeric() || char == '_')
}

/// Python tokens with comments and string literals discarded.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Ident(String),
    Punct(char),
}

fn tokens(source: &str) -> Vec<Token> {
    let chars: Vec<char> = source.chars().collect();
    let mut tokens = Vec::new();
    let mut index = 0;
    while index < chars.len() {
        let char = chars[index];
        if char.is_whitespace() {
            index += 1;
        } else if char == '#' {
            while index < chars.len() && chars[index] != '\n' {
                index += 1;
            }
        } else if char == '\'' || char == '"' {
            index = skip_string(&chars, index);
        } else if char.is_alphabetic() || char == '_' {
            let start = index;
            while index < chars.len() && (chars[index].is_alphanumeric() || chars[index] == '_') {
                index += 1;
            }
            tokens.push(Token::Ident(chars[start..index].iter().collect()));
        } else {
            tokens.push(Token::Punct(char));
            index += 1;
        }
    }
    tokens
}

/// Skip one string literal, including a triple-quoted one, and return the index after it.
fn skip_string(chars: &[char], start: usize) -> usize {
    let quote = chars[start];
    let triple = start + 2 < chars.len() && chars[start + 1] == quote && chars[start + 2] == quote;
    let mut index = start + if triple { 3 } else { 1 };
    while index < chars.len() {
        let char = chars[index];
        if char == '\\' {
            index += 2;
        } else if triple {
            if char == quote
                && index + 2 < chars.len()
                && chars[index + 1] == quote
                && chars[index + 2] == quote
            {
                return index + 3;
            }
            index += 1;
        } else if char == quote {
            return index + 1;
        } else if char == '\n' {
            // Python ends an unterminated single-line string at the newline. Treating the
            // newline as the end keeps the rest of the file tokenised instead of swallowing
            // every line after a syntax error.
            return index;
        } else {
            index += 1;
        }
    }
    chars.len()
}

fn ident(tokens: &[Token], index: usize) -> Option<&str> {
    match tokens.get(index) {
        Some(Token::Ident(name)) => Some(name),
        _ => None,
    }
}

fn is_punct(tokens: &[Token], index: usize, expected: char) -> bool {
    matches!(tokens.get(index), Some(Token::Punct(char)) if *char == expected)
}

/// The names the script uses for the `vapoursynth` module.
///
/// `vs` is included even without an import because it is the universal spelling in scripts and
/// VSScript's own examples; a local variable of that name would only create a false reference
/// if it had a plugin-shaped attribute, which is not Python's normal use of `vs`.
fn module_aliases(tokens: &[Token]) -> BTreeSet<String> {
    let mut aliases = BTreeSet::from(["vapoursynth".to_owned(), "vs".to_owned()]);
    for index in 0..tokens.len() {
        if ident(tokens, index) == Some("import")
            && ident(tokens, index + 1) == Some("vapoursynth")
            && ident(tokens, index + 2) == Some("as")
            && let Some(alias) = ident(tokens, index + 3)
        {
            aliases.insert(alias.to_owned());
        }
    }
    aliases
}

/// The names the script uses for the loaded core.
fn core_aliases(tokens: &[Token], modules: &BTreeSet<String>) -> BTreeSet<String> {
    let mut aliases = BTreeSet::from(["core".to_owned()]);

    // `from vapoursynth import core as c`, and the `import vapoursynth.core as c` spelling.
    for index in 0..tokens.len() {
        if ident(tokens, index) == Some("from")
            && let Some(module) = ident(tokens, index + 1)
            && modules.contains(module)
            && ident(tokens, index + 2) == Some("import")
            && ident(tokens, index + 3) == Some("core")
            && ident(tokens, index + 4) == Some("as")
            && let Some(alias) = ident(tokens, index + 5)
        {
            aliases.insert(alias.to_owned());
        }
        if ident(tokens, index) == Some("import")
            && let Some(module) = ident(tokens, index + 1)
            && modules.contains(module)
            && is_punct(tokens, index + 2, '.')
            && ident(tokens, index + 3) == Some("core")
            && ident(tokens, index + 4) == Some("as")
            && let Some(alias) = ident(tokens, index + 5)
        {
            aliases.insert(alias.to_owned());
        }
    }

    // Follow assignment chains until they stop growing, so `c = vs.core` and then
    // `d = c` are both recognised. The loop is bounded by the number of names in the file.
    let mut changed = true;
    while changed {
        changed = false;
        for index in 0..tokens.len() {
            let Some(name) = ident(tokens, index) else {
                continue;
            };
            if !is_punct(tokens, index + 1, '=')
                || aliases.contains(name)
                || !is_core_expression(tokens, index + 2, modules, &aliases)
            {
                continue;
            }
            changed |= aliases.insert(name.to_owned());
        }
    }
    aliases
}

fn is_core_expression(
    tokens: &[Token],
    start: usize,
    modules: &BTreeSet<String>,
    aliases: &BTreeSet<String>,
) -> bool {
    let Some(first) = ident(tokens, start) else {
        return false;
    };
    if aliases.contains(first) {
        // Only a bare alias is the core. A filter call starts with the same name
        // (`clip = core.ffms2.Source(...)`) but the result is a VideoNode, and treating it
        // as another core alias would turn `clip.set_output()` into a phantom plugin called
        // `set_output`.
        return !projects_or_calls(tokens, start + 1);
    }
    if !modules.contains(first) {
        return false;
    }
    if is_punct(tokens, start + 1, '.')
        && ident(tokens, start + 2) == Some("core")
        && !projects_or_calls(tokens, start + 3)
    {
        return true;
    }
    is_punct(tokens, start + 1, '.')
        && ident(tokens, start + 2) == Some("get_core")
        && is_punct(tokens, start + 3, '(')
        && !projects_or_calls(tokens, start + 5)
}

/// Whether the expression continues past the matched core, which makes it a clip.
fn projects_or_calls(tokens: &[Token], index: usize) -> bool {
    matches!(tokens.get(index), Some(Token::Punct('.' | '(' | '[')))
}

/// The live-core check. A host without a usable VapourSynth reports no problems so the open
/// itself can report the missing runtime.
fn installed_problems(scripts: &[Script]) -> Vec<PluginProblem> {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let environment = vapoursynth::prelude::Environment::new().ok()?;
        let core = environment.get_core().ok()?;
        let lookup = |namespace: &str, function: Option<&str>| -> Option<bool> {
            let plugin = core.get_plugin_by_namespace(namespace).ok()?;
            match (plugin, function) {
                (None, _) => Some(false),
                (Some(_), None) => Some(true),
                (Some(plugin), Some(function)) => plugin
                    .get_plugin_function_by_name(function)
                    .ok()
                    .map(|found| found.is_some()),
            }
        };
        Some(problems_from(scripts, &lookup))
    }));
    result.ok().flatten().unwrap_or_default()
}

/// Turn parsed references into the same problems for either the live core or a fixture.
fn problems_from<F>(scripts: &[Script], lookup: &F) -> Vec<PluginProblem>
where
    F: Fn(&str, Option<&str>) -> Option<bool> + ?Sized,
{
    let mut problems = BTreeSet::new();
    for script in scripts {
        // A script that loads its own plugins can legitimately use a namespace this process
        // has not loaded yet; only evaluation can know whether that happened. Leave those
        // scripts to the runtime translation instead of rejecting them.
        if loads_plugins(&script.source) {
            continue;
        }
        for reference in references(&script.source) {
            match lookup(&reference.namespace, None) {
                Some(true) => {}
                Some(false) => {
                    problems.insert(PluginProblem {
                        context: script.context.clone(),
                        namespace: reference.namespace,
                        function: None,
                    });
                    continue;
                }
                // The core could not answer; the open is the only reliable source then.
                None => continue,
            }
            let Some(function) = reference.function else {
                continue;
            };
            if matches!(lookup(&reference.namespace, Some(&function)), Some(false)) {
                problems.insert(PluginProblem {
                    context: script.context.clone(),
                    namespace: reference.namespace,
                    function: Some(function),
                });
            }
        }
    }
    problems.into_iter().collect()
}

fn namespace_is_loaded(namespace: &str) -> Option<bool> {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let environment = vapoursynth::prelude::Environment::new().ok()?;
        let core = environment.get_core().ok()?;
        Some(
            core.get_plugin_by_namespace(namespace)
                .is_ok_and(|plugin| plugin.is_some()),
        )
    }));
    result.ok().flatten()
}

/// The message the start request returns for every missing reference.
///
/// Public so the per-video preflight can state the same facts in its blocker list without
/// reformatting them.
pub fn problems_message(problems: &[PluginProblem]) -> String {
    let mut sentences = Vec::new();

    let mut missing_namespaces: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut missing_functions: BTreeMap<(String, String), BTreeSet<String>> = BTreeMap::new();
    for problem in problems {
        match &problem.function {
            None => {
                missing_namespaces
                    .entry(problem.namespace.clone())
                    .or_default()
                    .insert(problem.context.clone());
            }
            Some(function) => {
                missing_functions
                    .entry((problem.namespace.clone(), function.clone()))
                    .or_default()
                    .insert(problem.context.clone());
            }
        }
    }

    if let Some((namespace, contexts)) = missing_namespaces.iter().next()
        && missing_namespaces.len() == 1
    {
        let contexts = context_label(contexts);
        let verb = if contexts.ends_with("scripts") {
            "use"
        } else {
            "uses"
        };
        sentences.push(format!(
            "The {contexts} {verb} the `{namespace}` VapourSynth plugin, but it is not installed."
        ));
    } else if !missing_namespaces.is_empty() {
        let contexts: BTreeSet<String> = missing_namespaces
            .values()
            .flat_map(|contexts| contexts.iter().cloned())
            .collect();
        let plugins = missing_namespaces
            .keys()
            .map(|name| format!("`{name}`"))
            .collect::<Vec<_>>()
            .join(", ");
        sentences.push(format!(
            "The {} use VapourSynth plugins that are not installed: {plugins}.",
            context_label(&contexts)
        ));
    }
    if !missing_namespaces.is_empty() {
        sentences.push(format!(
            "Install {} and restart the run, or remove the filter that uses {}.",
            if missing_namespaces.len() == 1 {
                "the plugin"
            } else {
                "them"
            },
            if missing_namespaces.len() == 1 {
                "it"
            } else {
                "them"
            }
        ));
    }

    for ((namespace, function), contexts) in &missing_functions {
        sentences.push(format!(
            "The {} call `core.{namespace}.{function}`, but the `{namespace}` plugin does not provide `{function}`.",
            context_label(contexts)
        ));
    }

    sentences.join(" ")
}

fn missing_plugin_message(namespace: &str, subject: &str) -> String {
    format!(
        "{subject} uses the `{namespace}` VapourSynth plugin, but it is not installed. Install the plugin and restart the run, or remove the filter that uses it."
    )
}

fn missing_function_message(namespace: &str, function: &str, subject: &str) -> String {
    format!(
        "{subject} calls `core.{namespace}.{function}`, but the `{namespace}` plugin does not provide `{function}`."
    )
}

fn context_label(contexts: &BTreeSet<String>) -> String {
    // Run order reads better than alphabetical order in a sentence, and a script that is
    // shared by several sections should name them in the order the run reaches them.
    const ORDER: [&str; 7] = [
        "General input",
        "Scene detection",
        "Noise detection",
        "Target quality",
        "Target quality metric input",
        "Encoding",
        "Quality check",
    ];
    let mut contexts: Vec<&str> = contexts.iter().map(String::as_str).collect();
    contexts.sort_by_key(|context| {
        ORDER
            .iter()
            .position(|known| known == context)
            .unwrap_or(usize::MAX)
    });
    match contexts.as_slice() {
        [] => "VapourSynth script".to_owned(),
        [one] => format!("{one} script"),
        [first, second] => format!("{first} and {second} scripts"),
        _ => match contexts.split_last() {
            Some((last, rest)) => format!("{}, and {last} scripts", rest.join(", ")),
            None => "VapourSynth script".to_owned(),
        },
    }
}

/// The identifier VSScript names in its missing-namespace error.
fn missing_attribute(message: &str) -> Option<String> {
    const MARKER: &str = "No attribute with the name ";
    let start = message.find(MARKER)? + MARKER.len();
    let rest = &message[start..];
    let end = rest
        .find(|char: char| {
            !(char.is_ascii_alphanumeric()
                || char == '_'
                || char == '\''
                || char == '"'
                || char == '`')
        })
        .unwrap_or(rest.len());
    let name = rest[..end].trim_matches(|char: char| char == '\'' || char == '"' || char == '`');
    is_namespace(name).then(|| name.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_a_literal_plugin_and_function() {
        let found = references(
            "import vapoursynth as vs\n\
             core = vs.core\n\
             clip = core.hqdn3d.Hqdn3d(clip)",
        );
        assert_eq!(
            found,
            vec![Reference {
                namespace: "hqdn3d".to_owned(),
                function: Some("Hqdn3d".to_owned()),
            }]
        );
    }

    #[test]
    fn ignores_comments_strings_and_core_methods() {
        let found = references(
            "# core.hqdn3d.Hqdn3d(clip)\n\
             text = \"core.fmtc.resample(clip)\"\n\
             doc = '''core.vship.SSIMULACRA2'''\n\
             plugin = core.get_plugin_by_namespace(\"hqdn3d\")\n\
             clip = core.std.BlankClip()",
        );
        assert_eq!(
            found,
            vec![Reference {
                namespace: "std".to_owned(),
                function: Some("BlankClip".to_owned()),
            }]
        );
    }

    #[test]
    fn ignores_core_properties_on_the_module_path() {
        // `vs.core.max_cache_size` is the core's own property, not a plugin namespace. The
        // module-qualified path used to bypass the allowlist that `core.max_cache_size`
        // already honoured, so a script that tuned the cache was rejected for a plugin that
        // does not exist.
        let found = references(
            "import vapoursynth as vs\n\
             vs.core.max_cache_size = 4096\n\
             vapoursynth.core.num_threads = 8\n\
             clip = vs.core.std.BlankClip()",
        );
        assert_eq!(
            found,
            vec![Reference {
                namespace: "std".to_owned(),
                function: Some("BlankClip".to_owned()),
            }]
        );
    }

    #[test]
    fn a_core_property_on_the_module_path_is_not_a_plugin_problem() {
        let scripts = [Script {
            context: "Target quality".to_owned(),
            source: "import vapoursynth as vs\n\
                     vs.core.max_cache_size = 4096\n\
                     clip = vs.core.std.BlankClip()"
                .to_owned(),
        }];
        let problems = installed_problems_with(&scripts, |namespace, _| namespace == "std");
        assert!(problems.is_empty(), "{problems:?}");
    }

    #[test]
    fn a_script_that_loads_its_own_plugins_is_left_to_the_open() {
        let script = "core.std.LoadPlugin(path='hqdn3d.dll')\nclip = core.hqdn3d.Hqdn3d(clip)";
        assert!(loads_plugins(script));
        assert!(!loads_plugins("comment = 'LoadPlugin'"));
    }

    #[test]
    fn follows_module_and_core_aliases() {
        let found = references(
            "import vapoursynth as v\n\
             c = v.core\n\
             d = c\n\
             clip = d.fmtc.resample(clip)",
        );
        assert_eq!(
            found,
            vec![Reference {
                namespace: "fmtc".to_owned(),
                function: Some("resample".to_owned()),
            }]
        );
    }

    #[test]
    fn a_filter_result_is_not_another_core_alias() {
        let found = references(
            "clip = core.ffms2.Source(source=cd.video_path)\n\
             clip.set_output()",
        );
        assert_eq!(
            found,
            vec![Reference {
                namespace: "ffms2".to_owned(),
                function: Some("Source".to_owned()),
            }]
        );
    }

    #[test]
    fn a_spliced_clip_is_not_a_core_alias() {
        // The application's own template splices progressively, assigning each splice to
        // `out` and then calling `out.set_output()`. Treating the assignment's left-hand
        // side as a second core made `set_output` look like a missing plugin, so this shape
        // is pinned.
        let found = references(
            "parts = []\n\
             out = core.std.Splice(parts) if parts else src\n\
             out.set_output()",
        );
        assert_eq!(
            found,
            vec![Reference {
                namespace: "std".to_owned(),
                function: Some("Splice".to_owned()),
            }]
        );
    }

    #[test]
    fn a_target_quality_metric_namespace_is_detected() {
        let found = references("clip = vs.core.vship.SSIMULACRA2(clip)\n");
        assert_eq!(
            found,
            vec![Reference {
                namespace: "vship".to_owned(),
                function: Some("SSIMULACRA2".to_owned()),
            }]
        );
    }

    #[test]
    fn one_reference_is_reported_once() {
        let found =
            references("clip = core.hqdn3d.Hqdn3d(clip)\nother = core.hqdn3d.Hqdn3d(clip)\n");
        assert_eq!(found.len(), 1);
    }

    #[test]
    fn a_missing_namespace_names_the_plugin_and_the_script_context() {
        let scripts = [
            Script {
                context: "Scene detection".to_owned(),
                source: "clip = core.hqdn3d.Hqdn3d(clip)".to_owned(),
            },
            Script {
                context: "Encoding".to_owned(),
                source: "clip = core.hqdn3d.Hqdn3d(clip)".to_owned(),
            },
        ];
        let problems = installed_problems_with(&scripts, |namespace, _| namespace != "hqdn3d");
        let message = problems_message(&problems);
        assert!(message.contains("`hqdn3d`"), "{message}");
        assert!(
            message.contains("Scene detection and Encoding scripts"),
            "{message}"
        );
        assert!(message.contains("not installed"), "{message}");
    }

    #[test]
    fn a_missing_function_names_the_plugin_and_function() {
        let scripts = [Script {
            context: "Encoding".to_owned(),
            source: "clip = core.fmtc.resample(clip)".to_owned(),
        }];
        let problems = installed_problems_with(&scripts, |namespace, function| {
            namespace != "fmtc" || function != Some("resample")
        });
        let message = problems_message(&problems);
        assert!(
            message.contains("`fmtc` plugin does not provide `resample`"),
            "{message}"
        );
        assert!(message.contains("Encoding script"), "{message}");
    }

    #[test]
    fn a_plugin_problem_names_the_namespace_section_and_install() {
        let missing = PluginProblem {
            context: "Encoding".to_owned(),
            namespace: "hqdn3d".to_owned(),
            function: None,
        };
        assert_eq!(
            missing.detail(),
            "The Encoding script uses the `hqdn3d` VapourSynth plugin, but it is not installed."
        );
        assert!(missing.remediation().contains("`hqdn3d`"));

        let missing_function = PluginProblem {
            context: "Scene detection".to_owned(),
            namespace: "fmtc".to_owned(),
            function: Some("resample".to_owned()),
        };
        assert_eq!(
            missing_function.detail(),
            "The Scene detection script calls `core.fmtc.resample`, but the `fmtc` plugin does not provide `resample`."
        );
        assert!(
            missing_function
                .remediation()
                .contains("provides `resample`")
        );
    }

    #[test]
    fn the_engine_error_names_the_missing_plugin() {
        assert_eq!(
            missing_attribute(
                "the input could not be opened: failed to open input file (Python exception: \
                 No attribute with the name hqdn3d exists. Did you mistype a plugin namespace)"
            )
            .as_deref(),
            Some("hqdn3d")
        );
        assert_eq!(missing_attribute("Python exception: syntax error"), None);
    }

    #[test]
    fn only_the_requested_sequences_contribute_scripts() {
        let script = InputModel::VapourSynthScript {
            source: VapourSynthScriptSource::Text("clip = core.hqdn3d.Hqdn3d(clip)".to_owned()),
            variables: Default::default(),
            index: 0,
            filters: Vec::new(),
            stream_concurrently: true,
        };
        let mut config = RunnerConfig::default();
        config.parallel_encoder.input = Some(script.clone());
        let scripts = scripts_for_run(&script, &config, &["SceneDetector".to_owned()])
            .expect("the scripts are readable");
        assert_eq!(scripts.len(), 1);
        assert_eq!(scripts[0].context, "General input");

        let scripts = scripts_for_run(&script, &config, &["ParallelEncoder".to_owned()])
            .expect("the scripts are readable");
        assert!(scripts.iter().any(|script| script.context == "Encoding"));
    }

    /// The production lookup with the core replaced by the test's own answer.
    fn installed_problems_with(
        scripts: &[Script],
        exists: impl Fn(&str, Option<&str>) -> bool,
    ) -> Vec<PluginProblem> {
        problems_from(scripts, &|namespace, function| {
            Some(exists(namespace, function))
        })
    }
}
