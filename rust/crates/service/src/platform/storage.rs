//! The Storage screen's summary: where scratch work lives and what it occupies.
//!
//! Every number here is measured at read time. Retained bytes are the same per-video
//! directory sizes the queue already derives, and app-data bytes are the settings, logs, and
//! project manifests rather than a cached estimate that could disagree with disk.

use std::path::{Path, PathBuf};

use av1ation_contracts::platform::{StorageOverview, StorageProject};

use crate::state::AppState;

/// Whether the service state is rooted beside a portable executable.
///
/// The desktop host passes `<install>/data` only when it found the `portable` marker beside
/// the executable. Looking for that marker from the parent keeps the decision in one place
/// and lets the video store ignore every saved scratch override, so a portable copy can
/// never write chunks into another installation's data directory.
pub(crate) fn is_portable_root(data_dir: &Path) -> bool {
    data_dir
        .parent()
        .is_some_and(|install| install.join("portable").is_file())
}

/// Read the storage summary. A host without persistence returns empty rows rather than an
/// error, matching the rest of the read routes.
pub(crate) async fn overview(state: &AppState) -> StorageOverview {
    let default_directory = state
        .data_dir
        .as_ref()
        .map(|dir| dir.join("temp"))
        .unwrap_or_else(std::env::temp_dir);
    let temporary_directory = state
        .videos()
        .map(crate::project::videos::VideoStore::effective_temp_root)
        .unwrap_or_else(|| default_directory.clone());

    let mut projects = Vec::new();
    let mut retained_bytes = 0_u64;
    let mut video_count = 0_u32;

    if let (Some(store), Some(videos)) = (state.projects(), state.videos())
        && let Ok(summaries) = store.list().await
    {
        for summary in summaries {
            let Ok(records) = videos.records(&summary.id).await else {
                continue;
            };
            let mut project_bytes = 0_u64;
            for record in &records {
                project_bytes = project_bytes.saturating_add(
                    videos
                        .retained_bytes(&record.id, record.temp_directory.as_deref())
                        .await,
                );
            }
            video_count = video_count.saturating_add(records.len() as u32);
            if project_bytes > 0 {
                retained_bytes = retained_bytes.saturating_add(project_bytes);
                projects.push(StorageProject {
                    id: summary.id,
                    name: summary.name,
                    video_count: records.len() as u32,
                    retained_bytes: project_bytes,
                });
            }
        }
    }
    projects.sort_by_key(|project| std::cmp::Reverse(project.retained_bytes));

    let app_data_directory = state
        .data_dir
        .as_ref()
        .map(|dir| dir.display().to_string())
        .unwrap_or_default();
    let (app_data_bytes, log_bytes, manifest_bytes, catalogue_bytes) =
        match state.data_dir.as_deref() {
            Some(dir) => (
                app_data_size(dir, &temporary_directory).await,
                path_size(&dir.join("logs")).await,
                path_size(&dir.join("projects")).await,
                path_size(&dir.join("config.json")).await,
            ),
            None => (0, 0, 0, 0),
        };

    StorageOverview {
        temporary_directory: temporary_directory.display().to_string(),
        default_directory: default_directory.display().to_string(),
        free_bytes: state.disk.available(&temporary_directory),
        total_bytes: state.disk.capacity(&temporary_directory),
        retained_bytes,
        video_count,
        app_data_bytes,
        app_data_directory,
        log_bytes,
        manifest_bytes,
        catalogue_bytes,
        projects,
    }
}

/// Bytes occupied by one file or directory, zero when it does not exist.
async fn path_size(path: &Path) -> u64 {
    let Ok(metadata) = tokio::fs::metadata(path).await else {
        return 0;
    };
    if metadata.is_file() {
        return metadata.len();
    }
    let mut total = 0_u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(current) = stack.pop() {
        let Ok(mut entries) = tokio::fs::read_dir(&current).await else {
            continue;
        };
        while let Ok(Some(entry)) = entries.next_entry().await {
            let Ok(metadata) = entry.metadata().await else {
                continue;
            };
            if metadata.is_dir() {
                stack.push(entry.path());
            } else if metadata.is_file() {
                total = total.saturating_add(metadata.len());
            }
        }
    }
    total
}

/// Sum the app-data tree, leaving the scratch root out when it lives under it so the same
/// bytes are never counted twice as both retained work and application data.
async fn app_data_size(dir: &Path, scratch: &Path) -> u64 {
    let mut total = 0_u64;
    let mut stack = vec![(dir.to_path_buf(), true)];

    while let Some((path, root)) = stack.pop() {
        let mut entries = match tokio::fs::read_dir(&path).await {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        while let Ok(Some(entry)) = entries.next_entry().await {
            let entry_path: PathBuf = entry.path();
            if root && entry_path == scratch {
                continue;
            }
            let Ok(metadata) = entry.metadata().await else {
                continue;
            };
            if metadata.is_dir() {
                stack.push((entry_path, false));
            } else if metadata.is_file() {
                total = total.saturating_add(metadata.len());
            }
        }
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn app_data_size_skips_the_scratch_root() {
        let dir = std::env::temp_dir().join(format!("av1ation-storage-{}", uuid::Uuid::new_v4()));
        let scratch = dir.join("temp");
        tokio::fs::create_dir_all(&scratch).await.expect("scratch");
        tokio::fs::write(dir.join("config.json"), b"12345")
            .await
            .expect("config");
        tokio::fs::write(scratch.join("chunk.bin"), b"123456789")
            .await
            .expect("chunk");

        assert_eq!(app_data_size(&dir, &scratch).await, 5);

        tokio::fs::remove_dir_all(&dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn path_size_counts_files_and_directories() {
        let dir = std::env::temp_dir().join(format!("av1ation-storage-{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(dir.join("logs"))
            .await
            .expect("logs");
        tokio::fs::write(dir.join("config.json"), b"12345")
            .await
            .expect("config");
        tokio::fs::write(dir.join("logs").join("run.log"), b"1234567")
            .await
            .expect("log");

        assert_eq!(path_size(&dir.join("config.json")).await, 5);
        assert_eq!(path_size(&dir).await, 12);
        assert_eq!(path_size(&dir.join("missing")).await, 0);

        tokio::fs::remove_dir_all(&dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn app_data_size_includes_nested_files() {
        let dir = std::env::temp_dir().join(format!("av1ation-storage-{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(dir.join("logs"))
            .await
            .expect("logs");
        tokio::fs::write(dir.join("config.json"), b"12345")
            .await
            .expect("config");
        tokio::fs::write(dir.join("logs").join("run.log"), b"1234567")
            .await
            .expect("log");

        assert_eq!(app_data_size(&dir, &dir.join("scratch")).await, 12);

        tokio::fs::remove_dir_all(&dir).await.expect("cleanup");
    }
}
