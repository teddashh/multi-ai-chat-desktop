use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

static TMP_SEQ: AtomicU64 = AtomicU64::new(0);
static PROVIDER_LIFECYCLE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
const DEFAULT_LANGUAGE: &str = "system";
const LANGUAGES: &[&str] = &["system", "en", "zh-TW", "ja", "de"];
const DEFAULT_RESPONSE_LANGUAGE: &str = "auto";
const RESPONSE_LANGUAGES: &[&str] = &["auto", "en", "zh-TW", "ja", "de"];
const DEFAULT_LAYOUT_MODE: &str = "focus";
const DEFAULT_FOCUS_PANE_WIDTH: f64 = 620.0;
const MIN_FOCUS_PANE_WIDTH: f64 = 420.0;
const MIN_CONTROL_PANE_WIDTH: f64 = 360.0;
const RESIZER_WIDTH: f64 = 6.0;
const SETTINGS_NORMALIZATION_CONTAINER_WIDTH: f64 = 1400.0;
const DEFAULT_SNAPSHOT_REDACTION_TIER: &str = "metadata-only";
const SNAPSHOT_REDACTION_TIERS: &[&str] = &["metadata-only", "hashes", "prompt-text", "full-local"];
const PROVIDERS: &[&str] = &["chatgpt", "claude", "gemini", "grok", "meta"];
const DEFAULT_STANDBY_PROVIDER: &str = "meta";
const PRESENTATION_STATES: &[&str] = &["chip", "side", "center"];

pub(crate) fn lock_provider_lifecycle() -> Result<MutexGuard<'static, ()>, String> {
    PROVIDER_LIFECYCLE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "provider lifecycle lock is poisoned".to_string())
}

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

#[cfg(test)]
fn write_settings(path: &Path, settings: &Value) -> Result<(), String> {
    let bytes = serialized_settings(settings)?;
    write_atomic(path, &bytes)
}

fn serialized_settings(settings: &Value) -> Result<Vec<u8>, String> {
    let mut persisted = settings.clone();
    if let Value::Object(map) = &mut persisted {
        map.remove("portable");
    }

    serde_json::to_vec_pretty(&persisted).map_err(|error| error.to_string())
}

pub fn normalize_settings_value(settings: Value) -> Value {
    let mut settings = match settings {
        Value::Object(map) => Value::Object(map),
        _ => Value::Object(Map::new()),
    };
    if let Value::Object(map) = &mut settings {
        let language = map
            .get("language")
            .and_then(|value| value.as_str())
            .filter(|value| LANGUAGES.contains(value))
            .unwrap_or(DEFAULT_LANGUAGE);
        map.insert("language".to_string(), Value::String(language.to_string()));

        let response_language = map
            .get("responseLanguage")
            .and_then(|value| value.as_str())
            .filter(|value| RESPONSE_LANGUAGES.contains(value))
            .unwrap_or(DEFAULT_RESPONSE_LANGUAGE);
        map.insert(
            "responseLanguage".to_string(),
            Value::String(response_language.to_string()),
        );

        map.insert(
            "layoutMode".to_string(),
            Value::String(DEFAULT_LAYOUT_MODE.to_string()),
        );
        let focus_pane_width = map
            .get("focusPaneWidth")
            .and_then(|value| value.as_f64())
            .or_else(|| {
                map.get("columnWidths")
                    .and_then(|value| value.as_object())
                    .and_then(|object| object.get("left"))
                    .and_then(|value| value.as_f64())
            })
            .unwrap_or(DEFAULT_FOCUS_PANE_WIDTH);
        map.insert(
            "focusPaneWidth".to_string(),
            number_value(clamp_focus_pane_width(
                focus_pane_width,
                SETTINGS_NORMALIZATION_CONTAINER_WIDTH,
            )),
        );

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

        let standby_provider = normalize_standby_provider(map.get("standbyProvider"));
        map.insert(
            "standbyProvider".to_string(),
            Value::String(standby_provider.clone()),
        );

        let presentation = normalize_presentation_value(map.get("presentation"), &standby_provider);
        map.insert("presentation".to_string(), presentation);
    }
    settings
}

