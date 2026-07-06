use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

const SNAPSHOT_RETENTION: usize = 50;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotListEntry {
    pub id: String,
    #[serde(rename = "graphId", skip_serializing_if = "Option::is_none")]
    pub graph_id: Option<String>,
    #[serde(rename = "createdAt", skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(rename = "completedAt", skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

#[derive(Debug)]
struct SnapshotFile {
    id: String,
    path: PathBuf,
    name: String,
    modified: SystemTime,
}

pub(crate) fn snapshots_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("snapshots"))
}

#[tauri::command]
pub async fn snapshot_save(
    app: AppHandle,
    webview: tauri::Webview,
    snapshot_id: String,
    snapshot_json: String,
) -> Result<(), String> {
    crate::webviews::ensure_control_webview(&webview)?;
    save_snapshot_to_dir(
        &snapshots_dir(&app)?,
        &snapshot_id,
        &snapshot_json,
        SNAPSHOT_RETENTION,
    )
}

#[tauri::command]
pub async fn snapshot_list(
    app: AppHandle,
    webview: tauri::Webview,
) -> Result<Vec<SnapshotListEntry>, String> {
    crate::webviews::ensure_control_webview(&webview)?;
    list_snapshots_in_dir(&snapshots_dir(&app)?)
}

#[tauri::command]
pub async fn snapshot_load(
    app: AppHandle,
    webview: tauri::Webview,
    snapshot_id: String,
) -> Result<Option<String>, String> {
    crate::webviews::ensure_control_webview(&webview)?;
    load_snapshot_from_dir(&snapshots_dir(&app)?, &snapshot_id)
}

#[tauri::command]
pub async fn snapshot_delete(
    app: AppHandle,
    webview: tauri::Webview,
    snapshot_id: String,
) -> Result<(), String> {
    crate::webviews::ensure_control_webview(&webview)?;
    delete_snapshot_from_dir(&snapshots_dir(&app)?, &snapshot_id)
}

fn save_snapshot_to_dir(
    dir: &Path,
    snapshot_id: &str,
    snapshot_json: &str,
    retention: usize,
) -> Result<(), String> {
    let path = snapshot_path(dir, snapshot_id)?;
    crate::settings::write_atomic(&path, snapshot_json.as_bytes())?;
    prune_snapshots(dir, retention)
}

fn list_snapshots_in_dir(dir: &Path) -> Result<Vec<SnapshotListEntry>, String> {
    let mut files = snapshot_files(dir)?;
    files.sort_by(|left, right| {
        right
            .modified
            .cmp(&left.modified)
            .then_with(|| right.name.cmp(&left.name))
    });

    files
        .into_iter()
        .map(|file| {
            let text = std::fs::read_to_string(&file.path).map_err(|error| error.to_string())?;
            Ok(snapshot_list_entry(file.id, &text))
        })
        .collect()
}

