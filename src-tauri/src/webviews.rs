use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::{self, Write},
    sync::{Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    utils::config::BackgroundThrottlingPolicy,
    webview::{NewWindowResponse, WebviewBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl,
};
use tauri_plugin_opener::OpenerExt;

use crate::{adapters, bridge::BridgeMessage};

const BOOTSTRAP_JS: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/gen/injected/bootstrap.js"
));
const ENGINE_JS: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/gen/injected/engine.js"
));
const PROVIDER_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";
/// Auto-deny site permission prompts that otherwise pop a blocking native dialog.
/// SCOPE: Notifications + Geolocation ONLY. We intentionally leave microphone/camera alone so the
/// providers' voice-input buttons keep working. Runs at document-start, before site scripts.
const PERMISSION_SHIM_JS: &str = r#"(function () {
  try {
    if (typeof Notification !== 'undefined') {
      try { Object.defineProperty(Notification, 'permission', { get: function () { return 'denied'; }, configurable: true }); } catch (e) {}
      try { Notification.requestPermission = function (cb) { if (typeof cb === 'function') { try { cb('denied'); } catch (e) {} } return Promise.resolve('denied'); }; } catch (e) {}
    }
    if (navigator.geolocation) {
      var denyGeo = function (_s, err) { if (typeof err === 'function') { try { err({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); } catch (e) {} } };
      try { navigator.geolocation.getCurrentPosition = function (s, err) { denyGeo(s, err); }; } catch (e) {}
      try { navigator.geolocation.watchPosition = function (s, err) { denyGeo(s, err); return 0; }; } catch (e) {}
    }
    if (navigator.permissions && navigator.permissions.query) {
      var origQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = function (desc) {
        try {
          if (desc && (desc.name === 'notifications' || desc.name === 'geolocation')) {
            return Promise.resolve({ state: 'denied', status: 'denied', onchange: null, addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return false; } });
          }
        } catch (e) {}
        return origQuery(desc);
      };
    }
  } catch (e) {}
})();"#;

fn provider_uses_permission_shim(provider: &str) -> bool {
    provider != "grok"
}

fn challenge_auxiliary_navigation_allowed(provider: &str, url: &tauri::Url) -> bool {
    provider == "grok" && url.scheme() == "about" && matches!(url.path(), "blank" | "srcdoc")
}

#[derive(Debug, Clone, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderState {
    pub provider: String,
    pub webview: String,
    pub dom: String,
    pub login: String,
    pub thinking: bool,
    #[serde(rename = "lastStatusAt")]
    pub last_status_at: u64,
    pub bridge: String,
    #[serde(rename = "bridgeReason")]
    pub bridge_reason: Option<String>,
    pub adapter: String,
}

#[derive(Default)]
struct ProviderRuntime {
    states: HashMap<String, ProviderState>,
    engine_boot: HashMap<String, String>,
    bridge_boot: HashMap<String, String>,
    last_push_ms: HashMap<String, u64>,
    stale_check_sent: HashMap<String, u64>,
    watchdog_started: bool,
}

static RUNTIME: OnceLock<Mutex<ProviderRuntime>> = OnceLock::new();

