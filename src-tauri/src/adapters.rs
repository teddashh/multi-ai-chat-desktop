use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{OnceLock, RwLock};
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::settings;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Adapter {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    #[serde(rename = "adapterVersion")]
    pub adapter_version: u32,
    pub provider: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub urls: AdapterUrls,
    #[serde(rename = "inputSelectors")]
    pub input_selectors: Vec<String>,
    #[serde(rename = "sendButtonSelectors")]
    pub send_button_selectors: Vec<String>,
    #[serde(rename = "responseSelectors")]
    pub response_selectors: Vec<String>,
    #[serde(rename = "loginDetectors")]
    pub login_detectors: Vec<String>,
    #[serde(rename = "loggedOutDetectors", default)]
    pub logged_out_detectors: Vec<String>,
    #[serde(rename = "thinkingDetectors", default)]
    pub thinking_detectors: Vec<serde_json::Value>,
    #[serde(rename = "stopButtonSelectors", default)]
    pub stop_button_selectors: Vec<String>,
    #[serde(rename = "inputStrategy")]
    pub input_strategy: String,
    #[serde(rename = "sendStrategy")]
    pub send_strategy: String,
    pub timing: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AdapterUrls {
    pub app: String,
    pub login: String,
    #[serde(rename = "match")]
    pub match_patterns: Vec<String>,
    #[serde(rename = "ssoMatch", default)]
    pub sso_match: Vec<String>,
}

static ADAPTERS: OnceLock<HashMap<String, Adapter>> = OnceLock::new();
static BROKEN_ADAPTERS: OnceLock<HashSet<String>> = OnceLock::new();
static OVERRIDES: OnceLock<RwLock<HashMap<String, Adapter>>> = OnceLock::new();
static REFRESH_LOCK: OnceLock<tauri::async_runtime::Mutex<()>> = OnceLock::new();

const ADAPTER_FETCH_CAP: usize = 64 * 1024;
const DEFAULT_ADAPTER_BASE: &str =
    "https://raw.githubusercontent.com/teddashh/multi-ai-chat-desktop/main/adapters";

fn overrides() -> &'static RwLock<HashMap<String, Adapter>> {
    OVERRIDES.get_or_init(|| RwLock::new(HashMap::new()))
}

fn refresh_lock() -> &'static tauri::async_runtime::Mutex<()> {
    REFRESH_LOCK.get_or_init(|| tauri::async_runtime::Mutex::new(()))
}

fn set_override(provider: &str, adapter: Adapter) {
    if let Ok(mut map) = overrides().write() {
        map.insert(provider.to_string(), adapter);
    }
}

fn overlay_version(provider: &str) -> u32 {
    overrides()
        .read()
        .ok()
        .and_then(|map| map.get(provider).map(|adapter| adapter.adapter_version))
        .unwrap_or(0)
}

fn bundled_version(provider: &str) -> u32 {
    adapters()
        .get(provider)
        .map(|adapter| adapter.adapter_version)
        .unwrap_or(0)
}

fn current_version(provider: &str) -> u32 {
    overlay_version(provider).max(bundled_version(provider))
}

#[tauri::command]
pub async fn adapter_push(
    app: tauri::AppHandle,
    webview: tauri::Webview,
    provider: String,
) -> Result<(), String> {
    crate::webviews::ensure_control_webview(&webview)?;
    crate::webviews::push_engine_and_adapter(&app, &provider)
}

#[tauri::command]
pub async fn report_broken(
    app: tauri::AppHandle,
    webview: tauri::Webview,
    provider: String,
) -> Result<String, String> {
    crate::webviews::ensure_control_webview(&webview)?;
    let adapter = get_adapter(&provider)?;
    let label = format!("ai-{provider}");
    let target = app
        .get_webview(&label)
        .ok_or_else(|| format!("provider not open: {provider}"))?;
    let adapter_json = serde_json::to_string(&adapter).map_err(|error| error.to_string())?;
    let app_version =
        serde_json::to_string(&app.package_info().version.to_string()).map_err(|error| error.to_string())?;
    let js = format!(
        "window.__MAC_REPORT__ ? window.__MAC_REPORT__.collect({adapter_json}, {app_version}) : null"
    );
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let sender = std::sync::Arc::new(std::sync::Mutex::new(Some(sender)));
    let callback_sender = sender.clone();
    target
        .eval_with_callback(js, move |result| {
            if let Ok(mut sender) = callback_sender.lock() {
                if let Some(sender) = sender.take() {
                    let _ = sender.send(result);
                }
            }
        })
        .map_err(|error| error.to_string())?;
    let raw = tokio::time::timeout(std::time::Duration::from_secs(5), receiver)
        .await
        .map_err(|_| "report diagnostics timed out".to_string())?
        .map_err(|_| "report diagnostics channel closed".to_string())?;
    if raw.trim() == "null" {
        return Err("diagnostics unavailable - open the provider and try again".to_string());
    }
    Ok(raw)
}