fn load_snapshot_from_dir(dir: &Path, snapshot_id: &str) -> Result<Option<String>, String> {
    let path = snapshot_path(dir, snapshot_id)?;
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn delete_snapshot_from_dir(dir: &Path, snapshot_id: &str) -> Result<(), String> {
    let path = snapshot_path(dir, snapshot_id)?;
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn snapshot_path(dir: &Path, snapshot_id: &str) -> Result<PathBuf, String> {
    validate_snapshot_id(snapshot_id)?;
    Ok(dir.join(format!("{snapshot_id}.json")))
}

fn validate_snapshot_id(snapshot_id: &str) -> Result<(), String> {
    if snapshot_id.is_empty() || snapshot_id.len() > 80 || snapshot_id == "." || snapshot_id == ".."
    {
        return Err("invalid snapshot id".to_string());
    }
    if snapshot_id
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        Ok(())
    } else {
        Err("invalid snapshot id".to_string())
    }
}

fn prune_snapshots(dir: &Path, retention: usize) -> Result<(), String> {
    let mut files = snapshot_files(dir)?;
    if files.len() <= retention {
        return Ok(());
    }
    files.sort_by(|left, right| {
        left.modified
            .cmp(&right.modified)
            .then_with(|| left.name.cmp(&right.name))
    });
    let remove_count = files.len().saturating_sub(retention);
    for file in files.into_iter().take(remove_count) {
        std::fs::remove_file(file.path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn snapshot_files(dir: &Path) -> Result<Vec<SnapshotFile>, String> {
    match std::fs::read_dir(dir) {
        Ok(entries) => {
            let mut files = Vec::new();
            for entry in entries {
                if let Some(file) = snapshot_file(entry.map_err(|error| error.to_string())?)? {
                    files.push(file);
                }
            }
            Ok(files)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.to_string()),
    }
}

fn snapshot_file(entry: std::fs::DirEntry) -> Result<Option<SnapshotFile>, String> {
    let path = entry.path();
    if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
        return Ok(None);
    }
    let Some(id) = path.file_stem().and_then(|stem| stem.to_str()) else {
        return Ok(None);
    };
    if validate_snapshot_id(id).is_err() {
        return Ok(None);
    }
    let metadata = entry.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Ok(None);
    }
    let modified = metadata.modified().map_err(|error| error.to_string())?;
    let name = entry.file_name().to_string_lossy().into_owned();
    Ok(Some(SnapshotFile {
        id: id.to_string(),
        path,
        name,
        modified,
    }))
}

fn snapshot_list_entry(id: String, snapshot_json: &str) -> SnapshotListEntry {
    let parsed = serde_json::from_str::<Value>(snapshot_json).ok();
    SnapshotListEntry {
        id,
        graph_id: string_field(parsed.as_ref(), "graphId"),
        created_at: string_field(parsed.as_ref(), "createdAt"),
        completed_at: string_field(parsed.as_ref(), "completedAt"),
    }
}

fn string_field(value: Option<&Value>, key: &str) -> Option<String> {
    value?
        .get(key)
        .and_then(|field| field.as_str())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT_ID: AtomicUsize = AtomicUsize::new(0);

    fn unique_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "multi-ai-chat-snapshots-{}-{}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::SeqCst),
            name
        ))
    }

    #[test]
    fn save_load_list_and_delete_round_trip() {
        let dir = unique_dir("roundtrip");
        let body = json!({
            "snapshotId": "snap-1",
            "graphId": "debate",
            "createdAt": "2026-07-06T01:00:00.000Z",
            "completedAt": "2026-07-06T01:01:00.000Z",
        })
        .to_string();

        save_snapshot_to_dir(&dir, "snap-1", &body, SNAPSHOT_RETENTION).expect("save snapshot");
        assert_eq!(
            load_snapshot_from_dir(&dir, "snap-1").expect("load snapshot"),
            Some(body.clone())
        );

        assert_eq!(
            list_snapshots_in_dir(&dir).expect("list snapshots"),
            vec![SnapshotListEntry {
                id: "snap-1".to_string(),
                graph_id: Some("debate".to_string()),
                created_at: Some("2026-07-06T01:00:00.000Z".to_string()),
                completed_at: Some("2026-07-06T01:01:00.000Z".to_string()),
            }]
        );

        delete_snapshot_from_dir(&dir, "snap-1").expect("delete snapshot");
        assert_eq!(
            load_snapshot_from_dir(&dir, "snap-1").expect("load deleted"),
            None
        );

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn retention_prunes_to_newest_n_by_mtime_and_name() {
        let dir = unique_dir("retention");
        for index in 0..5 {
            save_snapshot_to_dir(
                &dir,
                &format!("snap-{index:02}"),
                &json!({ "snapshotId": format!("snap-{index:02}") }).to_string(),
                3,
            )
            .expect("save snapshot");
        }

        let ids: Vec<_> = list_snapshots_in_dir(&dir)
            .expect("list snapshots")
            .into_iter()
            .map(|entry| entry.id)
            .collect();
        assert_eq!(ids, vec!["snap-04", "snap-03", "snap-02"]);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn id_validation_rejects_path_traversal_and_absolute_paths() {
        assert!(validate_snapshot_id("snap-1_ok.2").is_ok());
        assert!(validate_snapshot_id("../secret").is_err());
        assert!(validate_snapshot_id("/tmp/secret").is_err());
        assert!(validate_snapshot_id(r"C:\tmp\secret").is_err());
        assert!(validate_snapshot_id("").is_err());
        assert!(validate_snapshot_id(&"a".repeat(81)).is_err());
    }
}
