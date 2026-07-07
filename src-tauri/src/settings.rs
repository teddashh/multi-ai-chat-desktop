use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

static TMP_SEQ: AtomicU64 = AtomicU64::new(0);
const DEFAULT_SNAPSHOT_REDACTION_TIER: &str = "metadata-only";
const SNAPSHOT_REDACTION_TIERS: &[&str] = &["metadata-only", "hashes", "prompt-text", "full-local"];
const PROVIDERS: &[&str] = &["chatgpt", "claude", "gemini", "grok", "claude-code"];
const PRESENTATION_STATES: &[&str] = &["chip", "side", "center"];

pub(crate) fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("settings.json"))
}

fn portable_marker_exists() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join("PORTABLE")))
        .is_some_and(|path| path.exists())
}

pub fn read_settings(path: &Path) -> Result<Value, String> {
    match std::fs::read_to_string(path) {
        Ok(content) if content.trim().is_empty() => Ok(Value::Object(Map::new())),
        Ok(content) => serde_json::from_str(&content).map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Value::Object(Map::new())),
        Err(error) => Err(error.to_string()),
    }
}

pub fn write_settings(path: &Path, settings: &Value) -> Result<(), String> {
    let mut persisted = settings.clone();
    if let Value::Object(map) = &mut persisted {
        map.remove("portable");
    }

    let bytes = serde_json::to_vec_pretty(&persisted).map_err(|error| error.to_string())?;
    write_atomic(path, &bytes)
}

pub fn normalize_settings_value(settings: Value) -> Value {
    let mut settings = match settings {
        Value::Object(map) => Value::Object(map),
        _ => Value::Object(Map::new()),
    };
    if let Value::Object(map) = &mut settings {
        let snapshot_persistence = map
            .get("snapshotPersistence")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
        map.insert(
            "snapshotPersistence".to_string(),
            Value::Bool(snapshot_persistence),
        );

        let tier = map
            .get("snapshotRedactionTier")
            .and_then(|value| value.as_str())
            .filter(|value| SNAPSHOT_REDACTION_TIERS.contains(value))
            .unwrap_or(DEFAULT_SNAPSHOT_REDACTION_TIER);
        map.insert(
            "snapshotRedactionTier".to_string(),
            Value::String(tier.to_string()),
        );

        let presentation = normalize_presentation_value(map.get("presentation"));
        map.insert("presentation".to_string(), presentation);
    }
    settings
}

fn normalize_presentation_value(value: Option<&Value>) -> Value {
    let input = value.and_then(|value| value.as_object());
    let mut map = Map::new();
    let mut center_seen = false;

    for provider in PROVIDERS {
        let candidate = input
            .and_then(|object| object.get(*provider))
            .and_then(|value| value.as_str())
            .filter(|value| PRESENTATION_STATES.contains(value))
            .unwrap_or_else(|| default_presentation(provider));
        let normalized = if candidate == "center" {
            if center_seen {
                "side"
            } else {
                center_seen = true;
                "center"
            }
        } else {
            candidate
        };
        map.insert(
            (*provider).to_string(),
            Value::String(normalized.to_string()),
        );
    }

    Value::Object(map)
}

fn default_presentation(provider: &str) -> &'static str {
    if provider == "claude-code" {
        "chip"
    } else {
        "side"
    }
}

pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp_path = path.with_file_name(format!(
        "{}.{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("adapter.json"),
        std::process::id(),
        seq
    ));
    if let Err(error) = std::fs::write(&tmp_path, bytes) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(error.to_string());
    }
    if let Err(error) = replace_file(&tmp_path, path) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(error);
    }
    Ok(())
}

