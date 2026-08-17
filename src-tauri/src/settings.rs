use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

static TMP_SEQ: AtomicU64 = AtomicU64::new(0);
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
const ARCHIVE_LABEL_MAX_CHARS: usize = 16;
const PROVIDERS: &[&str] = &["chatgpt", "claude", "gemini", "grok"];
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

        // Path of a script the user points the archive button at. Only the shape is checked here;
        // run_archive_script re-checks existence, because the file can vanish after it was set.
        let archive_script = map
            .get("archiveScript")
            .and_then(|value| value.as_str())
            .filter(|value| is_archive_script_path(value))
            .unwrap_or("");
        map.insert(
            "archiveScript".to_string(),
            Value::String(archive_script.to_string()),
        );

        // The button's caption. Empty falls back to the translated default. Capped and stripped of
        // line breaks because this lands in a toolbar that already has to wrap at narrow widths.
        let archive_label = map
            .get("archiveLabel")
            .and_then(|value| value.as_str())
            .map(|value| {
                value
                    .chars()
                    .filter(|character| !character.is_control())
                    .take(ARCHIVE_LABEL_MAX_CHARS)
                    .collect::<String>()
                    .trim()
                    .to_string()
            })
            .unwrap_or_default();
        map.insert("archiveLabel".to_string(), Value::String(archive_label));

        // Defaults to ON: the button starts a child process, and an unasked first click is a worse
        // surprise than one extra dialog. Absent in an older settings.json therefore means "ask".
        let archive_confirm = map
            .get("archiveConfirm")
            .and_then(|value| value.as_bool())
            .unwrap_or(true);
        map.insert("archiveConfirm".to_string(), Value::Bool(archive_confirm));

        let presentation = normalize_presentation_value(map.get("presentation"));
        map.insert("presentation".to_string(), presentation);
    }
    settings
}

/// An absolute path to a `.ps1`. Absolute because the app's working directory is not somewhere the
/// user can reason about, so a relative path would resolve somewhere they did not mean.
fn is_archive_script_path(value: &str) -> bool {
    let path = Path::new(value);
    path.is_absolute()
        && path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("ps1"))
}

fn clamp_focus_pane_width(width: f64, container_width: f64) -> f64 {
    let max_width =
        (container_width - MIN_CONTROL_PANE_WIDTH - RESIZER_WIDTH).max(MIN_FOCUS_PANE_WIDTH);
    width.round().clamp(MIN_FOCUS_PANE_WIDTH, max_width)
}

fn number_value(value: f64) -> Value {
    Value::Number(serde_json::Number::from(value as i64))
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

fn default_presentation(_provider: &str) -> &'static str {
    "side"
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

// Native picker for the archive script, so the path never has to be typed. Returns None when the
// dialog is dismissed. Nothing is saved here -- the caller puts the path in the settings draft, so
// the choice is still discarded if the user closes Settings without saving.
#[tauri::command]
pub async fn pick_archive_script(
    app: AppHandle,
    webview: tauri::Webview,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    crate::webviews::ensure_control_webview(&webview)?;

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("PowerShell", &["ps1"])
        .pick_file(move |chosen| {
            let _ = tx.send(chosen);
        });

    match rx.await.map_err(|error| error.to_string())? {
        Some(file_path) => {
            let path = file_path.into_path().map_err(|error| error.to_string())?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}

// Run the user's archive script for one recorded run. The script path comes from settings and is
// never assembled from anything the app received over the network; the snapshot id is the only
// argument and is checked against the same shape snapshot_save enforces for file names.
//
// Reachable from the control pane only (SPEC 6.1 gives provider webviews no permissions), so the
// pages loaded from chatgpt.com and friends cannot invoke this.
//
// `confirm` carries the already-translated prompt, or None to run straight away. The wording comes
// from the frontend because that is where the i18n table lives; the decision to ask is the
// archiveConfirm setting. Returns Ok(None) when the user answers no.
#[tauri::command]
pub async fn run_archive_script(
    app: AppHandle,
    webview: tauri::Webview,
    snapshot_id: String,
    confirm: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    crate::webviews::ensure_control_webview(&webview)?;
    crate::snapshots::validate_snapshot_id(&snapshot_id)?;

    let settings = read_settings(&settings_path(&app)?)?;
    let script = settings
        .get("archiveScript")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    if script.is_empty() || !is_archive_script_path(&script) {
        return Err("no archive script configured".to_string());
    }
    if !Path::new(&script).is_file() {
        return Err(format!("archive script not found: {script}"));
    }

    // Asked after the checks, so a misconfigured path fails with the real reason instead of making
    // the user approve a run that was never going to start.
    if let Some(message) = confirm {
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.dialog()
            .message(message)
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancel)
            .show(move |approved| {
                let _ = tx.send(approved);
            });
        if !rx.await.map_err(|error| error.to_string())? {
            return Ok(None);
        }
    }

    let output = tauri::async_runtime::spawn_blocking(move || run_in_powershell(&script, &snapshot_id))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?;

    // The script's own last words, not a generic "failed" -- when an unattended-looking button goes
    // wrong the reason has to reach the user, and stderr is where PowerShell puts it.
    //
    // UTF-8 or nothing. A script whose stdout is redirected with no console attached gets encoded in
    // the system ANSI codepage unless it says otherwise, and lossy-decoding that paints the notice
    // with replacement characters. Empty instead: the caller then falls back to the snapshot id,
    // which at least names the run.
    let tail = |bytes: &[u8]| {
        std::str::from_utf8(bytes)
            .unwrap_or("")
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("")
            .trim()
            .to_string()
    };
    if output.status.success() {
        Ok(Some(tail(&output.stdout)))
    } else {
        let reason = tail(&output.stderr);
        let reason = if reason.is_empty() { tail(&output.stdout) } else { reason };
        Err(format!("exit {}: {reason}", output.status.code().unwrap_or(-1)))
    }
}

/// pwsh (PowerShell 7) first, powershell.exe only if it is missing.
///
/// Windows PowerShell 5.1 decodes a `.ps1` that carries no UTF-8 BOM using the ANSI codepage, so a
/// script holding any non-ASCII -- a path, a message -- arrives as mojibake and normally dies as a
/// parser error rather than anything that names encoding. pwsh reads UTF-8 whether or not there is a
/// BOM. Preferring it means the user's script does not have to be saved a particular way.
#[cfg(windows)]
fn run_in_powershell(script: &str, snapshot_id: &str) -> std::io::Result<std::process::Output> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let mut missing = None;
    for shell in ["pwsh.exe", "powershell.exe"] {
        let attempt = std::process::Command::new(shell)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                script,
                "-SnapshotId",
                snapshot_id,
            ])
            // Without this a console window flashes up on every click.
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        match attempt {
            // Only "this shell is not installed" is worth falling through on. A script that ran and
            // failed is an answer, and retrying it in the other shell would run it twice.
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => missing = Some(error),
            settled => return settled,
        }
    }
    Err(missing.expect("loop records the last NotFound before falling through"))
}