#[tauri::command]
pub async fn open_adapter_issue(
    app: tauri::AppHandle,
    webview: tauri::Webview,
    provider: String,
    body: String,
) -> Result<(), String> {
    crate::webviews::ensure_control_webview(&webview)?;
    let title = format!("[adapter-broken] {provider}");
    let mut url = tauri::Url::parse("https://github.com/teddashh/multi-ai-chat-desktop/issues/new")
        .map_err(|error| error.to_string())?;
    url.query_pairs_mut()
        .append_pair("labels", "adapter-broken")
        .append_pair("title", &title)
        .append_pair("body", &body);
    let url = url.to_string();
    const MAX_ISSUE_URL: usize = 7500; // GitHub issue-prefill URL ceiling is ~8 KB
    if url.len() > MAX_ISSUE_URL {
        return Err(
            "report is too large to prefill a GitHub issue - please file it manually".to_string(),
        );
    }
    if url.starts_with("https://") {
        app.opener()
            .open_url(url.as_str(), None::<&str>)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn get_adapter(provider: &str) -> Result<Adapter, String> {
    if let Some(adapter) = overrides()
        .read()
        .ok()
        .and_then(|map| map.get(provider).cloned())
    {
        return Ok(adapter);
    }
    adapters()
        .get(provider)
        .cloned()
        .ok_or_else(|| format!("unknown provider: {provider}"))
}

pub(crate) fn all_provider_states() -> Vec<String> {
    let mut providers = vec!["chatgpt", "claude", "gemini", "grok"]
        .into_iter()
        .map(str::to_string)
        .collect::<Vec<_>>();
    providers.sort();
    providers
}

pub(crate) fn broken_adapters() -> HashSet<String> {
    init_adapters();
    BROKEN_ADAPTERS.get().cloned().unwrap_or_default()
}

fn adapters() -> &'static HashMap<String, Adapter> {
    init_adapters();
    ADAPTERS.get().expect("adapters OnceLock initialized")
}

fn init_adapters() {
    if ADAPTERS.get().is_some() {
        return;
    }
    let mut map = HashMap::new();
    let mut broken = HashSet::new();
    for (provider, text) in [
        ("chatgpt", include_str!("../../adapters/chatgpt.json")),
        ("claude", include_str!("../../adapters/claude.json")),
        ("gemini", include_str!("../../adapters/gemini.json")),
        ("grok", include_str!("../../adapters/grok.json")),
    ] {
        match serde_json::from_str::<Adapter>(text)
            .map_err(|error| error.to_string())
            .and_then(|adapter| {
                validate_adapter(&adapter)?;
                Ok(adapter)
            }) {
            Ok(adapter) => {
                map.insert(provider.to_string(), adapter);
            }
            Err(error) => {
                eprintln!("[MAC adapters] bundled adapter {provider} invalid: {error}");
                broken.insert(provider.to_string());
            }
        }
    }
    let _ = BROKEN_ADAPTERS.set(broken);
    let _ = ADAPTERS.set(map);
}

pub(crate) fn validate_adapter(adapter: &Adapter) -> Result<(), String> {
    if adapter.schema_version != 1 {
        return Err("unsupported schemaVersion".into());
    }
    if adapter.adapter_version == 0 {
        return Err("adapterVersion must be positive".into());
    }
    for (name, values) in [
        ("urls.match", &adapter.urls.match_patterns),
        ("inputSelectors", &adapter.input_selectors),
        ("sendButtonSelectors", &adapter.send_button_selectors),
        ("responseSelectors", &adapter.response_selectors),
        ("loginDetectors", &adapter.login_detectors),
    ] {
        if values.is_empty() {
            return Err(format!("{name} must be non-empty"));
        }
    }
    if !matches!(
        adapter.input_strategy.as_str(),
        "default" | "prosemirror-paste" | "quill-angular"
    ) {
        return Err("invalid inputStrategy".into());
    }
    if !matches!(adapter.send_strategy.as_str(), "click" | "enter") {
        return Err("invalid sendStrategy".into());
    }
    Ok(())
}

pub(crate) fn url_allowed_for_provider(provider: &str, url: &tauri::Url) -> Result<bool, String> {
    let adapter = get_adapter(provider)?;
    if login_url_matches(&adapter.urls.login, url) {
        return Ok(true);
    }
    if adapter
        .urls
        .match_patterns
        .iter()
        .any(|pattern| url_matches(pattern, url))
    {
        return Ok(true);
    }
    Ok(false)
}

pub(crate) fn url_allowed_for_sso(provider: &str, url: &tauri::Url) -> Result<bool, String> {
    const SHARED: &[&str] = &[
        "accounts.google.com",
        "accounts.youtube.com",
        "appleid.apple.com",
        "login.microsoftonline.com",
        "login.live.com",
        "github.com",
    ];
    let host = url.host_str().unwrap_or_default();
    if SHARED.contains(&host) {
        return Ok(true);
    }
    let adapter = get_adapter(provider)?;
    Ok(adapter
        .urls
        .sso_match
        .iter()
        .any(|pattern| url_matches(pattern, url)))
}

pub(crate) fn url_matches_provider_app(provider: &str, url: &tauri::Url) -> Result<bool, String> {
    let adapter = get_adapter(provider)?;
    Ok(adapter
        .urls
        .match_patterns
        .iter()
        .any(|pattern| url_matches(pattern, url)))
}

fn build_source_url(base: Option<&str>, provider: &str) -> Result<String, String> {
    let url = match base {
        Some(base) => format!("{}/{provider}.json", base.trim_end_matches('/')),
        None => format!("{DEFAULT_ADAPTER_BASE}/{provider}.json"),
    };
    if !url.starts_with("https://") {
        return Err(format!("adapter base URL must be https: {url}"));
    }
    Ok(url)
}

/// Returns Some(kind) if the fetched version should be applied; None to skip.
fn apply_decision(fetched: u32, current: u32, allow_downgrade: bool) -> Option<&'static str> {
    if fetched > current {
        Some("updated")
    } else if fetched == current {
        None
    } else if allow_downgrade {
        Some("downgraded")
    } else {
        None
    }
}

