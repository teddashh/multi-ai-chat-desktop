# Tauri 2 multi-webview technical feasibility verification

Date: 2026-07-03

Scope: Tauri 2 desktop app with one control pane plus multiple embedded remote AI chat webviews on Windows first, then macOS/Linux.

## 1. Multi-webview in one window

VERDICT: RISK

The API exists and is real, but it is still behind Tauri's `unstable` Rust feature. The current Tauri Rust docs say `WebviewBuilder` is "Available on crate feature `unstable` only" and `Window::add_child(...)` is available on desktop plus the `unstable` feature only. The docs also show a child webview being created with `WebviewBuilder::new(..., WebviewUrl::External(...))` and attached with `window.add_child(...)`: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html#L186-L207 and https://docs.rs/tauri/latest/tauri/window/struct.Window.html#L289-L293.

Reference evidence: `tempo-term` enables `tauri = { version = "2", features = ["protocol-asset", "unstable"] }` in `refs/tempo-term/src-tauri/Cargo.toml:21`. It creates a child preview webview from a remote/external URL with `WebviewBuilder::new(&label, WebviewUrl::External(parsed))` and then calls `window.add_child(...)` in `refs/tempo-term/src-tauri/src/modules/preview.rs:92-123`. It also grants the JS webview management permissions in `refs/tempo-term/src-tauri/capabilities/default.json:14-20`.

Known limitations:

- Windows: Tauri docs warn that `WebviewBuilder::new` deadlocks when used in a synchronous command or event handler; create webviews from async commands or separate threads instead: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html#L205-L207.
- macOS: `tempo-term` documents that `add_child` blocks during WKWebView initialization for 50-200 ms if done on the main thread, so it made the create command async to keep the UI responsive (`refs/tempo-term/src-tauri/src/modules/preview.rs:53-56`).
- All desktop platforms: child webviews are native layers, not DOM children. `tempo-term` has to manually position, show, hide, and resize them from JS; its comments note the child webview is composited over the window and not part of the DOM (`refs/tempo-term/src/modules/preview/hooks/useNativePreviewWebview.ts:97-111`) and then uses `Webview.getByLabel`, `setPosition`, `setSize`, `show`, and `hide` (`refs/tempo-term/src/modules/preview/hooks/useNativePreviewWebview.ts:141-170`).
- Linux security caveat: for remote IPC capabilities, Tauri says Linux cannot distinguish embedded iframe requests from the window itself. That matters if remote IPC is enabled for a child webview: https://v2.tauri.app/security/capabilities/#L382-L385.

The alternative, multiple `WebviewWindow`s arranged/docked to look like one app, is more stable from a Tauri API perspective because it uses the established `WebviewWindowBuilder` path and does not require `unstable`. `better-agent-terminal` does not enable `unstable` (`refs/better-agent-terminal/src-tauri/Cargo.toml:41`) and creates dynamic `WebviewWindow`s with `WebviewWindowBuilder::new(...).build()` in `refs/better-agent-terminal/src-tauri/src/commands/app.rs:238-260`; detached workspace windows use the same pattern in `refs/better-agent-terminal/src-tauri/src/commands/workspace.rs:431-455`. `tempo-term` also creates new top-level webview windows via `WebviewWindowBuilder::new(app, &label, WebviewUrl::default())` (`refs/tempo-term/src-tauri/src/modules/menu.rs:138-156`).

Recommended approach: prototype the intended single-window child webview layout on Windows first, with async creation and a geometry manager copied from `tempo-term`'s pattern. Keep a feature-flagged fallback to top-level `WebviewWindow`s for platforms or runtime versions where child webviews have focus, resize, drag/drop, or z-order issues. Pin Tauri to a minor version while using `unstable`.

## 2. JS injection into remote sites

VERDICT: CONFIRMED

`initialization_script` is designed to run before the page's own scripts and on every top-level document navigation. Tauri docs say it runs after the global object exists but before the HTML document is parsed, and explicitly recommend checking `window.location` because it runs on all top-level navigations: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html#L447-L457. For all frames, use `initialization_script_for_all_frames`, which has similar navigation behavior and frame coverage: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html#L481-L489.

