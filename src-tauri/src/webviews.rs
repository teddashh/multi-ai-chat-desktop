use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::{self, Write},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex, OnceLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    utils::config::BackgroundThrottlingPolicy,
    webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl,
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
const CHALLENGE_SIGNALS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../shared/challenge-signals.json"
));
const PROVIDER_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";
const NEW_SESSION_READY_TIMEOUT_SECS: u64 = 30;
const NEW_SESSION_READY_POLL_MS: u64 = 150;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChallengeSignals {
    title_signals: Vec<String>,
}

fn challenge_signals() -> &'static ChallengeSignals {
    static SIGNALS: OnceLock<ChallengeSignals> = OnceLock::new();
    SIGNALS.get_or_init(|| {
        serde_json::from_str(CHALLENGE_SIGNALS_JSON)
            .expect("shared/challenge-signals.json must be valid")
    })
}
/// Auto-deny site permission prompts that otherwise pop a blocking native dialog.
/// SCOPE: Notifications + Geolocation ONLY. We intentionally leave microphone/camera alone so the
/// providers' voice-input buttons keep working. Runs at document-start, before site scripts.
const PERMISSION_SHIM_JS: &str = r#"(function () {
  try {
    if (location.hostname === 'www.google.com' && (location.pathname === '/sorry' || location.pathname.indexOf('/sorry/') === 0)) return;
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

fn provider_uses_document_start_bridge(provider: &str) -> bool {
    provider != "grok"
}

fn grok_app_title_ready(provider: &str, title: &str) -> bool {
    if provider != "grok" {
        return false;
    }
    let normalized = title.trim().to_lowercase();
    normalized == "grok" || normalized.starts_with("grok - ") || normalized.starts_with("grok — ")
}

fn grok_bridge_install_ready(provider: &str, title: &str, url: &tauri::Url) -> bool {
    grok_app_title_ready(provider, title)
        && adapters::url_matches_provider_app(provider, url).unwrap_or(false)
}

fn grok_challenge_title_active(provider: &str, title: &str) -> bool {
    if provider != "grok" {
        return false;
    }
    let normalized = title.trim().to_lowercase();
    challenge_signals()
        .title_signals
        .iter()
        .any(|signal| normalized.contains(signal))
}

fn handle_provider_document_title(app: &AppHandle, provider: &str, title: &str) {
    let _ = crate::bridge::ingest_title(app, provider, title);
}

fn set_provider_challenge_blocked(app: &AppHandle, provider: &str) {
    let mut state = current_state(provider);
    if state.webview == "loaded"
        && state.dom == "unknown"
        && state.login == "blocked"
        && !state.thinking
    {
        return;
    }
    state.webview = "loaded".into();
    state.dom = "unknown".into();
    state.login = "blocked".into();
    state.thinking = false;
    state.last_status_at = now_ms();
    set_state(app, state);
}

fn gemini_sorry_navigation_active(provider: &str, url: &tauri::Url) -> bool {
    provider == "gemini"
        && url.scheme() == "https"
        && url.host_str() == Some("www.google.com")
        && (url.path() == "/sorry" || url.path().starts_with("/sorry/"))
}

fn challenge_auxiliary_navigation_allowed(provider: &str, url: &tauri::Url) -> bool {
    provider == "grok" && url.scheme() == "about" && matches!(url.path(), "blank" | "srcdoc")
}

fn provider_show_should_focus(focus: Option<bool>) -> bool {
    focus.unwrap_or(false)
}

#[derive(Debug, Clone, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
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
    status_boot: HashMap<String, String>,
    grok_document_epoch: HashMap<String, u64>,
    grok_adopted_boot: HashMap<String, (u64, String)>,
    grok_pending_navigation: HashMap<String, GrokNavigationPreparation>,
    pending_session_boot: HashMap<String, Option<String>>,
    last_push_ms: HashMap<String, u64>,
    stale_check_sent: HashMap<String, u64>,
    watchdog_started: bool,
}

#[derive(Debug, Clone)]
struct GrokNavigationPreparation {
    epoch: u64,
    previous_epoch: u64,
    previous_adopted_boot: Option<(u64, String)>,
    previous_status_boot: Option<String>,
}

static RUNTIME: OnceLock<Mutex<ProviderRuntime>> = OnceLock::new();