fn runtime() -> &'static Mutex<ProviderRuntime> {
    RUNTIME.get_or_init(|| Mutex::new(ProviderRuntime::default()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NewWindowAction {
    /// Platform-native popup (OAuth / allowlisted window.open) — return NewWindowResponse::Allow.
    AllowPopup,
    /// Emit nav://blocked + open system browser, then Deny.
    DenyExternal,
    /// Silent Deny (sentinel / non-http).
    DenySilent,
}

fn decide_new_window_action(url: &tauri::Url, allowlisted: bool) -> NewWindowAction {
    if url.host_str() == Some("mac-bridge.invalid") {
        return NewWindowAction::DenySilent;
    }
    if allowlisted {
        return NewWindowAction::AllowPopup;
    }
    if url.scheme() == "https" || url.scheme() == "http" {
        return NewWindowAction::DenyExternal;
    }
    NewWindowAction::DenySilent
}

#[tauri::command]
pub async fn provider_open(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
    bounds: Bounds,
) -> Result<ProviderState, String> {
    ensure_control_webview(&webview)?;
    let adapter = adapters::get_adapter(&provider)?;
    let label = provider_label(&provider);
    if let Some(webview) = app.get_webview(&label) {
        webview.show().map_err(|error| error.to_string())?;
        webview.set_focus().map_err(|error| error.to_string())?;
        set_webview_bounds(&webview, &bounds)?;
        let state = current_state(&provider);
        return Ok(state);
    }
    start_staleness_watchdog(&app);
    set_state(
        &app,
        state_with(&provider, "creating", "unknown", "unknown", false),
    );

    let window = app
        .get_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let profile_dir = app_data.join("webviews").join(&provider);
    std::fs::create_dir_all(&profile_dir).map_err(|error| error.to_string())?;
    let url = adapter
        .urls
        .app
        .parse()
        .map_err(|error| format!("invalid provider URL: {error}"))?;

    let init_script = format!(
        "window.__MAC_PROVIDER__ = {};\n{}",
        serde_json::to_string(&provider).map_err(|error| error.to_string())?,
        BOOTSTRAP_JS
    );
    let nav_app = app.clone();
    let nav_provider = provider.clone();
    let popup_app = app.clone();
    let popup_provider = provider.clone();
    // Inbound-hint transport: the document.title codec (SPEC §7). Cross-platform via Tauri's
    // WebviewBuilder hook — wry implements the underlying observer natively on WebView2 (Windows),
    // WKWebView KVO (macOS), and WebKitGTK (Linux), and it fires for child webviews. This replaces
    // the old Windows-only `register_title_watcher` (whose non-Windows branch was a no-op stub).
    let title_app = app.clone();
    let title_provider = provider.clone();
    let builder =
        WebviewBuilder::new(&label, WebviewUrl::External(url)).initialization_script(&init_script);
    // Cloudflare Turnstile requires standard, unmodified browser APIs in embedded WebViews.
    // Grok is Cloudflare-protected, so do not monkey-patch navigator.permissions,
    // Notification, or geolocation in its top page or challenge frames.
    let builder = if provider_uses_permission_shim(&provider) {
        builder.initialization_script_for_all_frames(PERMISSION_SHIM_JS)
    } else {
        builder
    };
    let builder = builder
        .data_directory(profile_dir)
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .additional_browser_args(PROVIDER_BROWSER_ARGS)
        .on_document_title_changed(move |_webview, title| {
            let _ = crate::bridge::ingest_title(&title_app, &title_provider, &title);
        })
        .on_navigation(move |url| {
            if url.host_str() == Some("mac-bridge.invalid") {
                return false;
            }
            if challenge_auxiliary_navigation_allowed(&nav_provider, url)
                || adapters::url_allowed_for_provider(&nav_provider, url).unwrap_or(false)
                || adapters::url_allowed_for_sso(&nav_provider, url).unwrap_or(false)
            {
                return true;
            }
            if url.scheme() == "https" || url.scheme() == "http" {
                if let Some(host) = url.host_str() {
                    let _ = nav_app.emit_to(
                        "main",
                        "nav://blocked",
                        serde_json::json!({ "provider": &nav_provider, "host": host }),
                    );
                }
                let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        .on_new_window(move |url, _features| {
            // Challenge auxiliary about: documents are allowed only as in-webview navigation.
            // Keep all non-HTTP(S) popups fail-closed; Turnstile does not require popup windows.
            let allowlisted = adapters::url_allowed_for_provider(&popup_provider, &url)
                .unwrap_or(false)
                || adapters::url_allowed_for_sso(&popup_provider, &url).unwrap_or(false);
            match decide_new_window_action(&url, allowlisted) {
                NewWindowAction::AllowPopup => NewWindowResponse::Allow,
                NewWindowAction::DenySilent => NewWindowResponse::Deny,
                NewWindowAction::DenyExternal => {
                    if let Some(host) = url.host_str() {
                        let _ = popup_app.emit_to(
                            "main",
                            "nav://blocked",
                            serde_json::json!({ "provider": &popup_provider, "host": host }),
                        );
                    }
                    let _ = popup_app.opener().open_url(url.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                }
            }
        });

    let webview = window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width, bounds.height),
        )
        .map_err(|error| error.to_string())?;
    webview.show().map_err(|error| error.to_string())?;
    let state = state_with(&provider, "loaded", "unknown", "unknown", false);
    set_state(&app, state.clone());
    Ok(state)
}

#[tauri::command]
pub async fn provider_close(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
) -> Result<(), String> {
    ensure_control_webview(&webview)?;
    let label = provider_label(&provider);
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|error| error.to_string())?;
    }
    if let Ok(mut guard) = runtime().lock() {
        guard.engine_boot.remove(&provider);
        guard.bridge_boot.remove(&provider);
        guard.last_push_ms.remove(&provider);
    }
    set_state(
        &app,
        state_with(&provider, "none", "unknown", "unknown", false),
    );
    Ok(())
}

#[tauri::command]
pub async fn provider_show(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
    focus: Option<bool>,
) -> Result<(), String> {
    ensure_control_webview(&webview)?;
    let label = provider_label(&provider);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("webview not found: {label}"))?;
    webview.show().map_err(|error| error.to_string())?;
    if focus.unwrap_or(true) {
        webview.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn provider_hide(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
) -> Result<(), String> {
    ensure_control_webview(&webview)?;
    let label = provider_label(&provider);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("webview not found: {label}"))?;
    webview.hide().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn provider_set_bounds(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
    bounds: Bounds,
) -> Result<(), String> {
    ensure_control_webview(&webview)?;
    let label = provider_label(&provider);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("webview not found: {label}"))?;
    set_webview_bounds(&webview, &bounds)
}

#[tauri::command]
pub async fn provider_eval(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
    js: String,
) -> Result<(), String> {
    ensure_control_webview(&webview)?;
    eval_provider(&app, &provider, &js)
}

#[tauri::command]
pub async fn provider_eval_with_callback(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
    js: String,
) -> Result<String, String> {
    ensure_control_webview(&webview)?;
    let label = provider_label(&provider);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("webview not found: {label}"))?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let sender = std::sync::Arc::new(std::sync::Mutex::new(Some(sender)));
    let callback_sender = sender.clone();
    webview
        .eval_with_callback(js, move |result| {
            if let Ok(mut sender) = callback_sender.lock() {
                if let Some(sender) = sender.take() {
                    let _ = sender.send(result);
                }
            }
        })
        .map_err(|error| error.to_string())?;
    tokio::time::timeout(Duration::from_secs(5), receiver)
        .await
        .map_err(|_| "eval_with_callback timed out".to_string())?
        .map_err(|_| "eval_with_callback response channel closed".to_string())
}

#[tauri::command]
pub async fn provider_open_login(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
) -> Result<(), String> {
    ensure_control_webview(&webview)?;
    let adapter = adapters::get_adapter(&provider)?;
    if app.get_webview(&provider_label(&provider)).is_none() {
        let bounds = Bounds {
            x: 24.0,
            y: 24.0,
            width: 420.0,
            height: 320.0,
        };
        let _ = provider_open(app.clone(), webview.clone(), provider.clone(), bounds).await?;
    }
    let js = format!(
        "location.href = {};",
        serde_json::to_string(&adapter.urls.login).map_err(|error| error.to_string())?
    );
    eval_provider(&app, &provider, &js)?;
    provider_show(app, webview, provider, Some(true)).await
}

#[tauri::command]
pub async fn provider_open_login_external(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
) -> Result<(), String> {
    ensure_control_webview(&webview)?;
    let adapter = adapters::get_adapter(&provider)?;
    app.opener()
        .open_url(adapter.urls.login.as_str(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn provider_reload(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
) -> Result<(), String> {
    ensure_control_webview(&webview)?;
    reset_bridge_state(&app, &provider);
    eval_provider(&app, &provider, "location.reload();")
}

#[tauri::command]
pub async fn provider_new_session(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
) -> Result<(), String> {
    ensure_control_webview(&webview)?;
    if app.get_webview(&provider_label(&provider)).is_none() {
        return Ok(());
    }
    let adapter = adapters::get_adapter(&provider)?;
    reset_bridge_state(&app, &provider);
    let js = format!(
        "location.href = {};",
        serde_json::to_string(&adapter.urls.app).map_err(|error| error.to_string())?
    );
    eval_provider(&app, &provider, &js)
}

#[tauri::command]
pub async fn connections_get(webview: tauri::Webview) -> Result<Vec<ProviderState>, String> {
    ensure_control_webview(&webview)?;
    let guard = runtime()
        .lock()
        .map_err(|_| "provider state poisoned".to_string())?;
    let mut states = Vec::new();
    for provider in adapters::all_provider_states() {
        states.push(guard.states.get(&provider).cloned().unwrap_or_else(|| {
            let mut state = state_with(&provider, "none", "unknown", "unknown", false);
            if adapters::broken_adapters().contains(&provider) {
                state.adapter = "broken".into();
            }
            state
        }));
    }
    Ok(states)
}

/// Dev-only stdout logger for the M1 live-gate harness.
#[tauri::command]
pub async fn dev_log(
    app: AppHandle,
    webview: tauri::Webview,
    message: String,
) -> Result<(), String> {
    ensure_control_webview(&webview)?;
    if !cfg!(debug_assertions) {
        let _ = app;
        return Ok(());
    }
    if message == "__M1GATE_EXIT__" {
        println!("[M1GATE] exit requested; shutting down");
        app.exit(0);
        return Ok(());
    }
    println!("{message}");
    let _ = io::stdout().flush();
    Ok(())
}

pub(crate) fn handle_bridge_title(
    app: &AppHandle,
    provider: &str,
    msg: &BridgeMessage,
) -> Result<(), String> {
    if msg.action != "STATUS_REPORT" {
        return Ok(());
    }
    if should_reset_bridge_on_boot_rotation(provider, msg.boot_id.as_deref()) {
        let mut state = current_state(provider);
        state.bridge = "ok".into();
        state.bridge_reason = None;
        if let Ok(mut guard) = runtime().lock() {
            guard.bridge_boot.remove(provider);
        }
        set_state(app, state);
    }
    let payload = msg.payload.as_ref();
    if let Some(payload) = payload {
        let dom = payload.get("dom").and_then(|v| v.as_str());
        if let Some("unknown") = dom {
            let boot = msg.boot_id.clone().unwrap_or_default();
            let should_push = current_url_matches_provider(app, provider)? && {
                let guard = runtime()
                    .lock()
                    .map_err(|_| "provider state poisoned".to_string())?;
                let already_pushed = guard.engine_boot.get(provider) == Some(&boot);
                (!already_pushed || can_push_now(&guard, provider))
                    && can_push_now(&guard, provider)
            };
            if should_push {
                let _ = push_engine_and_adapter(app, provider);
                if let Ok(mut guard) = runtime().lock() {
                    guard.engine_boot.insert(provider.to_string(), boot);
                    guard.last_push_ms.insert(provider.to_string(), now_ms());
                }
            }
        }
    }
    update_status_state(app, provider, payload, msg.boot_id.as_deref());
    Ok(())
}

fn should_reset_bridge_on_boot_rotation(provider: &str, incoming_boot: Option<&str>) -> bool {
    let state = current_state(provider);
    let last_boot = runtime()
        .lock()
        .ok()
        .and_then(|guard| guard.bridge_boot.get(provider).cloned());
    bridge_resets_on_boot_rotation(&state.bridge, last_boot.as_deref(), incoming_boot)
}

fn bridge_resets_on_boot_rotation(
    current_bridge: &str,
    last_boot: Option<&str>,
    incoming_boot: Option<&str>,
) -> bool {
    match (last_boot, incoming_boot) {
        (Some(last), Some(incoming)) => current_bridge == "degraded" && last != incoming,
        _ => false,
    }
}

pub(crate) fn push_engine_and_adapter(app: &AppHandle, provider: &str) -> Result<(), String> {
    let adapter = adapters::get_adapter(provider)?;
    let dispatch_adapter = serde_json::json!({
        "v": 1,
        "action": "ADAPTER_UPDATE",
        "provider": provider,
        "payload": adapter
    });
    let dispatch_check = serde_json::json!({
        "v": 1,
        "action": "CHECK_STATUS",
        "provider": provider
    });
    let js = format!(
        "{engine}\nwindow.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.dispatch({adapter_msg});\nwindow.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.dispatch({check_msg});",
        engine = ENGINE_JS,
        adapter_msg = serde_json::to_string(&dispatch_adapter).map_err(|error| error.to_string())?,
        check_msg = serde_json::to_string(&dispatch_check).map_err(|error| error.to_string())?,
    );
    eval_provider(app, provider, &js)
}

fn update_status_state(
    app: &AppHandle,
    provider: &str,
    payload: Option<&serde_json::Value>,
    boot_id: Option<&str>,
) {
    let mut state = current_state(provider);
    state.webview = "loaded".into();
    state.last_status_at = now_ms();
    let mut bridge_update = None;
    if let Some(payload) = payload {
        if let Some(dom) = payload.get("dom").and_then(|v| v.as_str()) {
            if dom == "ready" || dom == "unknown" {
                state.dom = dom.into();
            }
        }
        if let Some(login) = payload.get("login").and_then(|v| v.as_str()) {
            state.login = login.into();
        } else if let Some(logged_in) = payload.get("loggedIn").and_then(|v| v.as_bool()) {
            state.login = if logged_in { "logged_in" } else { "logged_out" }.into();
        }
        if let Some(thinking) = payload.get("thinking").and_then(|v| v.as_bool()) {
            state.thinking = thinking;
        }
        if let Some(bridge) = payload.get("bridge").and_then(|v| v.as_str()) {
            if bridge == "degraded" || bridge == "ok" {
                state.bridge = bridge.into();
                bridge_update = Some(bridge);
            }
        }
        if let Some(reason) = payload.get("reason").and_then(|v| v.as_str()) {
            state.bridge_reason = Some(reason.into());
        } else if state.bridge == "ok" {
            state.bridge_reason = None;
        }
    }
    if let Ok(mut guard) = runtime().lock() {
        match bridge_update {
            Some("degraded") => {
                if let Some(boot_id) = boot_id {
                    guard
                        .bridge_boot
                        .insert(provider.to_string(), boot_id.to_string());
                }
            }
            Some("ok") => {
                guard.bridge_boot.remove(provider);
            }
            _ => {}
        }
        guard.stale_check_sent.remove(provider);
    }
    set_state(app, state);
}

fn can_push_now(guard: &ProviderRuntime, provider: &str) -> bool {
    now_ms().saturating_sub(*guard.last_push_ms.get(provider).unwrap_or(&0)) >= 1000
}

fn eval_provider(app: &AppHandle, provider: &str, js: &str) -> Result<(), String> {
    let label = provider_label(provider);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("webview not found: {label}"))?;
    webview.eval(js).map_err(|error| error.to_string())
}

pub(crate) fn ensure_control_webview(webview: &tauri::Webview) -> Result<(), String> {
    if webview.label() == "main" {
        Ok(())
    } else {
        Err("command is only available to the main control webview".into())
    }
}

fn provider_label(provider: &str) -> String {
    format!("ai-{provider}")
}

fn set_webview_bounds<R: tauri::Runtime>(
    webview: &tauri::Webview<R>,
    bounds: &Bounds,
) -> Result<(), String> {
    webview
        .set_bounds(tauri::Rect {
            position: tauri::Position::Logical(LogicalPosition::new(bounds.x, bounds.y)),
            size: tauri::Size::Logical(LogicalSize::new(bounds.width, bounds.height)),
        })
        .map_err(|error| error.to_string())
}

fn current_state(provider: &str) -> ProviderState {
    runtime()
        .lock()
        .ok()
        .and_then(|guard| guard.states.get(provider).cloned())
        .unwrap_or_else(|| state_with(provider, "none", "unknown", "unknown", false))
}

fn set_state(app: &AppHandle, state: ProviderState) {
    if let Ok(mut guard) = runtime().lock() {
        guard.states.insert(state.provider.clone(), state.clone());
    }
    let _ = app.emit_to("main", "connections://update", &state);
}

fn state_with(
    provider: &str,
    webview: &str,
    dom: &str,
    login: &str,
    thinking: bool,
) -> ProviderState {
    ProviderState {
        provider: provider.into(),
        webview: webview.into(),
        dom: dom.into(),
        login: login.into(),
        thinking,
        last_status_at: now_ms(),
        bridge: "ok".into(),
        bridge_reason: None,
        adapter: if adapters::broken_adapters().contains(provider) {
            "broken"
        } else {
            "ok"
        }
        .into(),
    }
}

fn current_url_matches_provider(app: &AppHandle, provider: &str) -> Result<bool, String> {
    let label = provider_label(provider);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("webview not found: {label}"))?;
    let url = webview.url().map_err(|error| error.to_string())?;
    adapters::url_matches_provider_app(provider, &url)
}

fn reset_bridge_state(app: &AppHandle, provider: &str) {
    if let Ok(mut guard) = runtime().lock() {
        guard.engine_boot.remove(provider);
        guard.bridge_boot.remove(provider);
        guard.last_push_ms.remove(provider);
        guard.stale_check_sent.remove(provider);
    }
    let mut state = current_state(provider);
    state.bridge = "ok".into();
    state.bridge_reason = None;
    set_state(app, state);
}

fn start_staleness_watchdog(app: &AppHandle) {
    let should_start = {
        let Ok(mut guard) = runtime().lock() else {
            return;
        };
        if guard.watchdog_started {
            false
        } else {
            guard.watchdog_started = true;
            true
        }
    };
    if !should_start {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            run_staleness_check(&app);
        }
    });
}