Reference evidence: `tempo-term` applies `.initialization_script(HISTORY_KEY_SCRIPT)` to a `WebviewBuilder` whose URL is `WebviewUrl::External(parsed)` (`refs/tempo-term/src-tauri/src/modules/preview.rs:92-93`). That is direct evidence that a real Tauri 2 app uses initialization scripts with external/remote webviews.

Runtime injection is also available. `Webview::eval(...)` evaluates JavaScript in the target webview: https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html#L492-L500. For a top-level `WebviewWindow`, `WebviewWindow::eval(...)` and `eval_with_callback(...)` exist too: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindow.html#L1178-L1187.

Limitations:

- Initialization script is builder-time only. Changes to selectors or bridge code after creation need either navigation/reload or a runtime `eval`.
- Site CSP does not block Tauri initialization scripts or Rust-side `eval` in the same way it blocks network-loaded third-party scripts, but the remote page can still overwrite DOM, virtualize inputs, or detect automation.
- Windows always adds initialization scripts to subframes even when using the main-frame method, per Tauri docs: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html#L454-L457.

Recommended approach: use a tiny immutable bootstrap `initialization_script` that installs a namespaced bridge, validates `location.origin`, and listens for config messages from Rust. Pass selector/config updates later with `webview.eval(...)`, not by fetching from inside the remote page.

## 3. IPC from remote pages back to Rust

VERDICT: RISK

By default, Tauri IPC is local-app-only. Tauri capabilities are the access boundary: if a webview or its window does not match any capability, it has no IPC access at all, and capabilities decide which windows/webviews get which permissions: https://v2.tauri.app/reference/acl/capability/#L112-L115. Tauri's capability guide says remote API access is disabled by default and must be allowed in a capability file with a `remote.urls` allowlist: https://v2.tauri.app/security/capabilities/#L353-L380. The config reference defines `remote.urls` as URLPattern-based remote domains and warns about giving remote sources local system access: https://v2.tauri.app/reference/config/#L1549-L1571 and https://v2.tauri.app/reference/config/#L1615-L1637.

For multiwebview windows, Tauri recommends scoping by `webviews` rather than broad `windows` patterns for fine-grained control: https://v2.tauri.app/reference/acl/capability/#L268-L293. That matters here because granting a capability to the containing window may grant all webviews in that window unless scoped carefully.

`dangerousRemoteDomainIpcAccess` is not the current Tauri 2 mechanism in the official v2 config reference. The Tauri 2 mechanism is capability files or inline capabilities with:

```json
{
  "$schema": "../gen/schemas/remote-schema.json",
  "identifier": "chatgpt-bridge",
  "webviews": ["ai-chatgpt"],
  "remote": { "urls": ["https://chatgpt.com", "https://*.chatgpt.com"] },
  "permissions": ["bridge:allow-message-from-webview"]
}
```

Do not grant `core:default`, filesystem, opener, shell, updater, or broad plugin permissions to remote origins. If remote IPC is enabled, the remote site's own JavaScript has the same origin and can potentially call the allowed commands too; Tauri cannot distinguish "our injected script" from "site script" once the origin is allowed.

Reference contrast: neither reference app grants remote IPC. `tempo-term` capabilities target local windows/webviews and local management permissions only (`refs/tempo-term/src-tauri/capabilities/default.json:5-27`), while `better-agent-terminal` grants local window labels only and no `remote` entry (`refs/better-agent-terminal/src-tauri/capabilities/default.json:5-17`).

Safer patterns if we do not want remote IPC:

- Rust-to-page: use `webview.eval(...)` to push commands/config into the remote webview.
- Page-to-Rust low bandwidth: injected script encodes events into `document.title`; Rust observes with `on_document_title_changed`. `tempo-term` already uses title-change callbacks on external child webviews (`refs/tempo-term/src-tauri/src/modules/preview.rs:94-103`).
- Page-to-Rust medium bandwidth: injected script navigates to a custom sentinel URL or hash, Rust observes with `on_navigation`, parses payload, returns `false` for sentinel URLs, and otherwise allows navigation. `tempo-term` observes external navigations and returns `true` (`refs/tempo-term/src-tauri/src/modules/preview.rs:104-115`).
- Local WebSocket or HTTP server: only if the target site's CSP allows `connect-src` to localhost. Many AI sites will block this. It is also more network-visible than title/navigation signaling.

