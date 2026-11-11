//! VapourSynth plugin checks for a stored configuration.
//!
//! A video's preflight projects the machine's plugin table onto the scripts its full
//! pipeline would open. A project or template can be checked before a video exists, so a
//! broken script is reported on the page that owns it rather than at Start. Both paths run
//! the same engine scan and return the same structured rows; only the document that supplies
//! the scripts differs.

use av1ation_contracts::protocol::InputKind;
use av1ation_contracts::script::{ScriptInputMode, ScriptPluginReport, VapourSynthPluginProblem};
use av1ation_contracts::settings::GeneralDefaults;
use av1ation_engine::script::plugins as script_plugins;
use serde_json::Value;

use crate::{project::derive, state::AppState};

/// One script scan, in both the contract shape and the engine's prose.
///
/// The row form is what the page renders; the sentence is what the service returns as a
/// run blocker, where there is no page to lay the rows out on. Building both while the
/// engine types are still available avoids a second parse merely to phrase the error.
pub(crate) struct PluginScan {
    pub report: ScriptPluginReport,
    pub blocker: Option<String>,
}

impl PluginScan {
    fn empty() -> Self {
        Self {
            report: ScriptPluginReport::default(),
            blocker: None,
        }
    }
}

/// Scan a video's full pipeline input and sequence configuration.
pub(crate) async fn scan(
    state: &AppState,
    input: Value,
    sequence_config: Value,
    sequences: Vec<String>,
) -> PluginScan {
    let lookup = state.plugin_lookup();
    let result = tokio::task::spawn_blocking(move || match lookup {
        Some(lookup) => script_plugins::missing_plugins_with_lookup(
            &input,
            &sequence_config,
            &sequences,
            lookup.as_ref(),
        ),
        None => script_plugins::missing_plugins(&input, &sequence_config, &sequences),
    })
    .await;

    match result {
        Ok(Ok(problems)) => {
            let blocker =
                (!problems.is_empty()).then(|| script_plugins::problems_message(&problems));
            let report = ScriptPluginReport {
                problems: problems.into_iter().map(contract_problem).collect(),
                error: None,
            };
            PluginScan { report, blocker }
        }
        Ok(Err(message)) => PluginScan {
            report: ScriptPluginReport {
                problems: Vec::new(),
                error: Some(format!(
                    "The VapourSynth scripts could not be checked: {message}"
                )),
            },
            blocker: None,
        },
        Err(error) => {
            tracing::error!(%error, "the VapourSynth script scan did not finish");
            PluginScan {
                report: ScriptPluginReport {
                    problems: Vec::new(),
                    error: Some(
                        "The VapourSynth scripts could not be checked before this request."
                            .to_owned(),
                    ),
                },
                blocker: None,
            }
        }
    }
}

/// Scan a project or template document together with its General input policy.
///
/// The engine document does not carry General's input: General is the project-wide decode
/// policy, while the engine document only carries sequence overrides. The synthetic input
/// below is what a video added from these defaults would start with, which is exactly the
/// document the queue would scan later.
pub(crate) async fn scan_config(
    state: &AppState,
    general: Option<&GeneralDefaults>,
    config: &Value,
) -> PluginScan {
    let Some(sequences) = config.get("sequences").cloned() else {
        return PluginScan::empty();
    };
    let input = general
        .and_then(general_input)
        .unwrap_or_else(neutral_input);
    let chain = derive::chain_for(config)
        .into_iter()
        .map(|(id, _)| id.to_owned())
        .collect();
    scan(state, input, sequences, chain).await
}

/// The engine input a General defaults document describes, when it names a script.
fn general_input(general: &GeneralDefaults) -> Option<Value> {
    if general.input_kind != InputKind::VapourSynthScript {
        return None;
    }
    match general.script_mode.unwrap_or(ScriptInputMode::File) {
        ScriptInputMode::File => general
            .script
            .as_deref()
            .filter(|script| !script.trim().is_empty())
            .map(|script| {
                av1ation_engine::media::video::vapoursynth_script_input(script, &general.variables)
            }),
        ScriptInputMode::Text => general
            .script_text
            .as_deref()
            .filter(|script| !script.trim().is_empty())
            .map(|text| {
                av1ation_engine::media::video::vapoursynth_script_text_input(
                    text,
                    &general.variables,
                )
            }),
    }
}

/// A parsed input that contributes no script.
///
/// The engine scan begins by parsing the run's input, so an absent General script still
/// needs a valid native document. Nothing opens this path; only sequence overrides are then
/// inspected.
fn neutral_input() -> Value {
    av1ation_engine::media::video::native_input_with("source.mkv", None, &[]).unwrap_or(Value::Null)
}

fn contract_problem(problem: script_plugins::PluginProblem) -> VapourSynthPluginProblem {
    let detail = problem.detail();
    let remediation = problem.remediation();
    VapourSynthPluginProblem {
        context: problem.context,
        namespace: problem.namespace,
        function: problem.function,
        detail,
        remediation,
    }
}