// notes: pwsh only off Windows -- Windows PowerShell does not exist there. Untested; this build
//        target has no user for the feature yet. Drop the arm if that stays true.
#[cfg(not(windows))]
fn run_in_powershell(script: &str, snapshot_id: &str) -> std::io::Result<std::process::Output> {
    std::process::Command::new("pwsh")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-File",
            script,
            "-SnapshotId",
            snapshot_id,
        ])
        .output()
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
    use super::{normalize_settings_value, read_settings, write_settings, ARCHIVE_LABEL_MAX_CHARS};
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

    // The button hands this path to a child process, so anything but an absolute .ps1 has to be
    // dropped at normalization -- a relative path resolves against the app's cwd, which is not
    // anywhere the user chose, and a non-.ps1 means the setting was filled in by mistake.
    #[test]
    fn archive_script_setting_keeps_only_absolute_ps1_paths() {
        let script = if cfg!(windows) {
            "C:\\Users\\me\\archive.ps1"
        } else {
            "/home/me/archive.ps1"
        };
        let kept = normalize_settings_value(json!({ "archiveScript": script }));
        assert_eq!(kept.get("archiveScript").unwrap(), script);

        for rejected in [
            "archive.ps1",           // relative
            "..\\archive.ps1",       // relative, climbing
            "C:\\tools\\archive.js", // not a script we run
            "C:\\tools\\archive",    // no extension
            "",
        ] {
            let normalized = normalize_settings_value(json!({ "archiveScript": rejected }));
            assert_eq!(
                normalized.get("archiveScript").unwrap(),
                "",
                "should have been rejected: {rejected}"
            );
        }
    }

    // The caption goes straight into the toolbar, so a pasted paragraph or a newline would either
    // break the row or smuggle a line break into a flex item.
    #[test]
    fn archive_label_is_trimmed_stripped_of_control_chars_and_capped() {
        let label = |value: &str| {
            normalize_settings_value(json!({ "archiveLabel": value }))
                .get("archiveLabel")
                .unwrap()
                .as_str()
                .unwrap()
                .to_string()
        };
        assert_eq!(label("  存到 Obsidian  "), "存到 Obsidian");
        assert_eq!(label("存到\nObsidian"), "存到Obsidian");
        assert_eq!(label(&"x".repeat(40)), "x".repeat(ARCHIVE_LABEL_MAX_CHARS));
        assert_eq!(label(""), "");
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
                "archiveScript": "",
                "archiveLabel": "",
                "archiveConfirm": true,
                "presentation": {
                    "chatgpt": "side",
                    "claude": "side",
                    "gemini": "side",
                    "grok": "side"
                }
            })
        );
        assert_eq!(
            normalize_settings_value(json!({
                "snapshotPersistence": true,
                "snapshotRedactionTier": "full-local",
                "archiveScript": "",
                "archiveLabel": "",
                "archiveConfirm": true,
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
                "archiveScript": "",
                "archiveLabel": "",
                "archiveConfirm": true,
                "presentation": {
                    "chatgpt": "chip",
                    "claude": "center",
                    "gemini": "side",
                    "grok": "side"
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
                "archiveScript": "",
                "archiveLabel": "",
                "archiveConfirm": true,
                "presentation": {
                    "chatgpt": "center",
                    "claude": "side",
                    "gemini": "side",
                    "grok": "side"
                }
            })
        );
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