Recommended approach: avoid remote IPC for provider webviews in the first implementation. Use Rust `eval` outbound and title/navigation signaling inbound. If IPC is later needed, expose exactly one bridge command per provider, scope by `webviews` plus `remote.urls`, and include a nonce/session token generated by Rust and injected at document start.

## 4. Session persistence

VERDICT: CONFIRMED

Cookies, localStorage, IndexedDB, and cache are normal webview profile data and should persist across app restarts when using a persistent data directory. Microsoft WebView2 documentation defines the User Data Folder as the place WebView2 stores browser data such as cookies, permissions, cache, DOM storage, IndexedDB, and LocalStorage: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder#L31-L41 and https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder#L51-L70. A WebView2 session has exactly one UDF, and webviews using the same UDF share the same session/profile: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder#L78-L84.

Tauri's app identifier is used in system configuration, including the path to the webview data directory: https://v2.tauri.app/reference/config/#L523-L529. On the builder, Tauri exposes `WebviewBuilder::data_directory(...)` for profile location control: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html#L531-L535. It also exposes `incognito(...)` for non-persistent mode and documents platform behavior: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html#L549-L558.

Per-webview profile isolation is possible on Windows by giving each provider a different `data_directory`, because WebView2 associates sessions with UDFs. Shared sessions are possible by reusing the same directory. On macOS, WKWebView is more constrained: Tauri documents `data_store_identifier(...)` as a replacement for `data_directory` not being available in WKWebView, and it only works on macOS >= 14 / iOS >= 17; Windows/Linux/Android do not support that identifier API: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html#L623-L630.

Tauri can also read and set cookies from Rust. `Webview::cookies()` returns cookies from the runtime store, including HTTP-only and secure cookies, but Tauri warns this can deadlock on Windows if called in synchronous commands or event handlers: https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html#L621-L635.

Recommended approach: for Windows, define explicit provider profile directories under the app data directory, for example `<app-data>/webviews/chatgpt`, `<app-data>/webviews/claude`, and `<app-data>/webviews/gemini`. Do not use incognito. Do not attempt cookie import/export as a primary login strategy. For macOS/Linux, start with shared default profile unless provider isolation is required, then verify profile APIs on each OS.

## 5. Anti-bot / login walls

VERDICT: RISK

Google is the largest hard blocker. Google's Identity team announced that OAuth requests in embedded webviews are prohibited and "all embedded webviews" would be blocked starting 2021-09-30: https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/#L34-L38. The same post explicitly says WKWebView on iOS/macOS does not comply with Google's secure browser policy: https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/#L47-L49. Google's desktop OAuth guide says installed apps must open the system browser and use a local redirect URI for responses: https://developers.google.com/identity/protocols/oauth2/native-app#L119-L125.

This affects Gemini because Google sign-in commonly goes through `accounts.google.com`. WebView2 is also an embedded webview in the relevant security sense, even though it uses Edge/Chromium components. User-agent spoofing is not a durable fix; Tauri lets us set a user agent (`WebviewBuilder::user_agent`) but Google and Cloudflare-style systems use more than the UA string: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html#L512-L514.

OpenAI, Anthropic, xAI/Grok, and Cloudflare-protected pages are not guaranteed to block WebView2/WKWebView login, but they can change bot, automation, or embedded-browser checks without notice. Injected DOM automation and scraping will also be brittle against UI experiments, shadow DOM, rate limits, device verification, and Terms of Service changes.

Workarounds:

- Prefer official APIs where possible, especially Gemini and OpenAI, for automation-grade access.
- For web UI providers, treat embedded login as a user-driven manual step and support "open in system browser" fallback for blocked flows.
- Do not depend on cookie import from system browsers. Modern cookies are HTTP-only, encrypted, SameSite-bound, and often device/session bound.
- Avoid UA spoofing as a product strategy. It may temporarily pass basic checks but increases breakage and policy risk.
- Provide per-provider health checks and clear "login blocked by provider" states.

