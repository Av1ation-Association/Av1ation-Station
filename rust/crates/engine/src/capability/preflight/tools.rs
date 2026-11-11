//! Encoder and muxer executable families, and the probe rows they replace.

use super::*;
use crate::platform::hide_console;

/// A user-selectable executable family. The family decides which command is run to
/// identify the program, which capability it provides, and which inventory row it replaces.
///
/// There is one family per `EncoderBase` the engine can drive, plus the two muxing
/// programs the pipeline shells out to. FFmpeg is both an `EncoderBase` and a muxing row;
/// mkvmerge is only an external executable. `ALL` and `ENCODER_BASES` are checked against
/// each other by a test, so an engine bump that adds an encoder fails the build instead of
/// silently leaving a hole in the dependency screen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolFamily {
    Aom,
    SvtAv1,
    Rav1e,
    Vpx,
    Avm,
    X264,
    X265,
    VVenC,
    Ffmpeg,
    MkvMerge,
}

impl ToolFamily {
    /// Every family the dependency screen can interrogate, in the engine's inventory order.
    pub const ALL: [Self; 10] = [
        Self::Aom,
        Self::SvtAv1,
        Self::Rav1e,
        Self::Vpx,
        Self::Avm,
        Self::X264,
        Self::X265,
        Self::VVenC,
        Self::Ffmpeg,
        Self::MkvMerge,
    ];

    /// Parse the wire value used by `POST /api/preflight/custom`, which is the engine's own
    /// `EncoderBase` name (or `ffmpeg`), so a saved path and an inventory row agree.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "aom" => Some(Self::Aom),
            "svt-av1" => Some(Self::SvtAv1),
            "rav1e" => Some(Self::Rav1e),
            "vpx" => Some(Self::Vpx),
            "avm" => Some(Self::Avm),
            "x264" => Some(Self::X264),
            "x265" => Some(Self::X265),
            "vvenc" => Some(Self::VVenC),
            "ffmpeg" => Some(Self::Ffmpeg),
            "mkvmerge" => Some(Self::MkvMerge),
            _ => None,
        }
    }

    /// Stable wire and custom-inventory key.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Aom => "aom",
            Self::SvtAv1 => "svt-av1",
            Self::Rav1e => "rav1e",
            Self::Vpx => "vpx",
            Self::Avm => "avm",
            Self::X264 => "x264",
            Self::X265 => "x265",
            Self::VVenC => "vvenc",
            Self::Ffmpeg => "ffmpeg",
            Self::MkvMerge => "mkvmerge",
        }
    }

    /// Human-readable family name for the row label.
    pub fn label(self) -> &'static str {
        match self {
            Self::Aom => "aomenc",
            Self::SvtAv1 => "SVT-AV1",
            Self::Rav1e => "rav1e",
            Self::Vpx => "vpxenc",
            Self::Avm => "avmenc",
            Self::X264 => "x264",
            Self::X265 => "x265",
            Self::VVenC => "vvencapp",
            Self::Ffmpeg => "FFmpeg",
            Self::MkvMerge => "MKVToolNix",
        }
    }

    /// The executable name users are told to install when this family is absent.
    pub fn executable_name(self) -> &'static str {
        match self {
            Self::Aom => "aomenc",
            Self::SvtAv1 => "SvtAv1EncApp",
            Self::Rav1e => "rav1e",
            Self::Vpx => "vpxenc",
            Self::Avm => "avmenc",
            Self::X264 => "x264",
            Self::X265 => "x265",
            Self::VVenC => "vvencapp",
            Self::Ffmpeg => "ffmpeg",
            Self::MkvMerge => "mkvmerge",
        }
    }

    /// The capability this family provides. Custom FFmpeg and mkvmerge satisfy muxing, not
    /// encode; a user can point either one at another build without touching an encoder.
    pub fn capability(self) -> Capability {
        match self {
            Self::Ffmpeg | Self::MkvMerge => Capability::Muxing,
            _ => Capability::Encode,
        }
    }

    /// The built-in inventory row this custom program replaces when it is accepted.
    pub fn target_id(self) -> String {
        match self {
            // FFmpeg and mkvmerge replace their own muxing rows, not `encoder:` rows. FFmpeg
            // is also an `EncoderBase`, so it must be decided before the encoder branch.
            Self::Ffmpeg | Self::MkvMerge => self.as_str().to_owned(),
            _ => self
                .encoder_base()
                .map_or_else(|| self.as_str().to_owned(), encoder_id),
        }
    }

    /// The engine encoder this family's executable drives, if the family is an encoder.
    fn encoder_base(self) -> Option<EncoderBase> {
        match self {
            Self::Aom => Some(EncoderBase::AOM),
            Self::SvtAv1 => Some(EncoderBase::SVTAV1),
            Self::Rav1e => Some(EncoderBase::RAV1E),
            Self::Vpx => Some(EncoderBase::VPX),
            Self::Avm => Some(EncoderBase::AVM),
            Self::X264 => Some(EncoderBase::X264),
            Self::X265 => Some(EncoderBase::X265),
            Self::VVenC => Some(EncoderBase::VVenC),
            Self::Ffmpeg => Some(EncoderBase::FFmpeg),
            Self::MkvMerge => None,
        }
    }

    /// The flag that makes the program identify itself. `--help` is used where the encoder
    /// has no version flag: avmenc rejects `--version`, and vvencapp's help names the tool.
    fn version_args(self) -> &'static [&'static str] {
        match self {
            Self::Ffmpeg => &["-version"],
            Self::Aom | Self::Vpx | Self::Avm | Self::VVenC => &["--help"],
            _ => &["--version"],
        }
    }

    /// The stamp that proves the program is this family and not a sibling: aomenc's help
    /// names AV1 while avmenc's names AV2, so the AV1 stamp must be specific.
    pub(super) fn matches(self, text: &str) -> bool {
        let text = text.to_ascii_lowercase();
        match self {
            Self::Aom => text.contains("aomedia project av1") || text.contains("aomenc"),
            Self::SvtAv1 => text.contains("svt-av1") || text.contains("svtav1encapp"),
            Self::Rav1e => text.contains("rav1e"),
            Self::Vpx => text.contains("vp8/vp9") || text.contains("vpxenc"),
            Self::Avm => text.contains("aomedia project av2") || text.contains("avmenc"),
            Self::X264 => text.contains("x264"),
            Self::X265 => text.contains("x265"),
            Self::VVenC => text.contains("vvenc"),
            Self::Ffmpeg => text.contains("ffmpeg version"),
            Self::MkvMerge => text.contains("mkvmerge"),
        }
    }
}