fn runtime() -> &'static Mutex<ProviderRuntime> {
    RUNTIME.get_or_init(|| Mutex::new(ProviderRuntime::default()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GrokBridgeDriveOutcome {
    Challenge,
    Installed,
    Present,
    Waiting,
    Retry,
    Ineligible,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GrokBridgeDriveResult {
    outcome: GrokBridgeDriveOutcome,
    boot_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GrokBridgeHostAction {
    Ignore,
    MarkBlocked,
}

fn prepare_grok_navigation(provider: &str) -> u64 {
    if provider != "grok" {
        return 0;
    }
    let Ok(mut guard) = runtime().lock() else {
        return 0;
    };
    if let Some(pending) = guard.grok_pending_navigation.get(provider) {
        return pending.epoch;
    }
    let previous_epoch = guard
        .grok_document_epoch
        .get(provider)
        .copied()
        .unwrap_or_default();
    let previous_adopted_boot = guard.grok_adopted_boot.remove(provider);
    let previous_status_boot = guard.status_boot.get(provider).cloned();
    let next_epoch = previous_epoch.saturating_add(1);
    guard.grok_pending_navigation.insert(
        provider.to_string(),
        GrokNavigationPreparation {
            epoch: next_epoch,
            previous_epoch,
            previous_adopted_boot,
            previous_status_boot,
        },
    );
    next_epoch
}

fn confirm_grok_page_load(provider: &str) -> u64 {
    if provider != "grok" {
        return 0;
    }
    let Ok(mut guard) = runtime().lock() else {
        return 0;
    };
    if let Some(pending) = guard.grok_pending_navigation.remove(provider) {
        guard
            .grok_document_epoch
            .insert(provider.to_string(), pending.epoch);
        guard.grok_adopted_boot.remove(provider);
        return pending.epoch;
    }
    guard.grok_adopted_boot.remove(provider);
    let epoch = guard
        .grok_document_epoch
        .entry(provider.to_string())
        .or_default();
    *epoch = epoch.saturating_add(1);
    *epoch
}

fn cancel_grok_navigation(provider: &str, prepared_epoch: u64) {
    if provider != "grok" || prepared_epoch == 0 {
        return;
    }
    let Ok(mut guard) = runtime().lock() else {
        return;
    };
    let Some(pending) = guard.grok_pending_navigation.get(provider).cloned() else {
        return;
    };
    if pending.epoch != prepared_epoch {
        return;
    }
    if guard
        .grok_document_epoch
        .get(provider)
        .copied()
        .unwrap_or_default()
        != pending.previous_epoch
    {
        return;
    }
    guard.grok_pending_navigation.remove(provider);
    match pending.previous_adopted_boot {
        Some(previous) => {
            guard
                .grok_adopted_boot
                .insert(provider.to_string(), previous);
        }
        None => {
            guard.grok_adopted_boot.remove(provider);
        }
    }
    match pending.previous_status_boot {
        Some(previous) => {
            guard.status_boot.insert(provider.to_string(), previous);
        }
        None => {
            guard.status_boot.remove(provider);
        }
    }
}

fn retire_grok_document(provider: &str) {
    if provider != "grok" {
        return;
    }
    let Ok(mut guard) = runtime().lock() else {
        return;
    };
    guard.grok_pending_navigation.remove(provider);
    guard.grok_adopted_boot.remove(provider);
    let epoch = guard
        .grok_document_epoch
        .entry(provider.to_string())
        .or_default();
    *epoch = epoch.saturating_add(1);
}

fn adopt_grok_bridge_boot(provider: &str, observed_epoch: u64, boot_id: &str) -> bool {
    if provider != "grok" || observed_epoch == 0 || boot_id.is_empty() {
        return false;
    }
    let Ok(mut guard) = runtime().lock() else {
        return false;
    };
    if guard.grok_document_epoch.get(provider).copied() != Some(observed_epoch) {
        return false;
    }
    if guard.grok_pending_navigation.contains_key(provider) {
        return false;
    }
    guard
        .grok_adopted_boot
        .insert(provider.to_string(), (observed_epoch, boot_id.to_string()));
    true
}

fn grok_bridge_result_is_current(provider: &str, observed_epoch: u64) -> bool {
    provider == "grok"
        && observed_epoch != 0
        && runtime().lock().ok().is_some_and(|guard| {
            guard.grok_document_epoch.get(provider).copied() == Some(observed_epoch)
                && !guard.grok_pending_navigation.contains_key(provider)
        })
}

fn grok_bridge_boot_is_current(provider: &str, boot_id: Option<&str>) -> bool {
    if provider != "grok" {
        return true;
    }
    let Some(boot_id) = boot_id else {
        return false;
    };
    runtime().lock().ok().is_some_and(|guard| {
        let current_epoch = guard
            .grok_document_epoch
            .get(provider)
            .copied()
            .unwrap_or_default();
        guard
            .grok_adopted_boot
            .get(provider)
            .is_some_and(|(epoch, adopted_boot)| *epoch == current_epoch && adopted_boot == boot_id)
    })
}

fn current_grok_document_epoch(provider: &str) -> u64 {
    runtime()
        .lock()
        .ok()
        .and_then(|guard| guard.grok_document_epoch.get(provider).copied())
        .unwrap_or_default()
}

fn should_drive_grok_bridge(state: &ProviderState) -> bool {
    state.provider == "grok" && state.webview == "loaded" && state.dom != "ready"
}

fn grok_bridge_drive_allowed(state: &ProviderState) -> bool {
    state.provider == "grok"
        && matches!(state.webview.as_str(), "creating" | "loaded")
        && state.dom != "ready"
}

fn grok_bridge_host_action(
    outcome: GrokBridgeDriveOutcome,
    observed_epoch: u64,
    current_epoch: u64,
    current_state: &ProviderState,
) -> GrokBridgeHostAction {
    if observed_epoch == 0
        || observed_epoch != current_epoch
        || !grok_bridge_drive_allowed(current_state)
    {
        return GrokBridgeHostAction::Ignore;
    }
    match outcome {
        GrokBridgeDriveOutcome::Challenge => GrokBridgeHostAction::MarkBlocked,
        GrokBridgeDriveOutcome::Installed
        | GrokBridgeDriveOutcome::Present
        | GrokBridgeDriveOutcome::Waiting
        | GrokBridgeDriveOutcome::Retry
        | GrokBridgeDriveOutcome::Ineligible => GrokBridgeHostAction::Ignore,
    }
}

fn parse_grok_bridge_drive_outcome(raw: &str) -> Option<GrokBridgeDriveResult> {
    let mut value = serde_json::from_str::<serde_json::Value>(raw).ok()?;
    let value = match value {
        serde_json::Value::String(nested) => {
            value = serde_json::from_str::<serde_json::Value>(&nested)
                .unwrap_or(serde_json::Value::String(nested));
            value
        }
        value => value,
    };
    let (outcome, boot_id) = match value {
        serde_json::Value::String(outcome) => (outcome, None),
        serde_json::Value::Object(mut result) => (
            result.remove("outcome")?.as_str()?.to_string(),
            result
                .remove("bootId")
                .and_then(|value| value.as_str().map(str::to_string)),
        ),
        _ => return None,
    };
    let outcome = match outcome.as_str() {
        "challenge" => GrokBridgeDriveOutcome::Challenge,
        "installed" => GrokBridgeDriveOutcome::Installed,
        "present" => GrokBridgeDriveOutcome::Present,
        "waiting" => GrokBridgeDriveOutcome::Waiting,
        "retry" => GrokBridgeDriveOutcome::Retry,
        "ineligible" => GrokBridgeDriveOutcome::Ineligible,
        _ => return None,
    };
    Some(GrokBridgeDriveResult { outcome, boot_id })
}

fn apply_grok_bridge_drive_outcome(
    app: &AppHandle,
    provider: &str,
    observed_epoch: u64,
    result: GrokBridgeDriveResult,
) {
    if !grok_bridge_result_is_current(provider, observed_epoch) {
        return;
    }
    if matches!(
        result.outcome,
        GrokBridgeDriveOutcome::Installed | GrokBridgeDriveOutcome::Present
    ) {
        let Some(boot_id) = result.boot_id.as_deref() else {
            return;
        };
        if !adopt_grok_bridge_boot(provider, observed_epoch, boot_id) {
            return;
        }
        let check = serde_json::json!({
            "v": 1,
            "action": "CHECK_STATUS",
            "provider": provider
        });
        let script = format!(
            "window.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.dispatch({});",
            serde_json::to_string(&check).unwrap_or_default()
        );
        let _ = eval_provider(app, provider, &script);
        return;
    }
    let next_state = {
        let Ok(mut guard) = runtime().lock() else {
            return;
        };
        let current_epoch = guard
            .grok_document_epoch
            .get(provider)
            .copied()
            .unwrap_or_default();
        let Some(current_state) = guard.states.get(provider) else {
            return;
        };
        if grok_bridge_host_action(result.outcome, observed_epoch, current_epoch, current_state)
            != GrokBridgeHostAction::MarkBlocked
        {
            return;
        }
        let mut next_state = current_state.clone();
        next_state.webview = "loaded".into();
        next_state.dom = "unknown".into();
        next_state.login = "blocked".into();
        next_state.thinking = false;
        next_state.last_status_at = now_ms();
        guard
            .states
            .insert(provider.to_string(), next_state.clone());
        next_state
    };
    let _ = app.emit_to("main", "connections://update", &next_state);
}

fn drive_grok_bridge_on_webview(
    webview: &tauri::Webview,
    app: &AppHandle,
    provider: &str,
    script: &str,
    observed_epoch: u64,
) {
    if !grok_bridge_result_is_current(provider, observed_epoch) {
        return;
    }
    let app = app.clone();
    let provider = provider.to_string();
    let _ = webview.eval_with_callback(script, move |raw| {
        if let Some(result) = parse_grok_bridge_drive_outcome(&raw) {
            apply_grok_bridge_drive_outcome(&app, &provider, observed_epoch, result);
        }
    });
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NewWindowAction {
    /// OAuth / allowlisted window.open hosted in a decorated Tauri window.
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

fn popup_initial_title(url: &tauri::Url) -> &str {
    url.host_str().unwrap_or("Sign in")
}

fn physical_bounds(bounds: &Bounds) -> Result<(PhysicalPosition<i32>, PhysicalSize<u32>), String> {
    fn position(value: f64, name: &str) -> Result<i32, String> {
        if !value.is_finite() {
            return Err(format!("invalid webview bounds: {name} must be finite"));
        }
        let rounded = value.round();
        if rounded < i32::MIN as f64 || rounded > i32::MAX as f64 {
            return Err(format!("invalid webview bounds: {name} is out of range"));
        }
        Ok(rounded as i32)
    }

    fn size(value: f64, name: &str) -> Result<u32, String> {
        if !value.is_finite() {
            return Err(format!("invalid webview bounds: {name} must be finite"));
        }
        let rounded = value.round();
        if rounded < 1.0 || rounded > u32::MAX as f64 {
            return Err(format!(
                "invalid webview bounds: {name} must round to a positive u32"
            ));
        }
        Ok(rounded as u32)
    }

    Ok((
        PhysicalPosition::new(position(bounds.x, "x")?, position(bounds.y, "y")?),
        PhysicalSize::new(size(bounds.width, "width")?, size(bounds.height, "height")?),
    ))
}

#[tauri::command]
pub async fn provider_open(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
    bounds: Bounds,
) -> Result<ProviderState, String> {
    ensure_control_webview(&webview)?;
    let (position, size) = physical_bounds(&bounds)?;
    let adapter = adapters::get_adapter(&provider)?;
    let label = provider_label(&provider);
    if let Some(webview) = app.get_webview(&label) {
        webview.show().map_err(|error| error.to_string())?;
        set_webview_bounds(&webview, position, size)?;
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
    let delayed_grok_script = if provider == "grok" {
        Some(delayed_grok_bridge_script(&provider)?)
    } else {
        None
    };
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
    let title_delayed_grok_script = delayed_grok_script.clone();
    let load_app = app.clone();
    let load_provider = provider.clone();
    let load_delayed_grok_script = delayed_grok_script;
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(url));
    // Grok's Cloudflare challenge must see a stock document from its first instruction.
    // Install the automation bridge only after the real app page is confirmed below.
    let builder = if provider_uses_document_start_bridge(&provider) {
        builder.initialization_script(&init_script)
    } else {
        builder
    };
    // Cloudflare Turnstile requires standard, unmodified browser APIs in embedded WebViews.
    // Grok is Cloudflare-protected, so do not monkey-patch navigator.permissions,
    // Notification, or geolocation in its top page or challenge frames.
    let builder = if provider_uses_permission_shim(&provider) {
        builder.initialization_script_for_all_frames(PERMISSION_SHIM_JS)
    } else {
        builder
    };
    // Every provider is parked offscreen outside its active pane. Preserve the shipped liveness
    // tuning so provider timers and renderers keep running while hidden.
    let builder = builder
        .data_directory(profile_dir)
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .additional_browser_args(PROVIDER_BROWSER_ARGS)
        .on_document_title_changed(move |webview, title| {
            let document_epoch = current_grok_document_epoch(&title_provider);
            handle_provider_document_title(&title_app, &title_provider, &title);
            let install_ready = webview
                .url()
                .ok()
                .is_some_and(|url| grok_bridge_install_ready(&title_provider, &title, &url));
            let challenge_ready = grok_challenge_title_active(&title_provider, &title)
                && webview.url().ok().is_some_and(|url| {
                    adapters::url_matches_provider_app(&title_provider, &url).unwrap_or(false)
                });
            let Some(script) = title_delayed_grok_script.as_deref() else {
                return;
            };
            if !install_ready && !challenge_ready {
                return;
            }
            if !grok_bridge_drive_allowed(&current_state(&title_provider)) {
                return;
            }

            // Use this event's WebView directly: title events may arrive before the child is
            // discoverable through AppHandle's webview registry. The driver probes and installs
            // atomically in one JavaScript task.
            drive_grok_bridge_on_webview(
                &webview,
                &title_app,
                &title_provider,
                script,
                document_epoch,
            );
        })
        .on_page_load(move |webview, payload| {
            if load_provider != "grok" {
                return;
            }
            match payload.event() {
                PageLoadEvent::Started => {
                    confirm_grok_page_load(&load_provider);
                    reset_bridge_state(&load_app, &load_provider);
                }
                PageLoadEvent::Finished => {
                    let Some(script) = load_delayed_grok_script.as_deref() else {
                        return;
                    };
                    if !adapters::url_matches_provider_app(&load_provider, payload.url())
                        .unwrap_or(false)
                        || !grok_bridge_drive_allowed(&current_state(&load_provider))
                    {
                        return;
                    }
                    drive_grok_bridge_on_webview(
                        &webview,
                        &load_app,
                        &load_provider,
                        script,
                        current_grok_document_epoch(&load_provider),
                    );
                }
            }
        })
        .on_navigation(move |url| {
            if url.host_str() == Some("mac-bridge.invalid") {
                return false;
            }
            if gemini_sorry_navigation_active(&nav_provider, url) {
                set_provider_challenge_blocked(&nav_app, &nav_provider);
                return true;
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
        .on_new_window(move |url, features| {
            // Challenge auxiliary about: documents are allowed only as in-webview navigation.
            // Keep all non-HTTP(S) popups fail-closed; Turnstile does not require popup windows.
            let allowlisted = adapters::url_allowed_for_provider(&popup_provider, &url)
                .unwrap_or(false)
                || adapters::url_allowed_for_sso(&popup_provider, &url).unwrap_or(false);
            match decide_new_window_action(&url, allowlisted) {
                // Host popups in our own decorated window: the platform-default popup
                // (WebView2) is undecorated, so it can't be dragged off the page it covers.
                // window_features() wires the opener environment, so OAuth flows keep working.
                NewWindowAction::AllowPopup => {
                    static POPUP_SEQ: AtomicUsize = AtomicUsize::new(0);
                    let label = format!(
                        "provider-popup-{}",
                        POPUP_SEQ.fetch_add(1, Ordering::Relaxed)
                    );
                    let builder = tauri::WebviewWindowBuilder::new(
                        &popup_app,
                        &label,
                        WebviewUrl::External("about:blank".parse().expect("static url")),
                    )
                    .window_features(features)
                    .title(popup_initial_title(&url))
                    .on_document_title_changed(|window, title| {
                        let _ = window.set_title(&title);
                    });
                    match builder.build() {
                        Ok(window) => NewWindowResponse::Create { window },
                        Err(_) => NewWindowResponse::Allow,
                    }
                }
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

    let prepared_epoch = prepare_grok_navigation(&provider);
    let webview = match window.add_child(builder, position, size) {
        Ok(webview) => webview,
        Err(error) => {
            cancel_grok_navigation(&provider, prepared_epoch);
            return Err(error.to_string());
        }
    };
    webview.show().map_err(|error| error.to_string())?;
    let current = current_state(&provider);
    let state = if current.webview == "loaded" {
        current
    } else {
        let state = state_with(&provider, "loaded", "unknown", "unknown", false);
        set_state(&app, state.clone());
        state
    };
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
    retire_grok_document(&provider);
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|error| error.to_string())?;
    }
    if let Ok(mut guard) = runtime().lock() {
        guard.engine_boot.remove(&provider);
        guard.bridge_boot.remove(&provider);
        guard.status_boot.remove(&provider);
        guard.grok_adopted_boot.remove(&provider);
        guard.grok_pending_navigation.remove(&provider);
        guard.pending_session_boot.remove(&provider);
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
    if provider_show_should_focus(focus) {
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
    let (position, size) = physical_bounds(&bounds)?;
    let label = provider_label(&provider);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("webview not found: {label}"))?;
    set_webview_bounds(&webview, position, size)
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
    eval_provider_with_callback(&app, &provider, &js).await
}

async fn eval_provider_with_callback(
    app: &AppHandle,
    provider: &str,
    js: &str,
) -> Result<String, String> {
    let label = provider_label(provider);
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
    let prepared_epoch = prepare_grok_navigation(&provider);
    reset_bridge_state(&app, &provider);
    if let Err(error) = eval_provider(&app, &provider, "location.reload();") {
        cancel_grok_navigation(&provider, prepared_epoch);
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub async fn provider_new_session(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
) -> Result<(), String> {
    ensure_control_webview(&webview)?;
    if app.get_webview(&provider_label(&provider)).is_none() {
        return Err(format!("provider webview is not open: {provider}"));
    }
    let adapter = adapters::get_adapter(&provider)?;
    let prepared_epoch = prepare_grok_navigation(&provider);
    if let Err(error) = begin_session_reset(&app, &provider) {
        cancel_grok_navigation(&provider, prepared_epoch);
        return Err(error);
    }
    let js = format!(
        "location.href = {};",
        serde_json::to_string(&adapter.urls.app).map_err(|error| error.to_string())?
    );
    if let Err(error) = eval_provider(&app, &provider, &js) {
        cancel_session_reset(&provider);
        cancel_grok_navigation(&provider, prepared_epoch);
        return Err(error);
    }

    let deadline =
        tokio::time::Instant::now() + Duration::from_secs(NEW_SESSION_READY_TIMEOUT_SECS);
    while tokio::time::Instant::now() < deadline {
        if let Some(status_boot) = session_reset_ready_boot(&provider) {
            let expected_boot =
                serde_json::to_string(&status_boot).map_err(|error| error.to_string())?;
            let matches_current_document = eval_provider_with_callback(
                &app,
                &provider,
                &format!(
                    "Boolean(window.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.bootId === {expected_boot})"
                ),
            )
            .await
            .ok()
            .is_some_and(|raw| eval_callback_reports_true(&raw));
            if matches_current_document {
                return Ok(());
            }
        }
        tokio::time::sleep(Duration::from_millis(NEW_SESSION_READY_POLL_MS)).await;
    }

    cancel_session_reset(&provider);
    cancel_grok_navigation(&provider, prepared_epoch);
    Err(format!(
        "provider new session did not become ready within {} seconds: {provider}",
        NEW_SESSION_READY_TIMEOUT_SECS
    ))
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

pub(crate) fn bridge_title_is_eligible(provider: &str, msg: &BridgeMessage) -> bool {
    msg.action != "STATUS_REPORT" || grok_bridge_boot_is_current(provider, msg.boot_id.as_deref())
}

pub(crate) fn handle_bridge_title(
    app: &AppHandle,
    provider: &str,
    msg: &BridgeMessage,
) -> Result<bool, String> {
    if msg.action != "STATUS_REPORT" {
        return Ok(true);
    }
    if !accept_status_for_session_reset(provider, msg.boot_id.as_deref()) {
        return Ok(false);
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
    Ok(true)
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

fn delayed_grok_bridge_script(provider: &str) -> Result<String, String> {
    let adapter = adapters::get_adapter(provider)?;
    let challenge_signals = serde_json::from_str::<serde_json::Value>(CHALLENGE_SIGNALS_JSON)
        .map_err(|error| format!("invalid shared challenge signals: {error}"))?;
    let challenge_signals_json =
        serde_json::to_string(&challenge_signals).map_err(|error| error.to_string())?;
    let provider_json = serde_json::to_string(provider).map_err(|error| error.to_string())?;
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
    let template = r#"(function driveGrokBridge() {
  try {
    if (
      window.self !== window.top ||
      location.protocol !== 'https:' ||
      location.hostname !== 'grok.com'
    ) {
      return { outcome: 'ineligible' };
    }

    var challengeSignals = __MAC_CHALLENGE_SIGNALS_JSON__;
    function normalize(value) {
      return String(value || '').trim().toLocaleLowerCase();
    }
    function includesSignal(value, signals) {
      var normalized = normalize(value);
      return signals.some(function (signal) { return normalized.indexOf(signal) !== -1; });
    }
    function sampleBodyText() {
      if (!document.body) return '';
      try {
        var walker = document.createTreeWalker(document.body, 4);
        var sample = '';
        var node = walker.nextNode();
        while (node && sample.length < challengeSignals.bodySampleChars) {
          if (node.nodeValue) {
            sample += ' ' + node.nodeValue.slice(0, challengeSignals.bodySampleChars - sample.length);
          }
          node = walker.nextNode();
        }
        return sample.slice(0, challengeSignals.bodySampleChars);
      } catch (_) {
        return String(document.body.innerText || document.body.textContent || '')
          .slice(0, challengeSignals.bodySampleChars);
      }
    }
    function challengeActive() {
      if (document.querySelector(challengeSignals.markerSelector)) return true;
      if (includesSignal(document.title, challengeSignals.titleSignals)) return true;
      return includesSignal(sampleBodyText(), challengeSignals.bodySignals);
    }
    function installEngineAndAdapter() {
      __MAC_ENGINE_JS__
      window.__MAC_BRIDGE__.dispatch(__MAC_ADAPTER_MESSAGE__);
      window.__MAC_BRIDGE__.dispatch(__MAC_CHECK_MESSAGE__);
    }

    // This read-only decision and the bridge installation run in one JavaScript task. No provider
    // global or DOM state is changed unless the challenge result is explicitly negative.
    if (challengeActive()) return { outcome: 'challenge' };
    if (window.__MAC_BRIDGE__) {
      installEngineAndAdapter();
      return { outcome: 'present', bootId: String(window.__MAC_BRIDGE__.bootId || '') };
    }
    if (document.readyState === 'loading') return { outcome: 'waiting' };

    var title = normalize(document.title);
    if (!(title === 'grok' || title.indexOf('grok - ') === 0 || title.indexOf('grok — ') === 0)) {
      return { outcome: 'ineligible' };
    }

    window.__MAC_PROVIDER__ = __MAC_PROVIDER_JSON__;
    __MAC_BOOTSTRAP_JS__
    if (!window.__MAC_BRIDGE__) {
      return { outcome: challengeActive() ? 'challenge' : 'waiting' };
    }
    installEngineAndAdapter();
    return { outcome: 'installed', bootId: String(window.__MAC_BRIDGE__.bootId || '') };
  } catch (error) {
    try { console.error('[MAC Grok bridge driver]', error); } catch (_) {}
    return { outcome: 'retry' };
  }
})()"#;
    Ok(template
        .replace("__MAC_CHALLENGE_SIGNALS_JSON__", &challenge_signals_json)
        .replace("__MAC_ENGINE_JS__", ENGINE_JS)
        .replace(
            "__MAC_ADAPTER_MESSAGE__",
            &serde_json::to_string(&dispatch_adapter).map_err(|error| error.to_string())?,
        )
        .replace(
            "__MAC_CHECK_MESSAGE__",
            &serde_json::to_string(&dispatch_check).map_err(|error| error.to_string())?,
        )
        .replace("__MAC_PROVIDER_JSON__", &provider_json)
        .replace("__MAC_BOOTSTRAP_JS__", BOOTSTRAP_JS))
}

fn cached_grok_bridge_script() -> Result<&'static str, String> {
    static SCRIPT: OnceLock<Result<String, String>> = OnceLock::new();
    match SCRIPT.get_or_init(|| delayed_grok_bridge_script("grok")) {
        Ok(script) => Ok(script.as_str()),
        Err(error) => Err(error.clone()),
    }
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
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
) -> Result<(), String> {
    // 前端傳來的是實體像素（CSS px × devicePixelRatio），必須用 Physical。
    // 用 Logical 會少乘 WebView2 的頁面縮放（Windows「文字大小」），造成 webview 錯位。
    webview
        .set_bounds(tauri::Rect {
            position: tauri::Position::Physical(position),
            size: tauri::Size::Physical(size),
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
    state.dom = "unknown".into();
    state.thinking = false;
    state.last_status_at = now_ms();
    state.bridge = "ok".into();
    state.bridge_reason = None;
    set_state(app, state);
}

fn begin_session_reset(app: &AppHandle, provider: &str) -> Result<(), String> {
    {
        let mut guard = runtime()
            .lock()
            .map_err(|_| "provider state poisoned".to_string())?;
        let previous_boot = guard.status_boot.get(provider).cloned();
        guard
            .pending_session_boot
            .insert(provider.to_string(), previous_boot);
    }
    reset_bridge_state(app, provider);
    Ok(())
}

fn cancel_session_reset(provider: &str) {
    if let Ok(mut guard) = runtime().lock() {
        guard.pending_session_boot.remove(provider);
    }
}

fn accept_status_for_session_reset(provider: &str, incoming_boot: Option<&str>) -> bool {
    let Ok(mut guard) = runtime().lock() else {
        return false;
    };
    if provider == "grok" {
        let Some(incoming_boot) = incoming_boot else {
            return false;
        };
        let current_epoch = guard
            .grok_document_epoch
            .get(provider)
            .copied()
            .unwrap_or_default();
        if !guard
            .grok_adopted_boot
            .get(provider)
            .is_some_and(|(epoch, adopted_boot)| {
                *epoch == current_epoch && adopted_boot == incoming_boot
            })
        {
            return false;
        }
    }
    if let Some(previous_boot) = guard.pending_session_boot.get(provider).cloned() {
        if !fresh_session_boot(previous_boot.as_deref(), incoming_boot) {
            return false;
        }
        guard.pending_session_boot.remove(provider);
    }
    if let Some(incoming_boot) = incoming_boot {
        guard
            .status_boot
            .insert(provider.to_string(), incoming_boot.to_string());
    }
    true
}

fn fresh_session_boot(previous_boot: Option<&str>, incoming_boot: Option<&str>) -> bool {
    incoming_boot.is_some_and(|incoming| previous_boot != Some(incoming))
}

fn eval_callback_reports_true(raw: &str) -> bool {
    eval_callback_boolean(raw) == Some(true)
}

fn eval_callback_boolean(raw: &str) -> Option<bool> {
    match serde_json::from_str::<serde_json::Value>(raw) {
        Ok(serde_json::Value::Bool(value)) => Some(value),
        Ok(serde_json::Value::String(value)) => serde_json::from_str::<bool>(&value).ok(),
        _ => None,
    }
}

fn session_reset_ready_boot(provider: &str) -> Option<String> {
    runtime().lock().ok().and_then(|guard| {
        if guard.pending_session_boot.contains_key(provider)
            || !guard
                .states
                .get(provider)
                .is_some_and(|state| state.webview == "loaded" && state.dom == "ready")
        {
            return None;
        }
        guard.status_boot.get(provider).cloned()
    })
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
    let mut grok_to_drive = Vec::new();
    if let Ok(mut guard) = runtime().lock() {
        let providers = guard.states.values().cloned().collect::<Vec<_>>();
        for state in providers {
            if should_drive_grok_bridge(&state) {
                let document_epoch = guard
                    .grok_document_epoch
                    .get(&state.provider)
                    .copied()
                    .unwrap_or_default();
                grok_to_drive.push((state.provider.clone(), document_epoch));
            }
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
    if let Ok(script) = cached_grok_bridge_script() {
        for (provider, document_epoch) in grok_to_drive {
            if let Some(webview) = app.get_webview(&provider_label(&provider)) {
                drive_grok_bridge_on_webview(&webview, app, &provider, script, document_epoch);
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
    use std::sync::Mutex;

    use tauri::{PhysicalPosition, PhysicalSize};

    use super::{
        accept_status_for_session_reset, adopt_grok_bridge_boot, bridge_resets_on_boot_rotation,
        cancel_grok_navigation, cancel_session_reset, challenge_auxiliary_navigation_allowed,
        confirm_grok_page_load, decide_new_window_action, delayed_grok_bridge_script,
        eval_callback_reports_true, fresh_session_boot, gemini_sorry_navigation_active,
        grok_app_title_ready, grok_bridge_drive_allowed, grok_bridge_host_action,
        grok_bridge_install_ready, grok_bridge_result_is_current, grok_challenge_title_active,
        parse_grok_bridge_drive_outcome, physical_bounds, popup_initial_title,
        prepare_grok_navigation, provider_show_should_focus, provider_uses_document_start_bridge,
        provider_uses_permission_shim, runtime, should_drive_grok_bridge,
        should_reset_bridge_on_boot_rotation, staleness_action, state_with, Bounds,
        GrokBridgeDriveOutcome, GrokBridgeDriveResult, GrokBridgeHostAction, NewWindowAction,
        StalenessAction, CHALLENGE_SIGNALS_JSON, PERMISSION_SHIM_JS, PROVIDER_BROWSER_ARGS,
    };

    static GROK_RUNTIME_TEST_LOCK: Mutex<()> = Mutex::new(());

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
    fn provider_show_requires_an_explicit_focus_request() {
        assert!(!provider_show_should_focus(None));
        assert!(!provider_show_should_focus(Some(false)));
        assert!(provider_show_should_focus(Some(true)));
    }

    #[test]
    fn grok_keeps_core_web_apis_unmodified_for_cloudflare_challenges() {
        assert!(!provider_uses_permission_shim("grok"));
        assert!(!provider_uses_document_start_bridge("grok"));
        for provider in ["chatgpt", "claude", "gemini"] {
            assert!(provider_uses_permission_shim(provider));
            assert!(provider_uses_document_start_bridge(provider));
        }
    }

    #[test]
    fn grok_bridge_waits_for_the_real_app_and_an_atomic_negative_challenge_check() {
        assert!(grok_app_title_ready("grok", "Grok"));
        assert!(grok_app_title_ready("grok", "Grok — Home"));
        assert!(!grok_app_title_ready("grok", "grok.com 正在執行安全驗證"));
        assert!(!grok_app_title_ready("grok", "Just a moment..."));
        assert!(!grok_app_title_ready("chatgpt", "Grok"));
        assert!(grok_bridge_install_ready(
            "grok",
            "Grok",
            &url("https://grok.com/")
        ));
        assert!(!grok_bridge_install_ready(
            "grok",
            "Grok",
            &url("https://accounts.x.ai/sign-in")
        ));

        let script = delayed_grok_bridge_script("grok").expect("delayed script should build");
        assert!(!script.contains("__MAC_GROK_DELAYED_INSTALL__"));
        assert!(script.contains("location.hostname !== 'grok.com'"));
        assert!(script.contains("challenges.cloudflare.com"));
        assert!(script.contains("function installEngineAndAdapter()"));
        assert!(script.contains("ADAPTER_UPDATE"));
        assert!(script.contains("CHECK_STATUS"));
        assert!(script.contains("正在執行安全驗證"));
        assert!(script.contains("bootId: String(window.__MAC_BRIDGE__.bootId || '')"));
        let challenge_check = script
            .find("if (challengeActive()) return { outcome: 'challenge' };")
            .expect("driver must check the challenge");
        let first_provider_write = script
            .find("window.__MAC_PROVIDER__ =")
            .expect("driver must eventually identify the provider");
        assert!(challenge_check < first_provider_write);
        serde_json::from_str::<serde_json::Value>(CHALLENGE_SIGNALS_JSON)
            .expect("shared challenge signals must remain valid JSON");
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
    fn popup_initial_title_never_exposes_oauth_query_parameters() {
        let oauth =
            url("https://accounts.google.com/o/oauth2/v2/auth?client_id=secret&state=sensitive");
        assert_eq!(popup_initial_title(&oauth), "accounts.google.com");
        assert_eq!(popup_initial_title(&url("about:blank")), "Sign in");
    }

    #[test]
    fn physical_bounds_round_valid_values_and_allow_negative_positions() {
        let (position, size) = physical_bounds(&Bounds {
            x: -10.4,
            y: 0.0,
            width: 640.6,
            height: 479.5,
        })
        .expect("valid bounds should convert");

        assert_eq!(position, PhysicalPosition::new(-10, 0));
        assert_eq!(size, PhysicalSize::new(641, 480));
    }

    #[test]
    fn physical_bounds_reject_non_finite_values() {
        for field in 0..4 {
            for invalid in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
                let mut bounds = Bounds {
                    x: 10.0,
                    y: 20.0,
                    width: 640.0,
                    height: 480.0,
                };
                match field {
                    0 => bounds.x = invalid,
                    1 => bounds.y = invalid,
                    2 => bounds.width = invalid,
                    _ => bounds.height = invalid,
                }
                assert!(physical_bounds(&bounds).is_err());
            }
        }
    }

    #[test]
    fn physical_bounds_reject_invalid_sizes_and_out_of_range_positions() {
        for invalid_size in [0.0, -1.0, 0.49, u32::MAX as f64 + 1.0] {
            for bounds in [
                Bounds {
                    x: 0.0,
                    y: 0.0,
                    width: invalid_size,
                    height: 480.0,
                },
                Bounds {
                    x: 0.0,
                    y: 0.0,
                    width: 640.0,
                    height: invalid_size,
                },
            ] {
                assert!(physical_bounds(&bounds).is_err());
            }
        }
        for bounds in [
            Bounds {
                x: i32::MAX as f64 + 1.0,
                y: 0.0,
                width: 640.0,
                height: 480.0,
            },
            Bounds {
                x: 0.0,
                y: i32::MIN as f64 - 1.0,
                width: 640.0,
                height: 480.0,
            },
        ] {
            assert!(physical_bounds(&bounds).is_err());
        }

        let (position, size) = physical_bounds(&Bounds {
            x: i32::MIN as f64,
            y: i32::MAX as f64,
            width: 1.0,
            height: u32::MAX as f64,
        })
        .expect("exact integer limits should remain valid");
        assert_eq!(position, PhysicalPosition::new(i32::MIN, i32::MAX));
        assert_eq!(size, PhysicalSize::new(1, u32::MAX));
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
    fn gemini_google_sorry_navigation_is_narrow_and_unmodified() {
        assert!(gemini_sorry_navigation_active(
            "gemini",
            &url("https://www.google.com/sorry")
        ));
        assert!(gemini_sorry_navigation_active(
            "gemini",
            &url(
                "https://www.google.com/sorry/index?continue=https%3A%2F%2Fgemini.google.com%2Fapp"
            )
        ));
        for value in [
            "https://www.google.com/sorryevil",
            "https://www.google.com/search",
            "https://www.google.com.evil.net/sorry",
            "http://www.google.com/sorry",
        ] {
            assert!(!gemini_sorry_navigation_active("gemini", &url(value)));
        }
        assert!(!gemini_sorry_navigation_active(
            "chatgpt",
            &url("https://www.google.com/sorry")
        ));
        assert!(PERMISSION_SHIM_JS.contains("location.hostname === 'www.google.com'"));
        assert!(PERMISSION_SHIM_JS.contains("location.pathname === '/sorry'"));
    }

    #[test]
    fn grok_challenge_titles_surface_without_enabling_other_providers() {
        for title in [
            "Just a moment...",
            "Performing security verification",
            "grok.com 正在執行安全驗證",
            "安全性驗證",
            "セキュリティ検証",
            "Sicherheitsüberprüfung",
        ] {
            assert!(grok_challenge_title_active("grok", title));
        }
        assert!(!grok_challenge_title_active("grok", "Grok"));
        assert!(!grok_challenge_title_active(
            "chatgpt",
            "Performing security verification"
        ));
    }

    #[test]
    fn grok_bridge_driver_callback_parses_only_known_outcomes() {
        assert_eq!(
            parse_grok_bridge_drive_outcome(r#""challenge""#),
            Some(GrokBridgeDriveResult {
                outcome: GrokBridgeDriveOutcome::Challenge,
                boot_id: None,
            })
        );
        assert_eq!(
            parse_grok_bridge_drive_outcome(r#""\"installed\"""#),
            Some(GrokBridgeDriveResult {
                outcome: GrokBridgeDriveOutcome::Installed,
                boot_id: None,
            })
        );
        assert_eq!(
            parse_grok_bridge_drive_outcome(
                r#""{\"outcome\":\"present\",\"bootId\":\"boot-current\"}""#
            ),
            Some(GrokBridgeDriveResult {
                outcome: GrokBridgeDriveOutcome::Present,
                boot_id: Some("boot-current".into()),
            })
        );
        assert_eq!(parse_grok_bridge_drive_outcome("null"), None);
        assert_eq!(parse_grok_bridge_drive_outcome(r#""unexpected""#), None);
    }

    #[test]
    fn grok_bridge_watchdog_retries_loaded_unresolved_grok_including_blocked() {
        assert!(should_drive_grok_bridge(&state_with(
            "grok", "loaded", "unknown", "unknown", false
        )));
        assert!(should_drive_grok_bridge(&state_with(
            "grok", "loaded", "unknown", "blocked", false
        )));
        assert!(!should_drive_grok_bridge(&state_with(
            "grok",
            "loaded",
            "ready",
            "logged_in",
            false
        )));
        assert!(!should_drive_grok_bridge(&state_with(
            "grok", "creating", "unknown", "unknown", false
        )));
        assert!(!should_drive_grok_bridge(&state_with(
            "chatgpt", "loaded", "unknown", "unknown", false
        )));
        assert!(grok_bridge_drive_allowed(&state_with(
            "grok", "creating", "unknown", "unknown", false
        )));
    }

    #[test]
    fn stale_grok_bridge_driver_cannot_override_a_newer_document_or_ready_state() {
        let unresolved = state_with("grok", "loaded", "unknown", "unknown", false);
        assert_eq!(
            grok_bridge_host_action(GrokBridgeDriveOutcome::Challenge, 4, 4, &unresolved),
            GrokBridgeHostAction::MarkBlocked
        );
        assert_eq!(
            grok_bridge_host_action(GrokBridgeDriveOutcome::Challenge, 3, 4, &unresolved),
            GrokBridgeHostAction::Ignore
        );
        assert_eq!(
            grok_bridge_host_action(GrokBridgeDriveOutcome::Waiting, 4, 4, &unresolved),
            GrokBridgeHostAction::Ignore
        );

        let mut ready = unresolved.clone();
        ready.dom = "ready".into();
        ready.login = "logged_in".into();
        assert_eq!(
            grok_bridge_host_action(GrokBridgeDriveOutcome::Challenge, 4, 4, &ready),
            GrokBridgeHostAction::Ignore
        );
    }

    #[test]
    fn session_reset_accepts_only_a_new_document_boot() {
        assert!(!fresh_session_boot(Some("boot-a"), Some("boot-a")));
        assert!(fresh_session_boot(Some("boot-a"), Some("boot-b")));
        assert!(fresh_session_boot(None, Some("boot-a")));
        assert!(!fresh_session_boot(Some("boot-a"), None));
        assert!(!fresh_session_boot(None, None));
    }

    #[test]
    fn grok_navigation_rejects_late_status_from_the_previous_document_boot() {
        let _test_guard = GROK_RUNTIME_TEST_LOCK.lock().expect("Grok test lock");
        let provider = "grok";
        {
            let mut guard = runtime().lock().expect("provider runtime lock");
            guard.status_boot.remove(provider);
            guard.grok_adopted_boot.remove(provider);
            guard.grok_pending_navigation.remove(provider);
            guard.grok_document_epoch.remove(provider);
            guard.pending_session_boot.remove(provider);
        }

        let first_epoch = prepare_grok_navigation(provider);
        assert_eq!(confirm_grok_page_load(provider), first_epoch);
        assert!(adopt_grok_bridge_boot(provider, first_epoch, "old-boot"));
        assert!(accept_status_for_session_reset(provider, Some("old-boot")));

        let next_epoch = prepare_grok_navigation(provider);
        assert!(!grok_bridge_result_is_current(provider, first_epoch));
        assert!(!adopt_grok_bridge_boot(provider, first_epoch, "old-boot"));
        assert!(!accept_status_for_session_reset(provider, Some("old-boot")));
        assert_eq!(confirm_grok_page_load(provider), next_epoch);
        assert!(!grok_bridge_result_is_current(provider, first_epoch));
        assert!(!adopt_grok_bridge_boot(provider, first_epoch, "old-boot"));
        assert!(adopt_grok_bridge_boot(provider, next_epoch, "new-boot"));
        assert!(accept_status_for_session_reset(provider, Some("new-boot")));
        assert!(accept_status_for_session_reset(provider, Some("new-boot")));

        let restored_epoch = prepare_grok_navigation(provider);
        assert_eq!(confirm_grok_page_load(provider), restored_epoch);
        assert!(adopt_grok_bridge_boot(provider, restored_epoch, "old-boot"));
        assert!(accept_status_for_session_reset(provider, Some("old-boot")));

        let mut guard = runtime().lock().expect("provider runtime lock");
        guard.status_boot.remove(provider);
        guard.grok_adopted_boot.remove(provider);
        guard.grok_pending_navigation.remove(provider);
        guard.grok_document_epoch.remove(provider);
    }

    #[test]
    fn failed_grok_navigation_restores_the_live_document_boot() {
        let _test_guard = GROK_RUNTIME_TEST_LOCK.lock().expect("Grok test lock");
        let provider = "grok";
        {
            let mut guard = runtime().lock().expect("provider runtime lock");
            guard.status_boot.remove(provider);
            guard.grok_adopted_boot.remove(provider);
            guard.grok_pending_navigation.remove(provider);
            guard.grok_document_epoch.remove(provider);
            guard.pending_session_boot.remove(provider);
        }

        let live_epoch = prepare_grok_navigation(provider);
        assert_eq!(confirm_grok_page_load(provider), live_epoch);
        assert!(adopt_grok_bridge_boot(provider, live_epoch, "live-boot"));
        assert!(accept_status_for_session_reset(provider, Some("live-boot")));

        let failed_epoch = prepare_grok_navigation(provider);
        assert!(!accept_status_for_session_reset(
            provider,
            Some("live-boot")
        ));
        cancel_grok_navigation(provider, failed_epoch);
        assert!(accept_status_for_session_reset(provider, Some("live-boot")));

        let mut guard = runtime().lock().expect("provider runtime lock");
        guard.status_boot.remove(provider);
        guard.grok_adopted_boot.remove(provider);
        guard.grok_pending_navigation.remove(provider);
        guard.grok_document_epoch.remove(provider);
    }

    #[test]
    fn session_reset_parses_native_and_wrapped_eval_booleans() {
        assert!(eval_callback_reports_true("true"));
        assert!(eval_callback_reports_true(r#""true""#));
        assert!(!eval_callback_reports_true("false"));
        assert!(!eval_callback_reports_true(r#""false""#));
        assert!(!eval_callback_reports_true("null"));
    }

    #[test]
    fn cancelled_session_reset_accepts_status_from_the_current_document_again() {
        let provider = "test-cancelled-session-reset";
        {
            let mut guard = runtime().lock().expect("provider runtime lock");
            guard.status_boot.insert(provider.into(), "boot-a".into());
            guard
                .pending_session_boot
                .insert(provider.into(), Some("boot-a".into()));
        }

        assert!(!accept_status_for_session_reset(provider, Some("boot-a")));
        cancel_session_reset(provider);
        assert!(accept_status_for_session_reset(provider, Some("boot-a")));

        let mut guard = runtime().lock().expect("provider runtime lock");
        guard.status_boot.remove(provider);
        guard.pending_session_boot.remove(provider);
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
            guard.status_boot.remove(provider);
            guard.pending_session_boot.remove(provider);
        }
    }
}