Recommended approach: classify Gemini web UI as high-risk and implement Gemini API support early. For ChatGPT/Claude/Grok web UIs, allow manual embedded login but design for frequent selector/login breakage and a graceful fallback to external browser or API mode.

## 6. Portable single-exe on Windows

VERDICT: RISK

Tauri can produce a Windows executable as part of a release build, and that executable can run without an installer if its required resources are present and WebView2 is installed. But Tauri's first-class Windows distribution/update artifacts are installer-oriented, not a self-contained single portable `.exe` that embeds WebView2 and all runtime data. The updater docs say Windows updater artifacts are normal MSI and NSIS installers reused by the updater (`myapp-setup.exe`, `myapp.msi`, and signatures): https://v2.tauri.app/plugin/updater/#L366-L371.

WebView2 is the main dependency. Microsoft says Windows 11 includes the Evergreen WebView2 Runtime, but some Windows 10 devices may not have it and apps should check/install it before creating a WebView2: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution#L52-L55. Evergreen mode updates automatically and is shared system-wide: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution#L56-L65. Fixed Version mode can be packaged with the app, but Microsoft says it is over 250 MB and must be periodically updated by the app distributor: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution#L173-L186.

Tauri's Windows config exposes WebView2 install modes: skip, download bootstrapper, embed bootstrapper, offline installer, and fixedRuntime. The fixedRuntime option increases installer size and points to an extracted fixed runtime directory, not a magic embedded browser in one exe: https://v2.tauri.app/reference/config/#L3415-L3424.

Reference evidence: both reference apps use installer/updater-oriented bundling. `tempo-term` has `bundle.targets = "all"` and `createUpdaterArtifacts = true` (`refs/tempo-term/src-tauri/tauri.conf.json:57-60`). `better-agent-terminal` also uses `targets = "all"` and `createUpdaterArtifacts = true` (`refs/better-agent-terminal/src-tauri/tauri.conf.json:28-31`) and configures NSIS installer behavior (`refs/better-agent-terminal/src-tauri/tauri.conf.json:41-47`). Neither repo demonstrates a portable single-exe packaging mode.

Recommended approach: ship two Windows channels:

- Primary supported: signed NSIS installer using Evergreen WebView2 bootstrapper or installer.
- Portable preview: zipped app folder containing the `.exe`, required resources, and a preflight that checks WebView2 runtime. Do not promise "single exe with no dependencies" unless we build a custom packaging/updater story and accept the WebView2 runtime tradeoff.

## 7. Auto-update

VERDICT: RISK

`tauri-plugin-updater` works with GitHub Releases and static `latest.json`. Tauri docs show `bundle.createUpdaterArtifacts = true`, a public key, and an endpoint like `https://github.com/user/repo/releases/latest/download/latest.json`: https://v2.tauri.app/plugin/updater/#L400-L445. They also show `check()`, `downloadAndInstall(...)`, and `relaunch()` from JavaScript: https://v2.tauri.app/plugin/updater/#L577-L640.

However, Windows updates are installer-based. Tauri docs say Windows v2 updater artifacts are MSI/NSIS installers and signatures, and the Windows install step automatically exits the app because of a Windows installer limitation: https://v2.tauri.app/plugin/updater/#L366-L371 and https://v2.tauri.app/plugin/updater/#L918-L922. That does not match a portable bare `.exe` replacement model.

Reference evidence: both apps register `tauri-plugin-updater` in Rust (`refs/tempo-term/src-tauri/src/lib.rs:76-80`, `refs/better-agent-terminal/src-tauri/src/lib.rs:135-143`) and grant `updater:default` (`refs/tempo-term/src-tauri/capabilities/default.json:26`, `refs/better-agent-terminal/src-tauri/capabilities/default.json:16`). `tempo-term` calls `check()`, `downloadAndInstall()`, then `relaunch()` (`refs/tempo-term/src/stores/updaterStore.ts:59-65` and `refs/tempo-term/src/stores/updaterStore.ts:136-145`). `better-agent-terminal` builds a custom updater endpoint and calls `download_and_install(...)` without immediate relaunch so the update applies next launch (`refs/better-agent-terminal/src-tauri/src/commands/update.rs:64-80` and `refs/better-agent-terminal/src-tauri/src/commands/update.rs:112-149`).