#[cfg(windows)]
fn replace_file(tmp_path: &Path, path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let src: Vec<u16> = tmp_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let dst: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        MoveFileExW(
            PCWSTR(src.as_ptr()),
            PCWSTR(dst.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
        .map_err(|error| error.to_string())
    }
}

#[cfg(not(windows))]
fn replace_file(tmp_path: &Path, path: &Path) -> Result<(), String> {
    std::fs::rename(tmp_path, path).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn settings_get(app: AppHandle) -> Result<serde_json::Value, String> {
    let path = settings_path(&app)?;
    let mut settings = normalize_settings_value(read_settings(&path)?);
    if let Value::Object(map) = &mut settings {
        map.insert(
            "portable".to_string(),
            Value::Bool(portable_marker_exists()),
        );
    }
    Ok(settings)
}

#[tauri::command]
pub async fn settings_set(app: AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let path = settings_path(&app)?;
    let previous = read_settings(&path).unwrap_or_else(|_| Value::Object(Map::new()));
    let settings = normalize_settings_value(settings);
    write_settings(&path, &settings)?;
    let changed = |key: &str| {
        previous.get(key).and_then(|value| value.as_str())
            != settings.get(key).and_then(|value| value.as_str())
    };
    if changed("adapterBaseUrl") || changed("adapterChannel") {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            crate::adapters::refresh_all_adapters(handle, true).await;
        });
    }
    Ok(())
}

pub(crate) fn adapter_base_url(app: &AppHandle) -> Result<Option<String>, String> {
    let settings = read_settings(&settings_path(app)?)?;
    Ok(settings
        .get("adapterBaseUrl")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string))
}

#[tauri::command]
pub async fn publish_hackmd(
    app: AppHandle,
    webview: tauri::Webview,
    title: String,
    markdown: String,
) -> Result<String, String> {
    crate::webviews::ensure_control_webview(&webview)?;

    let path = settings_path(&app)?;
    let settings = read_settings(&path)?;
    let token = settings
        .get("hackmdToken")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "No HackMD token — add one in Settings.".to_string())?
        .to_string();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post("https://api.hackmd.io/v1/notes")
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "title": title,
            "content": markdown,
            "readPermission": "guest",
            "writePermission": "owner",
            "commentPermission": "disabled",
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let detail = if body.trim().is_empty() {
            status.canonical_reason().unwrap_or("error").to_string()
        } else {
            body
        };
        return Err(format!("HackMD {}: {}", status.as_u16(), detail));
    }

    let data: Value = response.json().await.map_err(|error| error.to_string())?;
    let id = data.get("id").and_then(|value| value.as_str());
    let url = data
        .get("publishLink")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .or_else(|| id.map(|id| format!("https://hackmd.io/@/{id}/publish")))
        .ok_or_else(|| "HackMD response missing publish link.".to_string())?;

    // Best-effort: only auto-open https URLs (parity with webviews.rs navigation policy).
    // Never fail the publish on this; the URL is returned to the UI regardless.
    if url.starts_with("https://") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
    Ok(url)
}

