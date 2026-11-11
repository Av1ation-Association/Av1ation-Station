use super::*;

pub(super) fn parse_help(text: &str) -> BTreeMap<ParameterKey, ParameterDescriptor> {
    let mut parameters = BTreeMap::new();
    let mut lines = text.lines().peekable();
    while let Some(raw) = lines.next() {
        if parameters.len() >= 400 {
            break;
        }
        let line = raw.trim();
        if !(line.starts_with("--") || (line.starts_with('-') && line.len() > 2)) {
            continue;
        }
        let (first_token, mut tail) = match line.split_once(char::is_whitespace) {
            Some((token, tail)) => (token, tail),
            None => (line, ""),
        };
        // Encoders print `-x, --long <value>`, `--long=<value>`, or `--long <value>`.
        // The long spelling is the canonical key when both are shown; a trailing comma
        // means the long spelling is the next word.
        let mut token = first_token;
        if !token.contains("--")
            && token.trim_end().ends_with(',')
            && let Some((next, after)) = tail.trim_start().split_once(char::is_whitespace)
            && next.starts_with("--")
        {
            token = next;
            tail = after;
        }
        let option_token = token
            .split(',')
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .find(|part| part.starts_with("--"))
            .or_else(|| token.split(',').next().map(str::trim))
            .unwrap_or_default();
        let (option, token_metavar) = match option_token.split_once('=') {
            Some((name, value)) => (
                name,
                Some(
                    value
                        .trim()
                        .trim_matches(|character| "<>[]".contains(character))
                        .to_owned(),
                ),
            ),
            None => (option_token, None),
        };
        if option.len() < 2
            || !option.starts_with('-')
            || !option
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "-_.".contains(character))
        {
            continue;
        }
        if option == "--help" || option == "--version" || option == "-h" || option == "-v" {
            continue;
        }

        let mut rest = tail.trim();
        let mut metavar = token_metavar.filter(|value| !value.is_empty());
        if metavar.is_none() {
            let after = rest.strip_prefix('=').unwrap_or(rest);
            if after.starts_with('<') || after.starts_with('[') {
                let (value, tail) = split_metavar(after);
                metavar = value;
                rest = tail;
            }
        }

        // Help wraps a long description onto indented continuation lines. Folding them into
        // the entry keeps the range and the default text that often starts on the next line.
        let mut description = rest.trim().to_owned();
        while let Some(next) = lines.peek().copied() {
            let trimmed = next.trim();
            let indented = next.starts_with("  ") || next.starts_with('\t');
            if trimmed.is_empty() || !indented || trimmed.starts_with('-') {
                break;
            }
            if !description.is_empty() {
                description.push(' ');
            }
            description.push_str(trimmed);
            lines.next();
        }
        let description = Some(description).filter(|value| !value.trim().is_empty());

        let label = option
            .trim_start_matches('-')
            .replace(['_', '.'], " ")
            .split_whitespace()
            .map(|word| {
                let mut characters = word.chars();
                match characters.next() {
                    Some(first) => first.to_uppercase().collect::<String>() + characters.as_str(),
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ");

        let (kind, delimiter, default) = match metavar {
            None => described_value(description.as_deref()),
            Some(metavar) => {
                let numeric = metavar_looks_numeric(&metavar)
                    || description.as_deref().is_some_and(description_has_range);
                if numeric {
                    if let Some((choices, chosen)) =
                        numbered_choices(description.as_deref().unwrap_or_default())
                    {
                        numbered_choice_parameter(choices, chosen)
                    } else {
                        let (min, max) = description
                            .as_deref()
                            .and_then(parse_range)
                            .unwrap_or((None, None));
                        let stated = description.as_deref().and_then(parse_stated_default);
                        let integer = !metavar.to_ascii_lowercase().contains("float")
                            && stated.as_deref().is_none_or(|value| !value.contains('.'));
                        (
                            ParameterKind::Number(NumberSpec {
                                integer,
                                min,
                                max,
                                step: None,
                                unit: None,
                            }),
                            Some(av1ation_contracts::encoder::Delimiter::Space),
                            // An unstated default stays unset: a fork must not invent a value
                            // the encoder never reported, because selecting the build sends it.
                            stated
                                .and_then(|value| value.parse::<f64>().ok())
                                .map(ParameterValue::Number),
                        )
                    }
                } else if let Some(kind) = path_kind(&metavar, description.as_deref()) {
                    (
                        kind,
                        Some(av1ation_contracts::encoder::Delimiter::Space),
                        description
                            .as_deref()
                            .and_then(parse_stated_default)
                            .filter(|value| !value.is_empty())
                            .map(ParameterValue::Text),
                    )
                } else if let Some((values, chosen)) =
                    bracket_choices(description.as_deref().unwrap_or_default())
                {
                    choice_parameter(values, chosen)
                } else {
                    (
                        ParameterKind::Text(TextSpec {
                            max_len: None,
                            pattern: None,
                            multiline: false,
                            format: text_format(&metavar, description.as_deref()),
                        }),
                        Some(av1ation_contracts::encoder::Delimiter::Space),
                        description
                            .as_deref()
                            .and_then(parse_stated_default)
                            .filter(|value| !value.is_empty())
                            .map(ParameterValue::Text),
                    )
                }
            }
        };

        // The range, stated default and bracketed enum list have become typed constraints;
        // leaving them in the prose repeats every value the control already shows.
        let description = description
            .map(|text| clean_description(&text))
            .filter(|text| !text.is_empty());

        parameters.insert(
            ParameterKey(option.to_owned()),
            ParameterDescriptor {
                delimiter,
                label,
                description,
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
    parameters
}

/// What an option whose line prints no `<metavar>` takes, judged from its prose.
///
/// SVT-AV1 is the reason this exists: it prints `--crf  Constant Rate Factor value … default
/// is 30 [1-70]`, so the only evidence that a line takes a value is the range or the stated
/// default. Reading that as a bare flag emitted `--crf` alone, which the encoder rejects.
pub(super) fn described_value(
    description: Option<&str>,
) -> (
    ParameterKind,
    Option<av1ation_contracts::encoder::Delimiter>,
    Option<ParameterValue>,
) {
    let text = description.unwrap_or_default();
    if let Some((values, chosen)) = listed_choices(text) {
        return choice_parameter(values, chosen);
    }
    if let Some((choices, chosen)) = numbered_choices(text) {
        return numbered_choice_parameter(choices, chosen);
    }
    if let Some(evidence) = numeric_evidence(text) {
        return (
            ParameterKind::Number(NumberSpec {
                integer: evidence.integer,
                min: evidence.min,
                max: evidence.max,
                step: None,
                unit: None,
            }),
            Some(av1ation_contracts::encoder::Delimiter::Space),
            evidence.default.map(ParameterValue::Number),
        );
    }
    // A bracketed list of plain names is an enumeration, not a value: `--asm` prints its
    // accepted spellings in `[c, mmx, sse, …]` and a switch would send it without a value.
    if let Some((values, chosen)) = bracket_choices(text) {
        return choice_parameter(values, chosen);
    }
    if let Some(kind) = path_kind("", Some(text)) {
        return (
            kind,
            Some(av1ation_contracts::encoder::Delimiter::Space),
            parse_stated_default(text)
                .filter(|value| !value.is_empty())
                .map(ParameterValue::Text),
        );
    }
    if reads_as_text(text) {
        return (
            ParameterKind::Text(TextSpec {
                max_len: None,
                pattern: None,
                multiline: false,
                format: text_format("", Some(text)),
            }),
            Some(av1ation_contracts::encoder::Delimiter::Space),
            parse_stated_default(text)
                .filter(|value| !value.is_empty())
                .map(ParameterValue::Text),
        );
    }
    // A line with no value evidence stays a switch, off until the user turns it on. A help
    // page lists every option, so defaulting one to on would send flags nobody chose.
    (ParameterKind::Flag, None, Some(ParameterValue::Bool(false)))
}

/// A range or a stated numeric default, the two proofs an option takes a number.
pub(super) struct NumericEvidence {
    min: Option<f64>,
    max: Option<f64>,
    default: Option<f64>,
    integer: bool,
}

pub(super) fn numeric_evidence(description: &str) -> Option<NumericEvidence> {
    let stated = parse_stated_default(description);
    let default = stated
        .as_deref()
        .and_then(|value| value.parse::<f64>().ok());
    let bracketed = bracketed_range(description);
    if default.is_none() && bracketed.is_none() {
        return None;
    }
    let (min, max, integer_range) = bracketed.unwrap_or((None, None, true));
    let integer = integer_range && stated.as_deref().is_none_or(|value| !value.contains('.'));
    Some(NumericEvidence {
        min,
        max,
        default,
        integer,
    })
}

/// The bounds a help line prints in `[...]`, and whether it printed whole numbers only.
pub(super) fn bracketed_range(description: &str) -> Option<(Option<f64>, Option<f64>, bool)> {
    let start = description.find('[')?;
    let end = description[start..].find(']')? + start;
    let inside = &description[start + 1..end];
    let integer = !inside.contains('.');
    let (min, max) = parse_range_parts(inside).or_else(|| listed_range(inside))?;
    Some((min, max, integer))
}

/// `1-70`, `0 - 63`, `-7 to 7` and `0..63`, with the sign of a negative minimum kept.
pub(super) fn parse_range_parts(inside: &str) -> Option<(Option<f64>, Option<f64>)> {
    let split = if let Some((left, right)) = inside.split_once("..") {
        (left, right)
    } else if let Some((left, right)) = inside.split_once(" to ") {
        (left, right)
    } else {
        // A hyphen inside the text (a choice list, a unit) is not a range; only a hyphen
        // between two numbers is, and the first hyphen of `-7` is its sign.
        let hyphen = inside.char_indices().skip(1).find(|(_, c)| *c == '-')?;
        (&inside[..hyphen.0], &inside[hyphen.0 + 1..])
    };
    let min = split.0.trim().parse::<f64>().ok()?;
    let max = split.1.trim().parse::<f64>().ok()?;
    Some((Some(min), Some(max)))
}

/// `0: off, 1: on, 2: adaptive` — a choice list whose keys are the accepted numbers.
pub(super) fn listed_range(inside: &str) -> Option<(Option<f64>, Option<f64>)> {
    let mut numbers = Vec::new();
    for segment in inside.split(',') {
        // A description inside the brackets may contain its own commas, so only the
        // segments that start with `number:` are keys of the list.
        let Some((head, _)) = segment.split_once(':') else {
            continue;
        };
        if let Ok(number) = head.trim().parse::<f64>() {
            numbers.push(number);
        }
    }
    // One key alone describes no bounds; a control pinned to it would be unusable.
    if numbers.len() < 2 {
        return None;
    }
    let min = numbers.iter().copied().reduce(f64::min)?;
    let max = numbers.iter().copied().reduce(f64::max)?;
    Some((Some(min), Some(max)))
}

/// `[0: off, 1: on, 2: adaptive]` — the keys are numbers, the labels are what the user
/// reads, and the encoder still receives the number. A gap in the keys means an unlisted
/// value is still valid (SVT's `--progress` documents 0 and 2 but accepts 1), so a list
/// that is not every whole number of its span stays a numeric field.
pub(super) type LabelledChoices = (Vec<(f64, String)>, Option<f64>);

pub(super) fn numbered_choices(description: &str) -> Option<LabelledChoices> {
    let start = description.find('[')?;
    let end = description[start..].find(']')? + start;
    let inside = &description[start + 1..end];
    let mut choices: Vec<(f64, String)> = Vec::new();
    for segment in inside.split(',') {
        let trimmed = segment.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some((key, label)) = numbered_label(trimmed) {
            choices.push((key, label));
        } else {
            // A label may contain its own comma, so a segment without a key continues the
            // label that preceded it.
            let last = choices.last_mut()?;
            last.1.push_str(", ");
            last.1.push_str(trimmed);
        }
    }
    if choices.len() < 2 || choices.len() > 12 {
        return None;
    }
    choices.sort_by(|left, right| left.0.total_cmp(&right.0));
    let first = choices[0].0;
    if choices.iter().enumerate().any(|(index, (key, label))| {
        key.fract() != 0.0 || *key != first + index as f64 || label.is_empty() || label.len() > 64
    }) {
        return None;
    }
    let choices: Vec<(f64, String)> = choices
        .into_iter()
        .map(|(key, label)| (key, clean_choice_label(&label)))
        .collect();
    if choices.iter().any(|(_, label)| label.is_empty()) {
        return None;
    }
    let chosen = parse_stated_default(description)
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| choices.iter().any(|(key, _)| key == value));
    Some((choices, chosen))
}

pub(super) fn numbered_label(segment: &str) -> Option<(f64, String)> {
    let (head, label) = segment.split_once(':')?;
    let key = head.trim().parse::<f64>().ok()?;
    let label = label.trim();
    (!label.is_empty()).then(|| (key, label.to_owned()))
}

/// A label is the name of the value, not a restatement of the default.
pub(super) fn clean_choice_label(label: &str) -> String {
    let mut value = label.trim().trim_end_matches(['.', ',']).to_owned();
    for suffix in [" (default)", " (the encoder's own default)"] {
        if let Some(index) = value.to_ascii_lowercase().find(suffix) {
            value.truncate(index);
        }
    }
    value.trim().trim_end_matches(['.', ',']).to_owned()
}

pub(super) fn numbered_choice_parameter(
    choices: Vec<(f64, String)>,
    chosen: Option<f64>,
) -> (
    ParameterKind,
    Option<av1ation_contracts::encoder::Delimiter>,
    Option<ParameterValue>,
) {
    (
        ParameterKind::Choice(ChoiceSpec {
            options: choices
                .into_iter()
                .map(|(value, label)| Choice {
                    value: ParameterValue::Number(value),
                    label,
                    description: None,
                    doc_link: None,
                })
                .collect(),
            value_kind: Some(av1ation_contracts::encoder::ChoiceValueKind::Number),
            multiple: false,
            min_selected: 1,
            max_selected: Some(1),
        }),
        Some(av1ation_contracts::encoder::Delimiter::Space),
        chosen.map(ParameterValue::Number),
    )
}

pub(super) fn choice_parameter(
    values: Vec<String>,
    chosen: Option<String>,
) -> (
    ParameterKind,
    Option<av1ation_contracts::encoder::Delimiter>,
    Option<ParameterValue>,
) {
    (
        ParameterKind::Choice(ChoiceSpec {
            options: values
                .into_iter()
                .map(|value| Choice {
                    value: ParameterValue::Text(value.clone()),
                    label: value,
                    description: None,
                    doc_link: None,
                })
                .collect(),
            value_kind: Some(av1ation_contracts::encoder::ChoiceValueKind::Text),
            multiple: false,
            min_selected: 1,
            max_selected: Some(1),
        }),
        Some(av1ation_contracts::encoder::Delimiter::Space),
        chosen.map(ParameterValue::Text),
    )
}

/// `Available speeds are: slower, slow, medium, fast, faster. Default is slow.`
pub(super) fn listed_choices(description: &str) -> Option<(Vec<String>, Option<String>)> {
    let lowered = description.to_ascii_lowercase();
    let marker = lowered.find(" are: ")?;
    let list = &description[marker + " are: ".len()..];
    let end = list.find('.').unwrap_or(list.len());
    let values: Vec<String> = list[..end]
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= 24)
        .map(str::to_owned)
        .collect();
    if values.len() < 2 {
        return None;
    }
    let chosen = parse_stated_default(description).filter(|candidate| {
        values
            .iter()
            .any(|value| value.eq_ignore_ascii_case(candidate))
    });
    Some((values, chosen))
}

/// A bracketed list of bare names, the shape SVT-AV1 forks use for an enumeration:
/// `default is max [c, mmx, sse, sse2]`. A numeric range or a keyed `0: off` list is not
/// this, and prose with punctuation in a value is left alone rather than guessed at.
pub(super) fn bracket_choices(description: &str) -> Option<(Vec<String>, Option<String>)> {
    let start = description.find('[')?;
    let end = description[start..].find(']')? + start;
    let inside = &description[start + 1..end];
    if inside.contains(':') || inside.len() > 240 {
        return None;
    }
    let mut values = Vec::new();
    for segment in inside.split(',') {
        // `'vertical'/'left'` spells two accepted names for the same value; both are valid
        // command-line spellings, so both are offered. A slash in unquoted text is a path,
        // not an alternative, and stays out of the choice list.
        let start = segment.trim_start();
        let quoted = start.starts_with('\'') || start.starts_with('"');
        let alternatives = if quoted {
            segment.split('/').collect::<Vec<_>>()
        } else {
            vec![segment]
        };
        for alternative in alternatives {
            let value = alternative.trim().trim_matches(['\'', '"', '`']);
            if value.is_empty()
                || value.len() > 24
                || value.contains(char::is_whitespace)
                || value.contains('/')
                || value.parse::<f64>().is_ok()
            {
                return None;
            }
            if !values.contains(&value.to_owned()) {
                values.push(value.to_owned());
            }
        }
    }
    if values.len() < 2 {
        return None;
    }
    let chosen = parse_stated_default(description).filter(|candidate| {
        values
            .iter()
            .any(|value| value.eq_ignore_ascii_case(candidate))
    });
    Some((values, chosen))
}

/// Remove the metadata a typed control already carries: `default is 4 [1-13]` and a
/// trailing `[c, mmx, sse]` belong to the control, not the sentence a user reads.
pub(super) fn clean_description(text: &str) -> String {
    let trimmed = text.trim();
    let lowered = trimmed.to_ascii_lowercase();
    if let Some(index) = lowered.rfind("default")
        && trimmed[index..].contains('[')
    {
        let before = trimmed[..index]
            .trim()
            .trim_end_matches([',', ';'])
            .trim_end();
        if before.len() >= 8 {
            return before.to_owned();
        }
    }
    if trimmed.ends_with(']')
        && let Some(index) = trimmed.rfind('[')
    {
        let before = trimmed[..index]
            .trim()
            .trim_end_matches([',', ';'])
            .trim_end();
        if before.len() >= 8 {
            return before.to_owned();
        }
    }
    trimmed.to_owned()
}

/// A metavariable or prose that proves an option takes a file or directory path.
///
/// `--config <file>` and `Path to the configuration file` are direct evidence. A bare
/// `format` is not: it is a value, but not necessarily a path, so that case stays text.
pub(super) fn path_kind(metavar: &str, description: Option<&str>) -> Option<ParameterKind> {
    let metavar = metavar
        .to_ascii_lowercase()
        .replace(['_', '-'], " ")
        .trim()
        .to_owned();
    let text = description.unwrap_or_default().to_ascii_lowercase();
    let meta_file = [
        "file",
        "filename",
        "filepath",
        "file path",
        "path",
        "input file",
        "output file",
    ]
    .contains(&metavar.as_str());
    let meta_dir =
        ["dir", "directory", "folder", "dir path", "folder path"].contains(&metavar.as_str());
    let prose_file = [
        "path to ",
        "file path",
        "filename",
        "file name",
        "config file",
        "configuration file",
        "input file",
        "output file",
        "model file",
        "table path",
    ]
    .iter()
    .any(|hint| text.contains(hint));
    let prose_dir = text.contains("directory") || text.contains("folder");
    if !(meta_file || meta_dir || prose_file || prose_dir) {
        return None;
    }
    Some(ParameterKind::Path(PathSpec {
        directory: meta_dir || prose_dir,
        accept: Vec::new(),
    }))
}

/// The value shape a text option states, for the editor's own validation.
pub(super) fn text_format(metavar: &str, description: Option<&str>) -> Option<TextFormat> {
    let text = format!(
        "{} {}",
        metavar.to_ascii_lowercase(),
        description.unwrap_or_default().to_ascii_lowercase()
    );
    if text.contains("email") || text.contains("e-mail") {
        return Some(TextFormat::Email);
    }
    if text.contains("url")
        || text.contains("uri")
        || text.contains("link")
        || text.contains("endpoint")
    {
        return Some(TextFormat::Url);
    }
    if text.contains("iso 8601")
        || text.contains("iso-8601")
        || text.contains("datetime")
        || text.contains("date-time")
        || text.contains("timestamp")
    {
        return Some(TextFormat::DateTime);
    }
    None
}

/// Whether the prose names a value a switch cannot carry: a file, a path, a format.
pub(super) fn reads_as_text(description: &str) -> bool {
    let lowered = description.to_ascii_lowercase();
    [
        "path",
        "file",
        "format",
        "comma-separated",
        "comma separated",
        "separated by",
        "in a list",
        "list of",
    ]
    .iter()
    .any(|hint| lowered.contains(hint))
}

/// The value a help line states after `default`, when it states one.
pub(super) fn parse_stated_default(description: &str) -> Option<String> {
    let lowered = description.to_ascii_lowercase();
    let start = lowered.find("default")? + "default".len();
    // Encoders state the value as `default 25`, `default: 3`, or — SVT-AV1 — `default is 30`.
    let value = description[start..].trim_start_matches([' ', ':', '=']);
    let value = match value.strip_prefix("is ") {
        Some(rest) => rest.trim_start(),
        None => value,
    };
    let token = value
        .split(|character: char| character.is_whitespace() || ",;".contains(character))
        .next()?
        .trim_matches(|character: char| "'\"().[]".contains(character));
    // "default is no zones" states that the option is empty, not that its value is `no`.
    let absent = ["no", "none", "not", "unset", "disabled", "automatic"];
    if token.is_empty()
        || token.eq_ignore_ascii_case("value")
        || absent.iter().any(|word| token.eq_ignore_ascii_case(word))
    {
        None
    } else {
        Some(token.to_owned())
    }
}

pub(super) fn split_metavar(text: &str) -> (Option<String>, &str) {
    let trimmed = text.trim_start();
    if let Some(rest) = trimmed.strip_prefix('<')
        && let Some((value, tail)) = rest.split_once('>')
    {
        return (Some(value.trim().to_owned()), tail);
    }
    if let Some(rest) = trimmed.strip_prefix('[')
        && let Some((value, tail)) = rest.split_once(']')
    {
        return (Some(value.trim().to_owned()), tail);
    }
    let first = trimmed
        .find(char::is_whitespace)
        .map(|index| &trimmed[..index])
        .unwrap_or(trimmed);
    (
        Some(first.trim().to_owned()).filter(|value| !value.is_empty()),
        &trimmed[first.len()..],
    )
}

pub(super) fn metavar_looks_numeric(metavar: &str) -> bool {
    let lower = metavar.to_ascii_lowercase();
    [
        "int", "num", "crf", "qp", "quality", "value", "range", "level", "threads", "bitrate",
    ]
    .iter()
    .any(|hint| lower.contains(hint))
}

pub(super) fn description_has_range(description: &str) -> bool {
    parse_range(description).is_some()
}

/// Accept the shapes encoder help commonly uses: `[0 - 63]`, `(0..63)`, `[-7 to 7]`.
pub(super) fn parse_range(description: &str) -> Option<(Option<f64>, Option<f64>)> {
    let start = description.find('[').or_else(|| description.find('('))?;
    let end = description[start..]
        .find(']')
        .or_else(|| description[start..].find(')'))?;
    parse_range_parts(&description[start + 1..start + end])
}

pub(super) fn truncate(text: &str) -> String {
    if text.len() <= HELP_LIMIT {
        return text.to_owned();
    }
    let mut end = HELP_LIMIT;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n… help truncated", &text[..end])
}