fn url_matches(pattern: &str, url: &tauri::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    if let Some(prefix) = pattern.strip_suffix("/*") {
        let host = url.host_str().unwrap_or_default();
        let prefix = prefix.trim_start_matches("https://");
        host == prefix
    } else {
        tauri::Url::parse(pattern).ok().is_some_and(|expected| {
            expected.scheme() == "https"
                && expected.host_str() == url.host_str()
                && url.path().starts_with(expected.path())
        })
    }
}

fn cache_path(app: &tauri::AppHandle, provider: &str) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("adapters-cache")
        .join(format!("{provider}.json")))
}

fn hydrate_from_cache(app: &tauri::AppHandle, provider: &str) {
    let Ok(path) = cache_path(app, provider) else {
        return;
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return;
    };
    let Ok(adapter) = serde_json::from_str::<Adapter>(&text) else {
        return;
    };
    if validate_adapter(&adapter).is_err() || adapter.provider != provider {
        return;
    }
    if adapter.adapter_version >= bundled_version(provider)
        && adapter.adapter_version > overlay_version(provider)
    {
        set_override(provider, adapter);
    }
}

async fn fetch_adapter_text(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client.get(url).send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "fetch {}: {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or("error")
        ));
    }
    if let Some(len) = response.content_length() {
        if len as usize > ADAPTER_FETCH_CAP {
            return Err(format!("adapter file too large: {len} bytes"));
        }
    }
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    if bytes.len() > ADAPTER_FETCH_CAP {
        return Err(format!("adapter file too large: {} bytes", bytes.len()));
    }
    String::from_utf8(bytes.to_vec()).map_err(|error| error.to_string())
}

fn emit_notice(app: &tauri::AppHandle, provider: &str, kind: &str, message: &str, version: Option<u32>) {
    let payload = serde_json::json!({
        "provider": provider,
        "kind": kind,
        "message": message,
        "version": version,
    });
    let _ = app.emit_to("main", "adapter://notice", payload);
}