#[tauri::command]
pub async fn export_markdown(
    app: AppHandle,
    webview: tauri::Webview,
    suggested_name: String,
    content: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    crate::webviews::ensure_control_webview(&webview)?;

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(&suggested_name)
        .add_filter("Markdown", &["md"])
        .save_file(move |chosen| {
            let _ = tx.send(chosen);
        });

    match rx.await.map_err(|error| error.to_string())? {
        Some(file_path) => {
            let path = file_path.into_path().map_err(|error| error.to_string())?;
            std::fs::write(&path, content).map_err(|error| error.to_string())?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}

// Open an external URL in the OS default browser from the control pane. Tauri does not route
// `<a target="_blank">` clicks to the OS browser, so the frontend calls this instead. https-only.
#[tauri::command]
pub async fn open_external_url(
    app: AppHandle,
    webview: tauri::Webview,
    url: String,
) -> Result<(), String> {
    crate::webviews::ensure_control_webview(&webview)?;
    if !url.starts_with("https://") {
        return Err("only https URLs may be opened".to_string());
    }
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{normalize_settings_value, read_settings, write_settings};
    use serde_json::json;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT_ID: AtomicUsize = AtomicUsize::new(0);

    fn unique_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "multi-ai-chat-settings-{}-{}-{}.json",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::SeqCst),
            name
        ))
    }

    #[test]
    fn write_then_read_round_trips_non_trivial_blob() {
        let path = unique_path("roundtrip");
        let blob = json!({
            "hackmdToken": "hmd_secret",
            "columnWidths": { "left": 280, "right": 340 },
            "slotAssignment": ["chatgpt", "claude", "gemini", "grok"],
            "portable": true
        });

        write_settings(&path, &blob).expect("write settings");
        let read = read_settings(&path).expect("read settings");

        assert_eq!(
            read,
            json!({
                "hackmdToken": "hmd_secret",
                "columnWidths": { "left": 280, "right": 340 },
                "slotAssignment": ["chatgpt", "claude", "gemini", "grok"]
            })
        );

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn missing_file_reads_as_empty_object() {
        let path = unique_path("missing");

        assert_eq!(
            read_settings(&path).expect("read missing settings"),
            json!({})
        );
    }

    #[test]
    fn atomic_write_removes_tmp_and_overwrites_cleanly() {
        let path = unique_path("overwrite");

        write_settings(&path, &json!({ "value": 1 })).expect("first write");
        write_settings(&path, &json!({ "value": 2 })).expect("second write");

        assert_eq!(
            read_settings(&path).expect("read overwritten settings"),
            json!({ "value": 2 })
        );

        // No leftover temp file for this target. write_atomic uses a unique
        // `<name>.<pid>.<seq>.tmp` scheme, so scan for any `.tmp` sibling of this base
        // rather than a fixed name (robust to the temp-naming scheme).
        let base = path.file_name().and_then(|name| name.to_str()).unwrap();
        let dir = path.parent().expect("temp parent");
        let leftover: Vec<_> = std::fs::read_dir(dir)
            .expect("read temp dir")
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry
                    .file_name()
                    .to_str()
                    .is_some_and(|name| name.starts_with(base) && name.ends_with(".tmp"))
            })
            .map(|entry| entry.path())
            .collect();
        assert!(leftover.is_empty(), "temp files left behind: {leftover:?}");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn normalizes_snapshot_settings_to_opt_in_safe_defaults() {
        assert_eq!(
            normalize_settings_value(json!({})),
            json!({
                "snapshotPersistence": false,
                "snapshotRedactionTier": "metadata-only",
                "presentation": {
                    "chatgpt": "side",
                    "claude": "side",
                    "gemini": "side",
                    "grok": "side",
                    "claude-code": "chip"
                }
            })
        );
        assert_eq!(
            normalize_settings_value(json!({
                "snapshotPersistence": true,
                "snapshotRedactionTier": "full-local",
                "presentation": {
                    "chatgpt": "chip",
                    "claude": "center",
                    "gemini": "side",
                    "grok": "side",
                    "claude-code": "chip"
                }
            })),
            json!({
                "snapshotPersistence": true,
                "snapshotRedactionTier": "full-local",
                "presentation": {
                    "chatgpt": "chip",
                    "claude": "center",
                    "gemini": "side",
                    "grok": "side",
                    "claude-code": "chip"
                }
            })
        );
        assert_eq!(
            normalize_settings_value(json!({
                "snapshotPersistence": "true",
                "snapshotRedactionTier": "unknown",
                "presentation": {
                    "chatgpt": "center",
                    "claude": "center",
                    "gemini": "bad",
                    "claude-code": "bad",
                    "unknown": "chip"
                }
            })),
            json!({
                "snapshotPersistence": false,
                "snapshotRedactionTier": "metadata-only",
                "presentation": {
                    "chatgpt": "center",
                    "claude": "side",
                    "gemini": "side",
                    "grok": "side",
                    "claude-code": "chip"
                }
            })
        );
    }
}
