//! Generated media and scratch directories for tests.
//!
//! No test reads a committed clip or assumes one exists on the machine. Each test asks
//! FFmpeg for a fresh file inside a [`Scratch`], so the input cannot leak between tests,
//! survive a panic, or drift from what the generator says it produced.
//!
//! The two clip constructors differ in one way that matters: [`Clip::testsrc`] is lossless
//! (FFV1) and [`Clip::testsrc_with_keyframes`] carries a forced GOP (mpeg4). FFV1 is
//! intra-only, so a keyframe interval cannot be expressed with it, and mpeg4 is lossy, so a
//! test that compares pictures should not use it. Both encoders are native to every FFmpeg
//! build, including the LGPL bundle the application ships.

use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::OnceLock,
};

use tempfile::TempDir;

/// The FFmpeg executable these tests run.
///
/// `AV1ATION_FFMPEG` wins so a specific build can be exercised; otherwise `ffmpeg` from
/// `PATH`. The application's own inventory is deliberately not consulted, because a test
/// that read saved settings would pass or fail with the developer's configuration.
pub fn ffmpeg() -> &'static str {
    static RESOLVED: OnceLock<String> = OnceLock::new();
    RESOLVED.get_or_init(|| {
        let candidate = std::env::var("AV1ATION_FFMPEG").unwrap_or_else(|_| "ffmpeg".to_owned());
        let Ok(probe) = Command::new(&candidate).arg("-version").output() else {
            panic!(
                "cannot run `{candidate}`: set AV1ATION_FFMPEG or put ffmpeg on PATH. \
                 These tests generate their own clips."
            );
        };
        assert!(
            probe.status.success(),
            "`{candidate} -version` failed: set AV1ATION_FFMPEG or put ffmpeg on PATH"
        );
        if let Some(line) = String::from_utf8_lossy(&probe.stdout).lines().next() {
            println!("ffmpeg: {line}");
        }
        candidate
    })
}

/// A per-test temporary directory.
///
/// Dropping it removes the directory, including when the test panics, so a failed run
/// leaves no clip behind for the next one to reuse.
pub struct Scratch {
    directory: TempDir,
}

impl Scratch {
    /// Creates a directory whose name carries `prefix`, so a leaked path still says which
    /// test produced it.
    pub fn new(prefix: &str) -> Self {
        let directory = tempfile::Builder::new()
            .prefix(prefix)
            .tempdir()
            .unwrap_or_else(|error| panic!("could not create a scratch directory: {error}"));
        Self { directory }
    }

    /// The directory itself, for a function that takes a root rather than a file.
    pub fn path(&self) -> &Path {
        self.directory.path()
    }

    /// A path inside the directory, without creating anything.
    pub fn join(&self, name: &str) -> PathBuf {
        self.directory.path().join(name)
    }
}

/// A generated video file and the shape the generator produced.
///
/// `frames` and `fps` are part of the value because callers must not restate them: a
/// hardcoded frame index would silently describe a different clip the moment the duration
/// changed.
pub struct Clip {
    path: PathBuf,
    frames: u32,
    fps: u32,
    width: u32,
    height: u32,
}

impl Clip {
    /// A moving `testsrc` pattern, losslessly encoded with FFV1.
    ///
    /// Lossless matters: the encode tests compare their output against this file, and a
    /// lossy source would put generation loss inside an assertion about the encoder.
    pub fn testsrc(directory: &Path, width: u32, height: u32, fps: u32, seconds: u32) -> Self {
        let input = vec![
            "-f".to_owned(),
            "lavfi".to_owned(),
            "-i".to_owned(),
            format!("testsrc=size={width}x{height}:rate={fps}:duration={seconds}"),
        ];
        let codec = vec![
            "-c:v".to_owned(),
            "ffv1".to_owned(),
            "-pix_fmt".to_owned(),
            "yuv420p".to_owned(),
        ];
        Self::render(directory, width, height, fps * seconds, fps, input, codec)
    }

    /// The same pattern at 10-bit, losslessly encoded.
    ///
    /// The engine's native input converts every source to 10-bit. A native 10-bit fixture
    /// makes that conversion a no-op, so a preview test compares encoder samples instead of
    /// comparing two different depths of the same picture.
    pub fn testsrc_ten_bit(
        directory: &Path,
        width: u32,
        height: u32,
        fps: u32,
        seconds: u32,
    ) -> Self {
        let input = vec![
            "-f".to_owned(),
            "lavfi".to_owned(),
            "-i".to_owned(),
            format!("testsrc=size={width}x{height}:rate={fps}:duration={seconds}"),
        ];
        let codec = vec![
            "-c:v".to_owned(),
            "ffv1".to_owned(),
            "-pix_fmt".to_owned(),
            "yuv420p10le".to_owned(),
        ];
        Self::render(directory, width, height, fps * seconds, fps, input, codec)
    }