fn clamp_focus_pane_width(width: f64, container_width: f64) -> f64 {
    let max_width =
        (container_width - MIN_CONTROL_PANE_WIDTH - RESIZER_WIDTH).max(MIN_FOCUS_PANE_WIDTH);
    width.round().clamp(MIN_FOCUS_PANE_WIDTH, max_width)
}

fn number_value(value: f64) -> Value {
    Value::Number(serde_json::Number::from(value as i64))
}

fn normalize_standby_provider(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .filter(|provider| PROVIDERS.contains(provider))
        .unwrap_or(DEFAULT_STANDBY_PROVIDER)
        .to_string()
}

fn active_providers_for_settings(settings: &Value) -> Vec<&'static str> {
    let standby_provider = normalize_standby_provider(settings.get("standbyProvider"));
    PROVIDERS
        .iter()
        .copied()
        .filter(|provider| *provider != standby_provider)
        .collect()
}

fn ensure_provider_active_value(settings: &Value, provider: &str) -> Result<(), String> {
    if !PROVIDERS.contains(&provider) {
        return Err(format!("unknown provider: {provider}"));
    }
    if active_providers_for_settings(settings).contains(&provider) {
        return Ok(());
    }
    Err(format!(
        "{provider} is configured as the standby provider; select it in Settings before opening it"
    ))
}

pub(crate) fn ensure_provider_active(app: &AppHandle, provider: &str) -> Result<(), String> {
    let _lifecycle_guard = lock_provider_lifecycle()?;
    ensure_provider_active_locked(app, provider)
}

pub(crate) fn ensure_provider_active_locked(app: &AppHandle, provider: &str) -> Result<(), String> {
    // A damaged settings file must not brick every provider command. Startup already falls back
    // to the default lineup, so the native guard uses the same safe Meta-standby default.
    let settings =
        read_settings(&settings_path(app)?).unwrap_or_else(|_| Value::Object(Map::new()));
    let standby_provider = normalize_standby_provider(settings.get("standbyProvider"));
    crate::webviews::close_standby_provider(app, &standby_provider)?;
    ensure_provider_active_value(&settings, provider)
}

fn read_settings_for_provider_guard(path: &Path) -> Value {
    read_settings(path).unwrap_or_else(|_| Value::Object(Map::new()))
}