fn run_staleness_check(app: &AppHandle) {
    let now = now_ms();
    let mut to_check = Vec::new();
    let mut to_mark_unknown = Vec::new();
    if let Ok(mut guard) = runtime().lock() {
        let providers = guard.states.values().cloned().collect::<Vec<_>>();
        for state in providers {
            match staleness_action(state.last_status_at, now, state.webview == "loaded") {
                StalenessAction::None => {}
                StalenessAction::DispatchCheck
                    if !guard.stale_check_sent.contains_key(&state.provider) =>
                {
                    guard.stale_check_sent.insert(state.provider.clone(), now);
                    to_check.push(state.provider.clone());
                }
                StalenessAction::DispatchCheck => {}
                StalenessAction::MarkUnknown => {
                    to_mark_unknown.push(state.provider.clone());
                    guard.stale_check_sent.remove(&state.provider);
                }
            }
        }
    }
    for provider in to_check {
        let msg = serde_json::json!({ "v": 1, "action": "CHECK_STATUS", "provider": provider });
        let js = format!(
            "window.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.dispatch({});",
            serde_json::to_string(&msg).unwrap_or_default()
        );
        let _ = eval_provider(app, &provider, &js);
    }
    for provider in to_mark_unknown {
        let mut state = current_state(&provider);
        state.dom = "unknown".into();
        set_state(app, state);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StalenessAction {
    None,
    DispatchCheck,
    MarkUnknown,
}

fn staleness_action(last_status_ms: u64, now_ms: u64, webview_loaded: bool) -> StalenessAction {
    if !webview_loaded {
        return StalenessAction::None;
    }
    let age = now_ms.saturating_sub(last_status_ms);
    if age > 40_000 {
        StalenessAction::MarkUnknown
    } else if age >= 30_000 {
        StalenessAction::DispatchCheck
    } else {
        StalenessAction::None
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{
        bridge_resets_on_boot_rotation, challenge_auxiliary_navigation_allowed,
        decide_new_window_action, provider_uses_permission_shim, runtime,
        should_reset_bridge_on_boot_rotation, staleness_action, state_with, NewWindowAction,
        StalenessAction, PROVIDER_BROWSER_ARGS,
    };

    fn url(input: &str) -> tauri::Url {
        tauri::Url::parse(input).expect("test URL should parse")
    }

    #[test]
    fn provider_browser_args_keep_hidden_automation_responsive() {
        assert!(PROVIDER_BROWSER_ARGS.contains("--disable-background-timer-throttling"));
        assert!(PROVIDER_BROWSER_ARGS.contains("--disable-renderer-backgrounding"));
        assert!(PROVIDER_BROWSER_ARGS.contains("--disable-backgrounding-occluded-windows"));
        assert!(PROVIDER_BROWSER_ARGS.contains("msSmartScreenProtection"));
    }

    #[test]
    fn grok_keeps_core_web_apis_unmodified_for_cloudflare_challenges() {
        assert!(!provider_uses_permission_shim("grok"));
        for provider in ["chatgpt", "claude", "gemini"] {
            assert!(provider_uses_permission_shim(provider));
        }
    }

    #[test]
    fn grok_allows_only_cloudflare_auxiliary_about_documents() {
        assert!(challenge_auxiliary_navigation_allowed(
            "grok",
            &url("about:blank")
        ));
        assert!(challenge_auxiliary_navigation_allowed(
            "grok",
            &url("about:srcdoc")
        ));
        assert!(!challenge_auxiliary_navigation_allowed(
            "chatgpt",
            &url("about:blank")
        ));
        assert!(!challenge_auxiliary_navigation_allowed(
            "grok",
            &url("data:text/plain,hello")
        ));
        assert!(!challenge_auxiliary_navigation_allowed(
            "grok",
            &url("javascript:alert(1)")
        ));
        assert!(!challenge_auxiliary_navigation_allowed(
            "grok",
            &url("about:config")
        ));
    }

    #[test]
    fn new_window_allowlisted_google_oauth_allows_popup() {
        assert_eq!(
            decide_new_window_action(
                &url("https://accounts.google.com/o/oauth2/v2/auth?client_id=test"),
                true
            ),
            NewWindowAction::AllowPopup
        );
    }

    #[test]
    fn new_window_allowlisted_provider_app_allows_popup() {
        assert_eq!(
            decide_new_window_action(&url("https://grok.com/chat"), true),
            NewWindowAction::AllowPopup
        );
    }

    #[test]
    fn new_window_non_allowlisted_https_goes_external() {
        assert_eq!(
            decide_new_window_action(&url("https://evil.example/phish"), false),
            NewWindowAction::DenyExternal
        );
    }

    #[test]
    fn new_window_non_allowlisted_http_goes_external() {
        assert_eq!(
            decide_new_window_action(&url("http://evil.example/"), false),
            NewWindowAction::DenyExternal
        );
    }

    #[test]
    fn new_window_sentinel_silently_denied_even_if_allowlisted() {
        assert_eq!(
            decide_new_window_action(&url("https://mac-bridge.invalid/bridge"), false),
            NewWindowAction::DenySilent
        );
        assert_eq!(
            decide_new_window_action(&url("https://mac-bridge.invalid/bridge"), true),
            NewWindowAction::DenySilent
        );
    }

    #[test]
    fn new_window_non_http_non_allowlisted_silently_denied() {
        assert_eq!(
            decide_new_window_action(&url("about:blank"), false),
            NewWindowAction::DenySilent
        );
        assert_eq!(
            decide_new_window_action(&url("data:text/plain,hello"), false),
            NewWindowAction::DenySilent
        );
    }

    #[test]
    fn new_window_allowlisted_true_never_goes_external() {
        assert_eq!(
            decide_new_window_action(&url("http://evil.example/"), true),
            NewWindowAction::AllowPopup
        );
        assert_eq!(
            decide_new_window_action(&url("data:text/plain,hello"), true),
            NewWindowAction::AllowPopup
        );
    }

    #[test]
    fn staleness_before_30s_does_nothing() {
        assert_eq!(staleness_action(1_000, 30_999, true), StalenessAction::None);
    }

    #[test]
    fn staleness_30_to_40s_dispatches_check() {
        assert_eq!(
            staleness_action(1_000, 31_000, true),
            StalenessAction::DispatchCheck
        );
        assert_eq!(
            staleness_action(1_000, 41_000, true),
            StalenessAction::DispatchCheck
        );
    }

    #[test]
    fn staleness_after_40s_marks_unknown() {
        assert_eq!(
            staleness_action(1_000, 41_001, true),
            StalenessAction::MarkUnknown
        );
    }

    #[test]
    fn staleness_not_loaded_does_nothing() {
        assert_eq!(
            staleness_action(1_000, 60_000, false),
            StalenessAction::None
        );
    }

    #[test]
    fn degraded_bridge_resets_only_on_new_boot() {
        assert!(!bridge_resets_on_boot_rotation(
            "degraded",
            None,
            Some("boot-b")
        ));
        assert!(!bridge_resets_on_boot_rotation(
            "degraded",
            Some("boot-a"),
            None
        ));
        assert!(!bridge_resets_on_boot_rotation(
            "degraded",
            Some("boot-b"),
            Some("boot-b")
        ));
        assert!(bridge_resets_on_boot_rotation(
            "degraded",
            Some("boot-a"),
            Some("boot-b")
        ));
        assert!(!bridge_resets_on_boot_rotation(
            "ok",
            Some("boot-a"),
            Some("boot-b")
        ));
    }

    #[test]
    fn degraded_bridge_reset_uses_bridge_boot_reference() {
        let provider = "test-bridge-boot-reference";
        {
            let mut guard = runtime().lock().expect("provider runtime lock");
            let mut state = state_with(provider, "loaded", "ready", "logged_in", false);
            state.bridge = "degraded".into();
            guard.states.insert(provider.into(), state);
            guard.engine_boot.remove(provider);
            guard.bridge_boot.insert(provider.into(), "boot-b".into());
        }

        assert!(!should_reset_bridge_on_boot_rotation(
            provider,
            Some("boot-b")
        ));
        assert!(should_reset_bridge_on_boot_rotation(
            provider,
            Some("boot-c")
        ));

        {
            let mut guard = runtime().lock().expect("provider runtime lock");
            guard.states.remove(provider);
            guard.bridge_boot.remove(provider);
            guard.engine_boot.remove(provider);
        }
    }
}
