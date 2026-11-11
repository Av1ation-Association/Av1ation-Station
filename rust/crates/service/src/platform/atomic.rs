//! The service's one atomic file-replacement policy.
//!
//! A temp file in the target's own directory, `sync_all`, rename, then a directory `fsync`
//! so the rename itself survives a crash. The parent directory must already exist: this
//! never creates one, because a write that creates directories lets a read path resurrect a
//! project another request just deleted. Settings and project documents both use it, so the
//! durability rules cannot drift apart.

use std::{io, path::Path};

use tokio::io::AsyncWriteExt;

/// Replace `path` with `bytes`, leaving either the old file or the new one.
///
/// The temp file is removed when the write or the rename fails, so a failed mutation does
/// not leave rubbish beside the target.
pub(crate) async fn write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("{} has no parent directory", path.display()),
        )
    })?;

    let temporary = path.with_file_name(format!(".{}.tmp", uuid::Uuid::new_v4()));
    let replaced = async {
        let mut file = tokio::fs::File::create(&temporary).await?;
        file.write_all(bytes).await?;
        file.sync_all().await?;
        drop(file);
        tokio::fs::rename(&temporary, path).await
    }
    .await;

    if let Err(error) = replaced {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(error);
    }

    sync_directory(parent).await;
    Ok(())
}

/// Replace `path` with `bytes` from a synchronous caller.
///
/// The encode worker checkpoints from the thread that owns the engine, which is not an
/// async context; it must obey the same temp-file policy as every other write rather than
/// inventing a second one. Keeping both entry points in this module is what stops the two
/// from drifting apart.
pub(crate) fn write_blocking(path: &Path, bytes: &[u8]) -> io::Result<()> {
    use std::io::Write as _;

    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("{} has no parent directory", path.display()),
        )
    })?;

    let temporary = path.with_file_name(format!(".{}.tmp", uuid::Uuid::new_v4()));
    let replaced = (|| {
        let mut file = std::fs::File::create(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temporary, path)
    })();

    if let Err(error) = replaced {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }

    sync_directory_blocking(parent);
    Ok(())
}

/// Flush the directory entry so the rename is durable. Not every platform can open a
/// directory as a file, and none can on Windows, so a failure here is a warning rather than
/// a failed write: the data is already whole.
#[cfg(unix)]
async fn sync_directory(parent: &Path) {
    if let Ok(directory) = tokio::fs::File::open(parent).await {
        if let Err(error) = directory.sync_all().await {
            tracing::warn!(%error, path = %parent.display(), "the directory entry could not be flushed");
        }
    }
}

#[cfg(not(unix))]
async fn sync_directory(_parent: &Path) {}

#[cfg(unix)]
fn sync_directory_blocking(parent: &Path) {
    if let Ok(directory) = std::fs::File::open(parent) {
        if let Err(error) = directory.sync_all() {
            tracing::warn!(%error, path = %parent.display(), "the directory entry could not be flushed");
        }
    }
}

#[cfg(not(unix))]
fn sync_directory_blocking(_parent: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_replace_leaves_one_file_and_no_temp_files() {
        let dir = std::env::temp_dir().join(format!("av1ation-atomic-{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.expect("temp dir");
        let path = dir.join("document.json");

        write(&path, b"{\"a\":1}").await.expect("first write");
        write(&path, b"{\"a\":2}").await.expect("replace");

        assert_eq!(
            tokio::fs::read_to_string(&path).await.expect("read"),
            "{\"a\":2}"
        );
        let mut entries = tokio::fs::read_dir(&dir).await.expect("list");
        let mut names = Vec::new();
        while let Some(entry) = entries.next_entry().await.expect("entry") {
            names.push(entry.file_name().to_string_lossy().into_owned());
        }
        assert_eq!(names, vec!["document.json"]);

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn a_missing_directory_is_not_created() {
        let dir = std::env::temp_dir().join(format!("av1ation-atomic-{}", uuid::Uuid::new_v4()));
        let path = dir.join("projects").join("document.json");

        assert!(write(&path, b"{}").await.is_err());
        assert!(!tokio::fs::try_exists(&dir).await.expect("probe"));
    }
}