fn normalize_presentation_value(value: Option<&Value>, standby_provider: &str) -> Value {
    let input = value.and_then(|value| value.as_object());
    let mut map = Map::new();
    let mut center_seen = false;

    for provider in PROVIDERS {
        let candidate = if *provider == standby_provider {
            "chip"
        } else {
            input
                .and_then(|object| object.get(*provider))
                .and_then(|value| value.as_str())
                .filter(|value| PRESENTATION_STATES.contains(value))
                .unwrap_or("side")
        };
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

pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    write_atomic_before_replace(path, bytes, || Ok(()))
}

fn write_atomic_before_replace(
    path: &Path,
    bytes: &[u8],
    before_replace: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
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
    if let Err(error) = before_replace() {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(error);
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
    let _lifecycle_guard = lock_provider_lifecycle()?;
    let path = settings_path(&app)?;
    let mut settings = normalize_settings_value(read_settings_for_provider_guard(&path));
    let standby_provider = settings
        .get("standbyProvider")
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_STANDBY_PROVIDER);
    crate::webviews::close_standby_provider(&app, standby_provider)?;
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
    let _lifecycle_guard = lock_provider_lifecycle()?;
    let path = settings_path(&app)?;
    let previous = read_settings(&path).unwrap_or_else(|_| Value::Object(Map::new()));
    let settings = normalize_settings_value(settings);
    let standby_provider = settings
        .get("standbyProvider")
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_STANDBY_PROVIDER);
    let bytes = serialized_settings(&settings)?;
    // Prepare and validate the complete write before retiring the new standby. The final atomic
    // replace happens only after the WebView close succeeds.
    write_atomic_before_replace(&path, &bytes, || {
        crate::webviews::close_standby_provider(&app, standby_provider)
    })?;
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
    use super::{
        active_providers_for_settings, ensure_provider_active_value, normalize_settings_value,
        read_settings, read_settings_for_provider_guard, write_atomic_before_replace,
        write_settings,
    };
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
            "adapterBaseUrl": "https://example.test/adapters",
            "columnWidths": { "left": 280, "right": 340 },
            "slotAssignment": ["chatgpt", "claude", "gemini", "grok"],
            "portable": true
        });

        write_settings(&path, &blob).expect("write settings");
        let read = read_settings(&path).expect("read settings");

        assert_eq!(
            read,
            json!({
                "adapterBaseUrl": "https://example.test/adapters",
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
    fn malformed_settings_fall_back_to_the_safe_provider_lineup() {
        let path = unique_path("malformed-provider-guard");
        std::fs::write(&path, b"{not-json").expect("write malformed settings");

        let settings = read_settings_for_provider_guard(&path);
        for provider in ["chatgpt", "claude", "gemini", "grok"] {
            assert!(ensure_provider_active_value(&settings, provider).is_ok());
        }
        assert!(ensure_provider_active_value(&settings, "meta").is_err());

        let _ = std::fs::remove_file(path);
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
    fn failed_pre_replace_hook_preserves_settings_and_removes_tmp() {
        let path = unique_path("pre-replace-failure");
        write_settings(&path, &json!({ "value": 1 })).expect("seed settings");

        let error = write_atomic_before_replace(&path, br#"{"value":2}"#, || {
            Err("standby close failed".to_string())
        })
        .expect_err("hook failure must abort replace");

        assert_eq!(error, "standby close failed");
        assert_eq!(
            read_settings(&path).expect("read preserved settings"),
            json!({ "value": 1 })
        );
        let base = path.file_name().and_then(|name| name.to_str()).unwrap();
        let leftovers: Vec<_> = std::fs::read_dir(path.parent().expect("temp parent"))
            .expect("read temp dir")
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry
                    .file_name()
                    .to_str()
                    .is_some_and(|name| name.starts_with(base) && name.ends_with(".tmp"))
            })
            .collect();
        assert!(leftovers.is_empty(), "temp files left behind");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn normalizes_snapshot_settings_to_opt_in_safe_defaults() {
        assert_eq!(
            normalize_settings_value(json!({})),
            json!({
                "language": "system",
                "responseLanguage": "auto",
                "layoutMode": "focus",
                "focusPaneWidth": 620,
                "snapshotPersistence": false,
                "snapshotRedactionTier": "metadata-only",
                "standbyProvider": "meta",
                "presentation": {
                    "chatgpt": "side",
                    "claude": "side",
                    "gemini": "side",
                    "grok": "side",
                    "meta": "chip"
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
                    "grok": "side"
                }
            })),
            json!({
                "language": "system",
                "responseLanguage": "auto",
                "layoutMode": "focus",
                "focusPaneWidth": 620,
                "snapshotPersistence": true,
                "snapshotRedactionTier": "full-local",
                "standbyProvider": "meta",
                "presentation": {
                    "chatgpt": "chip",
                    "claude": "center",
                    "gemini": "side",
                    "grok": "side",
                    "meta": "chip"
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
                    "removed-provider": "bad",
                    "unknown": "chip"
                }
            })),
            json!({
                "language": "system",
                "responseLanguage": "auto",
                "layoutMode": "focus",
                "focusPaneWidth": 620,
                "snapshotPersistence": false,
                "snapshotRedactionTier": "metadata-only",
                "standbyProvider": "meta",
                "presentation": {
                    "chatgpt": "center",
                    "claude": "side",
                    "gemini": "side",
                    "grok": "side",
                    "meta": "chip"
                }
            })
        );
    }

    #[test]
    fn normalizes_standby_provider_and_keeps_exactly_four_active() {
        for standby in ["chatgpt", "claude", "gemini", "grok", "meta"] {
            let normalized = normalize_settings_value(json!({ "standbyProvider": standby }));
            assert_eq!(normalized.get("standbyProvider"), Some(&json!(standby)));

            let active = active_providers_for_settings(&normalized);
            assert_eq!(active.len(), 4);
            assert!(!active.contains(&standby));
        }

        for invalid in [json!(null), json!("unknown"), json!(42)] {
            let normalized = normalize_settings_value(json!({ "standbyProvider": invalid }));
            assert_eq!(normalized.get("standbyProvider"), Some(&json!("meta")));
            assert_eq!(
                active_providers_for_settings(&normalized),
                vec!["chatgpt", "claude", "gemini", "grok"]
            );
        }
    }

    #[test]
    fn standby_provider_is_denied_until_selected() {
        let default_settings = json!({});
        for provider in ["chatgpt", "claude", "gemini", "grok"] {
            assert!(ensure_provider_active_value(&default_settings, provider).is_ok());
        }
        assert_eq!(
            ensure_provider_active_value(&default_settings, "meta").unwrap_err(),
            "meta is configured as the standby provider; select it in Settings before opening it"
        );

        let grok_standby = json!({ "standbyProvider": "grok" });
        assert!(ensure_provider_active_value(&grok_standby, "meta").is_ok());
        assert!(ensure_provider_active_value(&grok_standby, "grok").is_err());
        assert_eq!(
            ensure_provider_active_value(&grok_standby, "not-a-provider").unwrap_err(),
            "unknown provider: not-a-provider"
        );
    }

    #[test]
    fn standby_provider_is_forced_to_chip_presentation() {
        let normalized = normalize_settings_value(json!({
            "standbyProvider": "grok",
            "presentation": {
                "chatgpt": "side",
                "claude": "side",
                "gemini": "side",
                "grok": "center",
                "meta": "center"
            }
        }));

        assert_eq!(normalized["presentation"]["grok"], json!("chip"));
        assert_eq!(normalized["presentation"]["meta"], json!("center"));

        let missing_presentation = normalize_settings_value(json!({ "standbyProvider": "grok" }));
        assert_eq!(missing_presentation["presentation"]["grok"], json!("chip"));
        assert_eq!(missing_presentation["presentation"]["meta"], json!("side"));
    }

    #[test]
    fn normalizes_language_setting_to_supported_values() {
        assert_eq!(
            normalize_settings_value(json!({ "language": "en" })).get("language"),
            Some(&json!("en"))
        );
        assert_eq!(
            normalize_settings_value(json!({ "language": "zh-TW" })).get("language"),
            Some(&json!("zh-TW"))
        );
        assert_eq!(
            normalize_settings_value(json!({ "language": "ja" })).get("language"),
            Some(&json!("ja"))
        );
        assert_eq!(
            normalize_settings_value(json!({ "language": "de" })).get("language"),
            Some(&json!("de"))
        );
        assert_eq!(
            normalize_settings_value(json!({ "language": "fr" })).get("language"),
            Some(&json!("system"))
        );
        assert_eq!(
            normalize_settings_value(json!({ "language": 123 })).get("language"),
            Some(&json!("system"))
        );
    }

    #[test]
    fn normalizes_response_language_setting_to_supported_values() {
        for language in ["auto", "en", "zh-TW", "ja", "de"] {
            assert_eq!(
                normalize_settings_value(json!({ "responseLanguage": language }))
                    .get("responseLanguage"),
                Some(&json!(language))
            );
        }
        assert_eq!(
            normalize_settings_value(json!({ "responseLanguage": "fr" })).get("responseLanguage"),
            Some(&json!("auto"))
        );
        assert_eq!(
            normalize_settings_value(json!({ "responseLanguage": 123 })).get("responseLanguage"),
            Some(&json!("auto"))
        );
    }

    #[test]
    fn normalizes_focus_layout_settings_and_migrates_legacy_width() {
        let normalized = normalize_settings_value(json!({
            "layoutMode": "quadrant",
            "focusPaneWidth": 700
        }));
        assert_eq!(normalized.get("layoutMode"), Some(&json!("focus")));
        assert_eq!(normalized.get("focusPaneWidth"), Some(&json!(700)));

        assert_eq!(
            normalize_settings_value(json!({ "focusPaneWidth": 250 })).get("focusPaneWidth"),
            Some(&json!(420))
        );
        assert_eq!(
            normalize_settings_value(json!({ "columnWidths": { "left": 500, "right": 320 } }))
                .get("focusPaneWidth"),
            Some(&json!(500))
        );
        assert_eq!(
            normalize_settings_value(
                json!({ "focusPaneWidth": "wide", "columnWidths": { "left": 1200 } })
            )
            .get("focusPaneWidth"),
            Some(&json!(1034))
        );
    }
}