async fn refresh_one(app: &tauri::AppHandle, provider: &str, allow_downgrade: bool) {
    let before_cache_version = overlay_version(provider);
    hydrate_from_cache(app, provider);
    if overlay_version(provider) > before_cache_version {
        let _ = crate::webviews::push_engine_and_adapter(app, provider);
    }

    let base = settings::adapter_base_url(app).unwrap_or_default();
    let url = match build_source_url(base.as_deref(), provider) {
        Ok(url) => url,
        Err(err) => {
            if allow_downgrade {
                emit_notice(app, provider, "fetch-failed", &err, None);
            }
            return;
        }
    };

    let text = match fetch_adapter_text(&url).await {
        Ok(text) => text,
        Err(err) => {
            if allow_downgrade {
                #[cfg(debug_assertions)]
                eprintln!("adapter fetch failed for {provider}: {err}");
                emit_notice(app, provider, "fetch-failed", "network or HTTP error", None);
            }
            return;
        }
    };

    let adapter = match serde_json::from_str::<Adapter>(&text)
        .map_err(|error| error.to_string())
        .and_then(|adapter| {
            validate_adapter(&adapter)?;
            Ok(adapter)
        }) {
        Ok(adapter) => adapter,
        Err(err) => {
            if allow_downgrade {
                emit_notice(app, provider, "validation-failed", &err, None);
            }
            return;
        }
    };
    if adapter.provider != provider {
        if allow_downgrade {
            emit_notice(app, provider, "validation-failed", "provider mismatch", None);
        }
        return;
    }

    let Some(kind) = apply_decision(adapter.adapter_version, current_version(provider), allow_downgrade)
    else {
        return;
    };

    let version = adapter.adapter_version;
    if let Ok(path) = cache_path(app, provider) {
        let _ = settings::write_atomic(&path, text.as_bytes());
    }
    set_override(provider, adapter);
    let _ = crate::webviews::push_engine_and_adapter(app, provider);
    emit_notice(app, provider, kind, "", Some(version));
}

pub async fn refresh_all_adapters(app: tauri::AppHandle, allow_downgrade: bool) {
    let _guard = refresh_lock().lock().await;
    for provider in all_provider_states() {
        refresh_one(&app, &provider, allow_downgrade).await;
    }
}

fn login_url_matches(login: &str, url: &tauri::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    tauri::Url::parse(login).ok().is_some_and(|expected| {
        expected.scheme() == "https"
            && expected.host_str() == url.host_str()
            && url.path().starts_with(expected.path())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_adapters_validate() {
        for adapter in adapters().values() {
            validate_adapter(adapter).unwrap();
        }
    }

    #[test]
    fn navigation_match_table() {
        let url = tauri::Url::parse("https://chatgpt.com/c/123").unwrap();
        assert!(url_allowed_for_provider("chatgpt", &url).unwrap());
        let external = tauri::Url::parse("https://example.com").unwrap();
        assert!(!url_allowed_for_provider("chatgpt", &external).unwrap());
        let sso = tauri::Url::parse("https://accounts.google.com/o/oauth2").unwrap();
        assert!(url_allowed_for_sso("gemini", &sso).unwrap());
    }

    #[test]
    fn navigation_denies_prefix_and_non_https_bypasses() {
        for value in [
            "https://grok.community",
            "https://grok.com.evil.net",
            "http://grok.com",
        ] {
            let url = tauri::Url::parse(value).unwrap();
            assert!(!url_allowed_for_provider("grok", &url).unwrap());
        }
    }

    #[test]
    fn source_url_defaults_to_repo() {
        assert_eq!(
            build_source_url(None, "chatgpt").unwrap(),
            "https://raw.githubusercontent.com/teddashh/multi-ai-chat-desktop/main/adapters/chatgpt.json"
        );
    }

    #[test]
    fn source_url_uses_custom_base_and_trims_slash() {
        assert_eq!(
            build_source_url(Some("https://example.com/a/"), "grok").unwrap(),
            "https://example.com/a/grok.json"
        );
    }

    #[test]
    fn source_url_rejects_non_https() {
        assert!(build_source_url(Some("http://example.com"), "grok").is_err());
    }

    #[test]
    fn apply_decision_gates_versions() {
        assert_eq!(apply_decision(5, 3, false), Some("updated"));
        assert_eq!(apply_decision(3, 3, false), None);
        assert_eq!(apply_decision(2, 3, false), None);
        assert_eq!(apply_decision(2, 3, true), Some("downgraded"));
    }
}