pub(super) fn encoder_id(base: EncoderBase) -> String {
    format!("encoder:{base}")
}

/// Interrogate a user-selected executable and return the row the dependency screen shows.
///
/// The program runs with its family's version flag only, never project media or encode
/// arguments, and a program that does not answer within the timeout is killed rather than
/// left running behind the service.
///
/// The row keeps a `custom:` id even when it replaces a built-in row, so removing it can
/// restore the detected row without a separate bookkeeping table.
pub fn probe_tool(family: ToolFamily, executable: &Path) -> Probe {
    let id = format!("custom:{}", family.as_str());
    let label = format!("{} (custom)", family.label());
    let capability = family.capability();
    let remediation = format!(
        "Choose the {} executable, or install `{}` and put it on PATH.",
        family.label(),
        family.executable_name()
    );

    let output = match run_version(executable, family.version_args()) {
        Ok(output) => output,
        Err(detail) => return Probe::missing(&id, &label, capability, detail, &remediation),
    };

    let detail = first_output_line(&output);
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if !output.status.success() {
        return Probe::missing(
            &id,
            &label,
            capability,
            format!("{} exited with {}", executable.display(), output.status),
            &remediation,
        );
    }
    if !family.matches(&text) {
        let reason = if detail.is_empty() {
            "it produced no version output".to_owned()
        } else {
            format!("it reported `{detail}`")
        };
        return Probe::missing(
            &id,
            &label,
            capability,
            format!("it does not identify as {}: {reason}", family.label()),
            &remediation,
        );
    }

    Probe::found(
        &id,
        &label,
        capability,
        format!("{} · {detail}", executable.display()),
    )
}

/// Probe a user-supplied executable with the same command path as the built-in tools.
///
/// The caller supplies the executable and its version arguments; an HTTP request can
/// choose a path and a family, but never arbitrary argv. Only the probe arguments run
/// here, never project media or encode arguments.
pub fn probe_executable(
    id: &str,
    label: &str,
    capability: Capability,
    executable: &Path,
    args: &[&str],
    remediation: &str,
) -> Probe {
    let display = executable.display();
    let output = match run_version(executable, args) {
        Ok(output) => output,
        Err(detail) => return Probe::missing(id, label, capability, detail, remediation),
    };

    if !output.status.success() {
        return Probe::missing(
            id,
            label,
            capability,
            format!("{display} exited with {}", output.status),
            remediation,
        );
    }

    let detail = first_output_line(&output);
    let detail = if detail.is_empty() {
        format!("{display} responds")
    } else {
        detail
    };
    Probe::found(id, label, capability, detail)
}

pub(super) const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

pub(super) fn run_version(executable: &Path, args: &[&str]) -> Result<Output, String> {
    let mut process = Command::new(executable);
    process
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console(&mut process);

    let mut child = process
        .spawn()
        .map_err(|error| format!("{}: {error}", executable.display()))?;
    let deadline = Instant::now() + PROBE_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child
                    .wait_with_output()
                    .map_err(|error| format!("{}: {error}", executable.display()));
            }
            Ok(None) if Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(20));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait_with_output();
                return Err(format!(
                    "{} did not answer within {} seconds",
                    executable.display(),
                    PROBE_TIMEOUT.as_secs()
                ));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("{}: {error}", executable.display()));
            }
        }
    }
}

pub(super) fn first_output_line(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .chain(String::from_utf8_lossy(&output.stderr).lines())
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_owned)
        .unwrap_or_default()
}

/// The engine's encoders, in inventory order. Both the built-in probes and the custom
/// families are derived from this list, so a new engine encoder cannot appear in one and
/// be missing from the other.
pub(super) const ENCODER_BASES: [EncoderBase; 9] = [
    EncoderBase::AOM,
    EncoderBase::SVTAV1,
    EncoderBase::RAV1E,
    EncoderBase::VPX,
    EncoderBase::AVM,
    EncoderBase::X264,
    EncoderBase::X265,
    EncoderBase::VVenC,
    EncoderBase::FFmpeg,
];

/// Probe each engine encoder once through its own executable and validation.
pub(super) fn encoders() -> impl Iterator<Item = Probe> {
    ENCODER_BASES.into_iter().map(|base| {
        let encoder = Encoder::default_from_base(&base, true);
        let executable = encoder.executable();
        let id = format!("encoder:{base}");
        let label = base.friendly_name();
        if encoder.validate().is_ok() {
            Probe::found(&id, label, Capability::Encode, format!("{executable} on PATH"))
        } else {
            Probe::missing(
                &id,
                label,
                Capability::Encode,
                format!("{executable} not found on PATH"),
                &format!("Install `{executable}` and put it on PATH, or add a custom encoder executable in Settings."),
            )
        }
    })
}
