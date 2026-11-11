//! Free space for the two directories an encode writes to.
//!
//! The output and the scene chunks are on different volumes often enough that a single
//! process-wide number would be wrong. Each path is resolved to the nearest existing
//! ancestor and then to the filesystem mount that owns it, so a not-yet-created scratch
//! directory still reports the space of the volume it will live on.
//!
//! The threshold is deliberately a floor, not an estimate: a video's encoded size depends
//! on the encoder and quality, and a large source must not be refused just because its
//! output might be a fraction of its size. The service refuses below [`REQUIRED_BYTES`] and
//! warns below [`WARN_BYTES`]. An unreportable volume is a warning, never a false refusal.

use std::path::{Path, PathBuf};

use sysinfo::Disks;

/// The minimum free space an encode needs on both the scratch and output volumes.
pub(crate) const REQUIRED_BYTES: u64 = 512 * 1024 * 1024;

/// Below this, the UI shows a warning but the encode is still allowed to start.
pub(crate) const WARN_BYTES: u64 = 2 * 1024 * 1024 * 1024;

/// A source of free-space readings. The system implementation reads the mounted volumes;
/// tests replace it with a fixed number so a `507` path is deterministic.
#[derive(Debug, Clone, Default)]
pub(crate) struct DiskProbe {
    fixed: Option<u64>,
}

impl DiskProbe {
    /// Read the real filesystem.
    pub(crate) fn system() -> Self {
        Self { fixed: None }
    }

    /// Report one value for every path, for tests and diagnostic hosts.
    pub(crate) fn fixed(bytes: u64) -> Self {
        Self { fixed: Some(bytes) }
    }

    /// Free bytes on the volume that owns `path`, or `None` when the volume cannot be
    /// resolved. The path itself need not exist.
    pub(crate) fn available(&self, path: &Path) -> Option<u64> {
        if let Some(bytes) = self.fixed {
            return Some(bytes);
        }
        self.probe_disk(path).map(|(free, _)| free)
    }

    /// Total capacity of the volume that owns `path`, so Storage can draw the used portion
    /// of the bar rather than only the free number.
    pub(crate) fn capacity(&self, path: &Path) -> Option<u64> {
        self.probe_disk(path).map(|(_, total)| total)
    }

    fn probe_disk(&self, path: &Path) -> Option<(u64, u64)> {
        let target = nearest_existing(path);
        let target = target.canonicalize().unwrap_or(target);
        let target = target.to_string_lossy().to_lowercase();
        // `canonicalize` returns a verbatim path on Windows (`\\?\C:\...`); the mount
        // points are reported without that prefix.
        let target = target.strip_prefix(r"\\?\").unwrap_or(&target);

        let disks = Disks::new_with_refreshed_list();
        disks
            .list()
            .iter()
            .filter(|disk| {
                let mount = disk.mount_point().to_string_lossy().to_lowercase();
                !mount.is_empty() && target.starts_with(&mount)
            })
            .max_by_key(|disk| disk.mount_point().as_os_str().len())
            .map(|disk| (disk.available_space(), disk.total_space()))
    }
}

/// The two free-space readings for one video, plus any advisory warnings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SpaceCheck {
    pub(crate) temp_free: Option<u64>,
    pub(crate) output_free: Option<u64>,
    pub(crate) required: u64,
    pub(crate) warnings: Vec<String>,
}

impl SpaceCheck {
    /// The blocking message for a `507`, or `None` when both volumes have the floor.
    ///
    /// An unreportable volume is not treated as full: blocking on an unknown would make a
    /// network share unusable for no evidence. It is reported as a warning instead.
    pub(crate) fn blocker(&self, temp_path: &Path, output_path: &Path) -> Option<String> {
        for (label, path, free) in [
            ("scratch", temp_path, self.temp_free),
            ("output", output_path, self.output_free),
        ] {
            if let Some(free) = free
                && free < self.required
            {
                return Some(format!(
                    "The {label} location {} has {} free; an encode needs at least {}.",
                    path.display(),
                    human_bytes(free),
                    human_bytes(self.required)
                ));
            }
        }
        None
    }
}

