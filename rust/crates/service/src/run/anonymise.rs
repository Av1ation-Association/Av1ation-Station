//! The pure transform behind the anonymised log export.
//!
//! Categories and placeholders follow `docs/security.md` §6: absolute paths, filenames,
//! hostnames, IP and MAC addresses, email addresses, Windows SIDs, and URLs. A value maps to
//! the same placeholder everywhere in one export, so a reader can still tell that two lines
//! mention the same file without learning which file it is.
//!
//! The preview and the saved file are produced by the same call; the endpoint returns the
//! transformed text before the user saves anything.

use std::{collections::BTreeMap, sync::LazyLock};

use av1ation_contracts::platform::LogExport;
use regex::Regex;

static EMAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b").expect("valid email pattern")
});
static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\bhttps?://[^\s"'<>]+"#).expect("valid URL pattern"));
static MAC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b").expect("valid MAC pattern")
});
static SID: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\bS-1-5-\d+(?:-\d+)+\b").expect("valid SID pattern"));
static IPV4: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b").expect("valid IPv4 pattern"));
static WINDOWS_PATH: LazyLock<Regex> = LazyLock::new(|| {
    // A path ends at whitespace: allowing spaces here would swallow the rest of a log line
    // whenever a path is followed by prose.
    Regex::new(r#"(?i)\b[A-Z]:\\(?:[^\\\s"'<>|]+\\)*[^\\\s"'<>|]+"#)
        .expect("valid Windows path pattern")
});
static UNC_PATH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\\\\[^\s"'<>|]+"#).expect("valid UNC path pattern"));
/// A Unix absolute path. The leading whitespace or delimiter is captured so it survives the
/// replacement; the regex crate has no lookbehind.
static UNIX_PATH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?m)(^|[\s"'=(])(/(?:[^\s/"'<>]+/)+[^\s"'<>)]+)"#)
        .expect("valid Unix path pattern")
});
static FILE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)\b[\w.-]+\.(?:mkv|mp4|mov|avi|webm|m4v|m2ts|ts|ivf|264|265|av1|py|vpy|wav|flac)\b",
    )
    .expect("valid filename pattern")
});

/// Replace every recognised identifier with a stable placeholder.
pub(crate) fn anonymise(text: &str) -> LogExport {
    let mut state = State::default();
    let text = replace(&EMAIL, text, "EMAIL", &mut state);
    let text = replace(&URL, &text, "URL", &mut state);
    let text = replace(&MAC, &text, "MAC", &mut state);
    let text = replace(&SID, &text, "SID", &mut state);
    let text = replace(&IPV4, &text, "IP", &mut state);
    let text = replace(&WINDOWS_PATH, &text, "PATH", &mut state);
    let text = replace(&UNC_PATH, &text, "PATH", &mut state);
    let text = replace_unix_paths(&text, &mut state);
    let text = replace(&FILE, &text, "FILE", &mut state);

    let host = host_names();
    let text = host
        .iter()
        .filter(|host| host.len() >= 3)
        .fold(text, |text, host| {
            if text.contains(host.as_str()) {
                state.remember("HOST", host);
                text.replace(host.as_str(), "<HOST>")
            } else {
                text
            }
        });

    LogExport {
        text,
        replacements: state.by_placeholder,
    }
}

#[derive(Default)]
struct State {
    /// Original value to its assigned index, per category.
    counters: BTreeMap<&'static str, BTreeMap<String, usize>>,
    /// Placeholder to the original value, for the audit view.
    by_placeholder: BTreeMap<String, String>,
}

impl State {
    fn remember(&mut self, category: &'static str, value: &str) -> String {
        if category == "HOST" {
            return "<HOST>".to_owned();
        }
        let entries = self.counters.entry(category).or_default();
        let next = entries.len() + 1;
        let index = *entries.entry(value.to_owned()).or_insert(next);
        let placeholder = format!("<{category}:{index}>");
        self.by_placeholder
            .insert(placeholder.clone(), value.to_owned());
        placeholder
    }
}

fn replace(pattern: &Regex, text: &str, category: &'static str, state: &mut State) -> String {
    pattern
        .replace_all(text, |captures: &regex::Captures<'_>| {
            state.remember(category, captures.get(0).map_or("", |value| value.as_str()))
        })
        .into_owned()
}

fn replace_unix_paths(text: &str, state: &mut State) -> String {
    UNIX_PATH
        .replace_all(text, |captures: &regex::Captures<'_>| {
            let prefix = captures.get(1).map_or("", |prefix| prefix.as_str());
            let path = captures.get(2).map_or("", |path| path.as_str());
            format!("{prefix}{}", state.remember("PATH", path))
        })
        .into_owned()
}

/// Hostnames the process knows about. A machine name in a log line identifies the operator,
/// and it appears in ffmpeg's banner and in paths outside the path rule's reach.
fn host_names() -> Vec<String> {
    ["COMPUTERNAME", "HOSTNAME", "USERDOMAIN"]
        .into_iter()
        .filter_map(|name| std::env::var(name).ok())
        .filter(|value| !value.trim().is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_category_is_replaced_with_a_stable_placeholder() {
        let export = anonymise(
            "reading C:\\Users\\ana\\Videos\\wedding2019.mkv from ana@example.com at \
             192.168.1.14 (aa:bb:cc:dd:ee:ff, S-1-5-21-1004) via https://example.com/a/b\n\
             again C:\\Users\\ana\\Videos\\wedding2019.mkv and /home/ana/clip.mkv",
        );
        let text = export.text;
        assert!(text.contains("<PATH:1>"), "{text}");
        assert!(text.contains("<EMAIL:1>"), "{text}");
        assert!(text.contains("<IP:1>"), "{text}");
        assert!(text.contains("<MAC:1>"), "{text}");
        assert!(text.contains("<SID:1>"), "{text}");
        assert!(text.contains("<URL:1>"), "{text}");
        assert_eq!(
            text.matches("<PATH:1>").count(),
            2,
            "the same path keeps one placeholder: {text}"
        );
        assert!(
            text.contains("<PATH:2>"),
            "the Unix path is separate: {text}"
        );
        assert!(!text.contains("wedding2019"), "{text}");
        assert!(!text.contains("ana@example.com"), "{text}");
        assert_eq!(
            export.replacements.get("<PATH:1>").map(String::as_str),
            Some("C:\\Users\\ana\\Videos\\wedding2019.mkv")
        );
    }

    #[test]
    fn a_bare_filename_is_redacted() {
        let export = anonymise("muxing clip.final.mkv and script.vpy");
        assert!(!export.text.contains("clip.final.mkv"), "{}", export.text);
        assert!(export.text.contains("<FILE:1>"), "{}", export.text);
        assert!(export.text.contains("<FILE:2>"), "{}", export.text);
    }

    #[test]
    fn prose_without_identifiers_is_untouched() {
        let text = "Scene Detector completed 42 of 48 scenes at 4.5 fps";
        assert_eq!(anonymise(text).text, text);
    }

    #[test]
    fn a_version_string_is_not_an_ip_address() {
        let text = "SVT-AV1 3.0.0 / FFmpeg 7.1";
        assert_eq!(anonymise(text).text, text);
    }
}
