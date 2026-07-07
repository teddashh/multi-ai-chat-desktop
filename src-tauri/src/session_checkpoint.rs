use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

const SESSION_CHECKPOINT_FILE: &str = "session-checkpoint.json";

pub(crate) fn session_checkpoint_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(session_checkpoint_path_in_dir(
        &app.path().app_data_dir().map_err(|error| error.to_string())?,
    ))
}

#[tauri::command]
pub async fn session_checkpoint_save(
    app: AppHandle,
    webview: tauri::Webview,
    json: String,
) -> Result<(), String> {
    crate::webviews::ensure_control_webview(&webview)?;
    save_session_checkpoint_to_path(&session_checkpoint_path(&app)?, &json)
}

#[tauri::command]
pub async fn session_checkpoint_load(
    app: AppHandle,
    webview: tauri::Webview,
) -> Result<Option<String>, String> {
    crate::webviews::ensure_control_webview(&webview)?;
    load_session_checkpoint_from_path(&session_checkpoint_path(&app)?)
}

#[tauri::command]
pub async fn session_checkpoint_clear(
    app: AppHandle,
    webview: tauri::Webview,
) -> Result<(), String> {
    crate::webviews::ensure_control_webview(&webview)?;
    clear_session_checkpoint_at_path(&session_checkpoint_path(&app)?)
}

fn session_checkpoint_path_in_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(SESSION_CHECKPOINT_FILE)
}

fn save_session_checkpoint_to_path(path: &Path, json: &str) -> Result<(), String> {
    crate::settings::write_atomic(path, json.as_bytes())
}

fn load_session_checkpoint_from_path(path: &Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn clear_session_checkpoint_at_path(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT_ID: AtomicUsize = AtomicUsize::new(0);

    fn unique_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "multi-ai-chat-session-checkpoint-{}-{}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::SeqCst),
            name
        ))
    }

    #[test]
    fn save_load_and_clear_round_trip() {
        let dir = unique_dir("roundtrip");
        let path = session_checkpoint_path_in_dir(&dir);
        let body = r#"{"graphId":"debate","stepIndex":2}"#;

        save_session_checkpoint_to_path(&path, body).expect("save checkpoint");
        assert_eq!(
            load_session_checkpoint_from_path(&path).expect("load checkpoint"),
            Some(body.to_string())
        );

        clear_session_checkpoint_at_path(&path).expect("clear checkpoint");
        assert_eq!(
            load_session_checkpoint_from_path(&path).expect("load cleared checkpoint"),
            None
        );

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn load_when_absent_returns_none() {
        let dir = unique_dir("missing");
        let path = session_checkpoint_path_in_dir(&dir);

        assert_eq!(
            load_session_checkpoint_from_path(&path).expect("load missing checkpoint"),
            None
        );
    }

    #[test]
    fn clear_when_absent_is_ok() {
        let dir = unique_dir("clear-missing");
        let path = session_checkpoint_path_in_dir(&dir);

        clear_session_checkpoint_at_path(&path).expect("clear missing checkpoint");
    }

    #[test]
    fn store_uses_one_fixed_file_without_caller_supplied_id() {
        let dir = unique_dir("fixed-path");
        let path = session_checkpoint_path_in_dir(&dir);

        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some(SESSION_CHECKPOINT_FILE)
        );
        assert_eq!(path.parent(), Some(dir.as_path()));
    }
}