/// Measure the scratch and output volumes for one video.
pub(crate) fn check(probe: &DiskProbe, temp_path: &Path, output_path: &Path) -> SpaceCheck {
    let temp_free = probe.available(temp_path);
    let output_parent = output_path.parent().unwrap_or(Path::new("."));
    let output_free = probe.available(output_parent);

    let mut warnings = Vec::new();
    for (label, path, free) in [
        ("scratch", temp_path, temp_free),
        ("output", output_parent, output_free),
    ] {
        match free {
            None => warnings.push(format!(
                "Free space for the {label} location {} could not be determined.",
                path.display()
            )),
            Some(bytes) if (REQUIRED_BYTES..WARN_BYTES).contains(&bytes) => warnings.push(format!(
                "The {label} location {} has {} free, which is below the {} warning level.",
                path.display(),
                human_bytes(bytes),
                human_bytes(WARN_BYTES)
            )),
            Some(_) => {}
        }
    }

    SpaceCheck {
        temp_free,
        output_free,
        required: REQUIRED_BYTES,
        warnings,
    }
}

/// Walk up from a path that may not exist until an ancestor does. This never creates a
/// directory: a space check must not be the thing that turns a missing path into a present
/// one.
fn nearest_existing(path: &Path) -> PathBuf {
    let mut current = path.to_path_buf();
    loop {
        if current.exists() {
            return current;
        }
        if !current.pop() {
            return PathBuf::from(".");
        }
    }
}

/// A compact size for a message, so a refusal names MiB rather than a twelve-digit number.
pub(crate) fn human_bytes(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KiB", "MiB", "GiB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit + 1 < UNITS.len() {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("av1ation-disk-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    #[test]
    fn below_the_floor_is_a_blocker_on_either_volume() {
        let dir = temporary_dir();
        let check = check(
            &DiskProbe::fixed(100 * 1024 * 1024),
            &dir,
            &dir.join("out.mkv"),
        );

        let message = check
            .blocker(&dir, &dir.join("out.mkv"))
            .expect("a full volume is blocked");
        assert!(message.contains("scratch"), "{message}");
        assert!(
            !check
                .warnings
                .iter()
                .any(|warning| warning.contains("below"))
        );

        std::fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn the_output_parent_is_measured_even_when_the_file_does_not_exist() {
        let dir = temporary_dir();
        let check = check(
            &DiskProbe::fixed(3 * 1024 * 1024 * 1024),
            &dir,
            &dir.join("nested/out.mkv"),
        );

        assert_eq!(check.temp_free, Some(3 * 1024 * 1024 * 1024));
        assert_eq!(check.output_free, Some(3 * 1024 * 1024 * 1024));
        assert!(check.blocker(&dir, &dir.join("nested/out.mkv")).is_none());
        assert!(check.warnings.is_empty(), "{:?}", check.warnings);

        std::fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn low_space_warns_without_blocking() {
        let dir = temporary_dir();
        let check = check(
            &DiskProbe::fixed(1024 * 1024 * 1024),
            &dir,
            &dir.join("out.mkv"),
        );

        assert!(check.blocker(&dir, &dir.join("out.mkv")).is_none());
        assert_eq!(check.warnings.len(), 2);
        assert!(check.warnings[0].contains("below"));

        std::fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn a_size_is_rendered_in_the_largest_whole_unit() {
        assert_eq!(human_bytes(900), "900 B");
        assert_eq!(human_bytes(1024), "1.0 KiB");
        assert_eq!(human_bytes(REQUIRED_BYTES), "512.0 MiB");
        assert_eq!(human_bytes(3 * 1024 * 1024 * 1024), "3.0 GiB");
    }
}