    /// The same pattern with a forced keyframe interval.
    ///
    /// FFV1 is intra-only and cannot express a GOP, so this uses the native `mpeg4`
    /// encoder. Nothing here may require `libx264`: it is GPL, and the bundle the
    /// application ships is an LGPL build.
    pub fn testsrc_with_keyframes(
        directory: &Path,
        width: u32,
        height: u32,
        fps: u32,
        seconds: u32,
        gop: u32,
    ) -> Self {
        let input = vec![
            "-f".to_owned(),
            "lavfi".to_owned(),
            "-i".to_owned(),
            format!("testsrc=size={width}x{height}:rate={fps}:duration={seconds}"),
        ];
        let codec = vec![
            "-c:v".to_owned(),
            "mpeg4".to_owned(),
            "-q:v".to_owned(),
            "2".to_owned(),
            "-g".to_owned(),
            gop.to_string(),
            "-pix_fmt".to_owned(),
            "yuv420p".to_owned(),
        ];
        Self::render(directory, width, height, fps * seconds, fps, input, codec)
    }

    /// Solid colours joined by hard cuts, losslessly encoded.
    ///
    /// Scene detection needs an unambiguous boundary, which two neighbouring solid colours
    /// give it without depending on a threshold.
    pub fn colour_scenes(
        directory: &Path,
        colours: &[&str],
        width: u32,
        height: u32,
        fps: u32,
        seconds: u32,
    ) -> Self {
        assert!(
            !colours.is_empty(),
            "a colour sequence needs at least one scene"
        );
        let mut input = Vec::with_capacity(colours.len() * 4 + 2);
        for colour in colours {
            input.push("-f".to_owned());
            input.push("lavfi".to_owned());
            input.push("-i".to_owned());
            input.push(format!(
                "color=c={colour}:s={width}x{height}:rate={fps}:duration={seconds}"
            ));
        }
        let streams: String = (0..colours.len())
            .map(|index| format!("[{index}:v]"))
            .collect();
        input.push("-filter_complex".to_owned());
        input.push(format!(
            "{streams}concat=n={}:v=1:a=0,format=yuv420p",
            colours.len()
        ));
        let codec = vec![
            "-c:v".to_owned(),
            "ffv1".to_owned(),
            "-pix_fmt".to_owned(),
            "yuv420p".to_owned(),
        ];
        let frames = fps * seconds * u32::try_from(colours.len()).expect("a short colour list");
        Self::render(directory, width, height, frames, fps, input, codec)
    }

    fn render(
        directory: &Path,
        width: u32,
        height: u32,
        frames: u32,
        fps: u32,
        input: Vec<String>,
        codec: Vec<String>,
    ) -> Self {
        std::fs::create_dir_all(directory)
            .unwrap_or_else(|error| panic!("could not create {}: {error}", directory.display()));
        let path = directory.join("source.mkv");
        let output = Command::new(ffmpeg())
            .args(["-hide_banner", "-loglevel", "error", "-y"])
            .args(&input)
            .args(&codec)
            .arg(&path)
            .output()
            .unwrap_or_else(|error| panic!("could not run ffmpeg: {error}"));
        assert!(
            output.status.success(),
            "ffmpeg could not generate {}: {}",
            path.display(),
            String::from_utf8_lossy(&output.stderr)
        );
        Self {
            path,
            frames,
            fps,
            width,
            height,
        }
    }

    /// The file itself.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// How many frames the generated file contains.
    pub fn frames(&self) -> u32 {
        self.frames
    }

    /// Frames per second the file was generated at.
    pub fn fps(&self) -> u32 {
        self.fps
    }

    /// The pixel width the file was generated at.
    pub fn width(&self) -> u32 {
        self.width
    }

    /// The pixel height the file was generated at.
    pub fn height(&self) -> u32 {
        self.height
    }

    /// The frame at `seconds`, clamped to the last frame.
    ///
    /// A test names a moment in the clip; deriving the index here keeps the number in one
    /// place when the duration or rate changes.
    pub fn frame_at(&self, seconds: f64) -> u32 {
        let frame = (seconds * f64::from(self.fps)).round() as u32;
        frame.min(self.frames.saturating_sub(1))
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::Clip;

    fn clip(frames: u32, fps: u32) -> Clip {
        Clip {
            path: PathBuf::from("unused"),
            frames,
            fps,
            width: 320,
            height: 240,
        }
    }

    #[test]
    fn a_frame_index_never_leaves_the_clip() {
        let clip = clip(48, 24);
        assert_eq!(clip.frame_at(0.5), 12);
        assert_eq!(clip.frame_at(1.5), 36);
        assert_eq!(clip.frame_at(10.0), 47);
    }
}