Recommended approach: use `tauri-plugin-updater` for the installer channel. For portable builds, either mark auto-update unsupported at first or implement a custom portable updater that downloads a zip/new exe, stages it beside the current app, and swaps on next restart with a helper process. Do not assume the stock plugin will update an arbitrary uninstalled single exe.

## 8. Remote config hot-reload

VERDICT: CONFIRMED

Fetching `selectors.json` from Rust is the robust path. Rust `reqwest` is not subject to browser CORS or the remote site's CSP, and both reference apps already include `reqwest` in Rust (`refs/tempo-term/src-tauri/Cargo.toml:32`, `refs/better-agent-terminal/src-tauri/Cargo.toml:69`). The control-pane webview can also fetch GitHub raw if CORS and the app CSP permit it; both refs set app CSP to `null` (`refs/tempo-term/src-tauri/tauri.conf.json:26-27`, `refs/better-agent-terminal/src-tauri/tauri.conf.json:24-25`), but production should not rely on a permanently disabled CSP.

Fetching from the injected script inside `chatgpt.com` / `claude.ai` / `gemini.google.com` is risky. That fetch is governed by the target site's CSP `connect-src` and by CORS. Tauri cannot reliably rewrite remote response headers for external URLs: `on_web_resource_request` is currently implemented for the `tauri` URI protocol and the docs say it is not executed for external URLs such as a dev server, so it should not be treated as a way to relax ChatGPT/Claude CSP: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html#L259-L265.

Recommended approach: Rust fetches, validates, caches, and version-tags `selectors.json` at startup and periodically. The control pane receives the config from Rust. Rust injects the active provider-specific selectors into each remote webview with `eval(...)` or via the already-installed initialization bridge. Keep a last-known-good config on disk so a GitHub outage does not break the app.

## Recommended architecture

1. Build a Windows-first prototype with one main Tauri window and child webviews using `WebviewBuilder` plus `Window::add_child`.
2. Enable Tauri `unstable` only behind a build/runtime feature, and pin the Tauri minor version.
3. Keep a fallback renderer path using separate `WebviewWindow`s, because that path is stable and proven in both refs.
4. Model each provider webview as a native layer with explicit label, bounds, visibility, focus, zoom, and lifecycle state.
5. Create child webviews only from async commands or scheduled main-thread work to avoid Windows deadlocks and macOS UI stalls.
6. Store each provider's Windows profile under an explicit app-data `data_directory`.
7. Use shared default profile only when cross-provider SSO is intentionally desired.
8. Do not grant remote Tauri IPC to provider origins in the first release.
9. Use Rust `eval` for outbound commands and selector updates.
10. Use document-title or sentinel-navigation signaling for inbound scrape events.
11. If remote IPC becomes unavoidable, expose one narrow bridge command, scope by `webviews` and `remote.urls`, and require a Rust-injected nonce.
12. Fetch selector/config updates from Rust with `reqwest`, validate schema/version, and cache last-known-good.
13. Inject only a small bootstrap at document start; send mutable selector/config data after load.
14. Treat Google/Gemini embedded login as high-risk; prioritize official Gemini API support.
15. Treat ChatGPT/Claude/Grok web UI automation as best-effort and selector-driven, with visible degraded states.
16. Ship the supported Windows build as NSIS plus Evergreen WebView2 handling.
17. Offer portable Windows only as a zip/folder preview unless a custom updater and WebView2 dependency plan is built.
18. Use `tauri-plugin-updater` only for installer/AppImage/app bundle channels.
19. Add automated smoke tests for child webview creation, navigation, injection, profile persistence, and fallback window mode.
20. Keep provider logic isolated so one site's login or selector breakage does not take down the control pane or other webviews.
