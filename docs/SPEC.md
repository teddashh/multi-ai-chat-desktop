# SPEC — Multi-AI Chat Desktop (Tauri 2)

> Status: **v1.2.1 FINAL** (contract for v1 implementation; §16 changelog)
> Date: 2026-07-04
> Upstream decisions: `docs/ARCHITECTURE.md` v1.0 (D1–D7). Evidence: `docs/study/*.md`.
> Review history: v1.0 DRAFT reviewed adversarially by codex + grok (both REQUEST-CHANGES); all blocking/major findings integrated. Dispositions: `.orchestration/reviews/spec-author-responses.md`.
> Audience: implementing agents (codex) and community contributors.

## 0. One-paragraph summary

A Tauri 2 desktop app (Windows-first) with one main window: a central **control pane** (our React UI) flanked by **child webviews** loading the real AI chat websites (ChatGPT, Claude, Gemini, Grok). The user types once in the control pane; the message is injected into every provider page via DOM automation (ported from the MIT-licensed `multi-ai-chat` Chrome extension); streaming responses are scraped back and aggregated in the control pane. Five workflow modes (free/debate/consult/coding/roundtable) orchestrate multi-AI collaboration. Zero API keys: everything rides on the user's logged-in web sessions. Provider DOM selectors live in community-maintained `adapters/*.json` with remote hot-update.

## 1. Goals / Non-goals (v1)

### Goals
- G1. Single window: control pane + up to 4 provider webviews, resizable, show/hide per provider.
- G2. Port the original extension's injection engine (`createContentScript`) and all 5 workflow modes with identical semantics, **except the four declared improvements** (§1.1).
- G3. Adapter system: JSON per provider, schema-validated, hot-updated from GitHub raw, last-known-good cache, one-click broken-DOM report.
- G4. Per-provider persistent login sessions (WebView2 profile dirs). Login survives app restarts.
- G5. Windows NSIS installer (+ auto-update) and portable zip (no auto-update in v1).
- G6. MIT, community-forkable; `adapters/` contributable without touching Rust.

### 1.1 Declared behavior improvements (the ONLY intentional deviations)
1. **Status tri-state** — `ProviderState` replaces the original boolean `connected` (ARCH D5 #1).
2. **Step timeout UI** — 600s timeout surfaced with countdown + retry + skip (ARCH D5 #2), plus serial-mode preflight (§9.2).
3. **Explicit bus routing** — replaces Chrome implicit broadcast (ARCH D5 #3).
4. **Functional free-mode `targets`** — user may deselect providers for free mode; default (nothing deselected) = all sendable = original fan-out parity (golden-tested).

Everything else must match the original extension's observable behavior. Any other deviation found in review is a bug.

### Non-goals (v1)
- No API-key mode (v2 option, esp. Gemini).
- No macOS/Linux release builds (code stays portable; CI matrix can come in v2).
- No conversation persistence beyond in-memory + export (parity with original).
- No split-tree drag-and-drop layout (fixed dock layout in v1; tempo-term-style tree is v2).
- No remote Tauri IPC to provider origins. No local WebSocket server.
- No code signing certificate (documented SmartScreen workaround instead).
- No new provider IDs via adapters alone: **v1 supports exactly the four built-in providers**; a new provider requires a code change (see §4).
- No adapter signing (schema validation + repo-pinned HTTPS only; signing is v2 — threat model: the hot-update source is our own repo, i.e. the same trust level as the app itself).

## 2. Tech stack (pinned)

| Layer | Choice | Rationale |
|---|---|---|
| Shell | Tauri 2 — **exact-patch pin** `=2.x.y` in Cargo.toml (tauri, tauri-build, all plugins aligned to same minor) | child webviews need `unstable` cargo feature (ARCH D1) |
| Rust crates | tauri (features `["unstable"]`), tauri-plugin-updater, tauri-plugin-dialog, tauri-plugin-opener, reqwest, serde/serde_json, tokio, thiserror | same set proven in refs |
| Frontend | React 18 + TypeScript 5 + Vite + Tailwind CSS | direct port of original sidepanel UI |
| State | Zustand | small, proven pattern (clean-room) |
| Injected scripts | TypeScript compiled to IIFE strings via esbuild (build step), embedded via `include_str!` | one bundle per concern: bootstrap, engine |
| Package manager | pnpm (pinned via `packageManager` field) | BAT convention |
| Monorepo layout | single package + `src-tauri/` | matches both refs |

## 3. Repository layout

```
multi-ai-desktop/
├─ src/                      # control pane (React + TS + Vite)
│  ├─ host/                  # host-api proxy (ONLY place that calls invoke/listen)
│  ├─ workflow/              # ported 5-mode engine (from service-worker.ts) + waitForResponse registry
│  ├─ components/            # ported sidepanel components + pane chrome
│  ├─ stores/                # zustand: connections, messages, layout, settings
│  └─ App.tsx
├─ src-tauri/
│  ├─ src/
│  │  ├─ lib.rs              # plugin registration, state, generate_handler
│  │  ├─ webviews.rs         # provider webview lifecycle + geometry (async commands)
│  │  ├─ bridge.rs           # title/navigation ingestion, eval dispatch, dumb bus
│  │  ├─ adapters.rs         # reqwest fetch, schema validation, cache, versioning
│  │  └─ settings.rs         # JSON settings persistence in app-data
│  ├─ capabilities/default.json
│  └─ tauri.conf.json
├─ injected/
│  ├─ bootstrap.ts           # tiny immutable bridge (initialization_script)
│  └─ engine.ts              # ported base.ts DOM engine + named input strategies (evaled at runtime)
├─ adapters/                 # chatgpt.json claude.json gemini.json grok.json + schema.json
├─ shared/                   # types.ts, constants.ts (ported, used by src/ and injected/)
├─ docs/                     # ARCHITECTURE.md SPEC.md PLAN.md study/
├─ plans/                    # living implementation logs (BAT pattern)
├─ AGENTS.md CLAUDE.md CONTRIBUTING.md LICENSE (MIT)
└─ .github/workflows/        # ci.yml (lint+test+adapter diff), release.yml (tag → build → Release)
```

## 4. Domain model

```ts
// shared/types.ts (ported + extended)
type AIProvider = 'chatgpt' | 'claude' | 'gemini' | 'grok';
// v1: FIXED set. Adapters update the four built-ins only. Adding a provider
// requires code changes (types, UI labels, seed adapter) — documented in CONTRIBUTING.
type ChatMode  = 'free' | 'debate' | 'consult' | 'coding' | 'roundtable';

interface ProviderState {
  provider: AIProvider;
  webview: 'none' | 'creating' | 'loaded';   // webview lifecycle
  dom: 'unknown' | 'ready';                  // engine reported in for current bootId
  login: 'unknown' | 'logged_in' | 'logged_out' | 'blocked';  // from login/loggedOut detectors
  thinking: boolean;
  lastStatusAt: number;                      // staleness watchdog
}
// Replaces the original's single boolean `connected` (improvement #1).
// A provider is *sendable* iff webview=loaded && dom=ready && login=logged_in.
// Visibility (show/hide) does NOT affect sendability.

interface BridgeMessage {                     // envelope, both directions
  v: 1;
  action: MessageAction;
  provider?: AIProvider;
  payload?: unknown;
  // inbound (page → Rust) framing — see §7:
  bootId?: string;                           // bootstrap run id
  seq?: number;                              // title channel: monotonic per bootId
  mid?: number;                              // bulk channel: message id, monotonic per bootId
}

type MessageAction =
  | 'CHECK_STATUS' | 'STATUS_REPORT' | 'SEND_MESSAGE' | 'RESPONSE_CHUNK'
  | 'RESPONSE_DONE' | 'OPEN_LOGIN' | 'GET_CONNECTIONS' | 'CONNECTIONS_UPDATE'
  | 'WORKFLOW_STATUS' | 'ROLE_ASSIGNMENT' | 'CANCEL_WORKFLOW' | 'PUBLISH_HACKMD'
  | 'ADAPTER_UPDATE' | 'REPORT_BROKEN';
// Note: pane geometry sync is NOT a bridge action — it is a plain invoke
// (host.layout.setBounds → provider_set_bounds, §6.2).
```

Role interfaces (DebateRoles, ConsultRoles, CodingRoles, RoundtableRoles) and default role assignments port unchanged from `shared/constants.ts` of the original.

## 5. Adapter schema (`adapters/schema.json`)

All selector fields are **ordered arrays — first match wins** (original `queryFirst` semantics).

```jsonc
// Illustrative only — NON-NORMATIVE. Normative seed content = §5.1 table.
{
  "$schema": "./schema.json",
  "schemaVersion": 1,          // gates PARSER compatibility (breaking schema change ⇒ bump)
  "adapterVersion": 1,         // integer, monotonic; gates CONTENT freshness (hot-update comparison)
  "provider": "chatgpt",
  "displayName": "ChatGPT",
  "urls": {
    "app": "https://chatgpt.com",
    "login": "https://chatgpt.com/auth/login",
    "match": ["https://chatgpt.com/*", "https://chat.openai.com/*"],
    "ssoMatch": []             // extra in-webview-allowed hosts beyond shared defaults (§6.3)
  },
  "inputSelectors":  ["#prompt-textarea"],
  "sendButtonSelectors": ["[data-testid=\"send-button\"]"],
  "responseSelectors": ["[data-message-author-role=\"assistant\"] .markdown"],
  "loginDetectors":  ["#prompt-textarea"],           // any match ⇒ logged in
  "loggedOutDetectors": [],                          // optional; a match here WINS over loginDetectors
  "thinkingDetectors": [                             // READ-ONLY indicators; string or object form
    "[data-testid=\"stop-button\"]",
    { "selector": ".thinking-container", "textIncludes": "Thinking", "textExcludes": "Thought for" }
  ],
  "stopButtonSelectors": ["[data-testid=\"stop-button\"]"],  // ONLY these are ever clicked for stop
  "inputStrategy": "default",  // "default" | "prosemirror-paste" | "quill-angular"  (§8.2)
  "sendStrategy": "click",     // "click" | "enter" (engine fallback chain: click→enter, retry 1.5s)
  "timing": { "doneDelayMs": 3000, "chunkDebounceMs": 800, "statusIntervalMs": 10000,
              "backupPollMs": 3000 }                 // backupPollMs default 3000 = original poll
}
```

**Validation (Rust, on bundle + every fetch):** JSON parse → `schemaVersion` supported → required fields present → required selector arrays non-empty (`inputSelectors`, `sendButtonSelectors`, `responseSelectors`, `loginDetectors`) → optional arrays may be empty (`loggedOutDetectors`, `thinkingDetectors`, `stopButtonSelectors`, `urls.ssoMatch`) → `inputStrategy`/`sendStrategy` in enum → `adapterVersion` integer ≥ `max(bundled, cached)` for the update to apply. Invalid remote bundle ⇒ keep last-known-good, emit warning event. Remote fetch response capped at 64 KB per adapter file.

**Hot update flow**: on startup + every 6h, Rust `reqwest` GETs `https://raw.githubusercontent.com/<org>/<repo>/main/adapters/<provider>.json` (base URL configurable; HTTPS required) → validate → persist to `<app-data>/adapters-cache/` → push to live webviews via `ADAPTER_UPDATE` eval. Bundled adapters ship in the binary as final fallback. Downgrade (lower `adapterVersion`) only applies on explicit channel/base-URL change in Settings, with toast.

### 5.1 Normative seed adapters (bundled v1 content)

Source of truth: `docs/study/multi-ai-chat.md` §2 + §7 (line-referenced to the original MIT source). Bundled JSONs MUST match this table exactly; **CI diffs bundled adapters against this table** (script asserts selector lists + timings).

| Field | chatgpt | claude | gemini | grok |
|---|---|---|---|---|
| urls.app | `https://chatgpt.com` | `https://claude.ai` | `https://gemini.google.com/app` | `https://grok.com` |
| urls.match | `chatgpt.com/*`, `chat.openai.com/*` | `claude.ai/*` | `gemini.google.com/*` | `grok.com/*` |
| inputSelectors | `#prompt-textarea` · `[id="prompt-textarea"]` · `div[contenteditable="true"][data-placeholder]` | `.ProseMirror[contenteditable="true"]` · `[contenteditable="true"].ProseMirror` · `div.ProseMirror` · `fieldset div[contenteditable="true"]` | `.ql-editor[contenteditable="true"]` · `rich-textarea .ql-editor` · `div[contenteditable="true"][aria-label="Enter a prompt here"]` · `div[contenteditable="true"][aria-label]` · `.input-area [contenteditable="true"]` · `rich-textarea [contenteditable="true"]` | `[data-testid="chat-input"] .ProseMirror[contenteditable="true"]` · `[data-testid="chat-input"] [contenteditable="true"]` · `.ProseMirror[contenteditable="true"]` · `[contenteditable="true"].ProseMirror` · `div.ProseMirror[contenteditable="true"]` |
| sendButtonSelectors | `[data-testid="send-button"]` · `button[aria-label="Send prompt"]` · `button[aria-label="Send"]` | `button[aria-label="Send Message"]` · `button[aria-label="Send message"]` · `button[aria-label="Send"]` · `fieldset button[type="button"]:last-of-type` | `button.send-button` · `button[aria-label="Send message"]` · `button[aria-label="Send"]` · `button[aria-label="傳送訊息"]` · `button[aria-label="送出"]` · `button[data-mat-icon-name="send"]` · `.send-button-container button` · `button mat-icon[data-mat-icon-name="send"]` · `.action-wrapper button[aria-label]` · `.input-area-container button.send` · `button.send-message-button` | `button[data-testid="chat-submit"]` · `button[aria-label="Submit"]` · `form button[type="submit"]` · `button[type="submit"]` |
| responseSelectors | `[data-message-author-role="assistant"] .markdown` | `.font-claude-response` · `[data-is-streaming] .font-claude-response` · `.font-claude-message` | `.model-response-text .markdown` · `.model-response-text` · `model-response .markdown` · `model-response message-content` · `.response-content .markdown` · `.message-content[data-message-id]` | `[data-testid="assistant-message"] .response-content-markdown` · `[data-testid="assistant-message"]` · `.response-content-markdown` · `.message-bubble.assistant` |
| loginDetectors | `#prompt-textarea` · `[data-testid="send-button"]` | `.ProseMirror[contenteditable="true"]` · `[contenteditable="true"].ProseMirror` | `.ql-editor[contenteditable="true"]` · `rich-textarea [contenteditable="true"]` · `div[contenteditable="true"][aria-label="Enter a prompt here"]` | `[data-testid="chat-input"] .ProseMirror[contenteditable="true"]` · `.ProseMirror[contenteditable="true"]` · `[data-testid="chat-submit"]` |
| thinkingDetectors | `[data-testid="stop-button"]` · `button[aria-label="Stop generating"]` · `button[aria-label="Stop streaming"]` · `button[aria-label="Stop"]` | `[data-is-streaming="true"]` · `button[aria-label="Stop Response"]` · `button[aria-label="Stop response"]` · `button[aria-label="Stop"]` | `.loading-indicator` · `.thinking-indicator` · `mat-progress-bar` · stop buttons (en + zh-TW per original gemini.ts:53-65) · `.response-streaming` · `[data-test-id="response-loading"]` | stop buttons (grok.ts:38-43) · `[data-streaming="true"]` · `{selector: ".thinking-container", textIncludes: "Thinking", textExcludes: "Thought for"}` |
| stopButtonSelectors | the 4 stop-button selectors above | the 3 `button[aria-label*=Stop]` selectors | stop buttons subset (en + zh-TW) | stop buttons subset |
| inputStrategy | `default` | `prosemirror-paste` | `quill-angular` | `prosemirror-paste` |
| doneDelayMs | 3000 | 5000 | 4000 | **8000** — do not reduce: roundtable round 5 carries 4 rounds × 4 speakers of history; Grok finalizes prematurely with shorter delays (original grok.ts:92-94) |
| chunkDebounceMs | 800 | 500 | 600 | 600 |

(Exact selector strings for the "stop buttons subset" cells are enumerated in the study §2 line refs; implementer copies them verbatim from `refs/multi-ai-chat/src/content/<provider>.ts`.)

## 6. Webview management (Rust, `webviews.rs`)

- `#[tauri::command] async fn provider_open(provider, bounds)` — **async mandatory** (Windows deadlock, ARCH D1). Creates child webview:
  - label `ai-<provider>`, `WebviewUrl::External(adapter.urls.app)`
  - `.initialization_script(BOOTSTRAP_JS)` (bootstrap embedded at build time)
  - `.data_directory(<app-data>/webviews/<provider>)`
  - `.on_document_title_changed(...)` → bridge ingestion (§7.2)
  - `.on_navigation(...)` → `mac-bridge.invalid` defensive block (§7.3 residue, return false) + navigation policy (§6.3)
  - real (unmodified) user agent
  - **If the webview already exists**: show + focus + `set_bounds(bounds)`; do NOT reload; return current `ProviderState`.
- `provider_close(provider)` — destroys the webview (in-flight response is lost; state → `webview:'none'`, `dom:'unknown'`). The WebView2 profile directory is **preserved** (login survives close/reopen). Profile deletion is only via explicit Settings "forget login" action.
- `provider_show / provider_hide / provider_set_bounds` — geometry driven by control pane (§6.2).
- `provider_eval(provider, js)` — internal only; not exposed to frontend directly (host-api wraps semantic commands: `host.provider.send(text)`, `host.adapter.push(cfg)` …).
- **Creation policy**: lazy. No webview at app start unless it was open in the previous session (persisted in settings). Closed providers render a placeholder pane with an "Open <provider>" button.
- Focus/overlay guard: control pane modals must `provider_hide` overlapping webviews (native layers always float above DOM).
- Fallback mode (build-time feature flag `multiwindow-fallback`): same command surface backed by `WebviewWindowBuilder` top-level windows. No runtime auto-switch in v1.

### 6.1 Capabilities / security scoping

- Control pane window label: full local IPC (the command set in this spec) via `capabilities/default.json`.
- `ai-<provider>` labels: **ZERO Tauri permissions**. No capability entries, no `remote.urls`, no plugin access. All provider communication is eval / title / navigation only (ARCH D3).
- `withGlobalTauri: false`. Renderer never imports Tauri APIs outside `src/host/`.

### 6.2 Geometry contract

- Control pane tracks each pane slot's `getBoundingClientRect()` in **CSS pixels** (control pane zoom is fixed at 1.0).
- `host.layout.setBounds(provider, rect)` → `provider_set_bounds` with Tauri **`LogicalPosition` / `LogicalSize`** built directly from CSS px — Tauri/WebView2 applies the window scale factor. No manual DPI math in either layer.
- Rounding: `Math.round` on all four values before invoke.
- Manual acceptance at 100% / 125% / 150% Windows display scale (PLAN M4).

### 6.3 Navigation policy (`on_navigation`)

Order of checks:
1. Host == `mac-bridge.invalid` ⇒ **return false** (defensive block; no ingest — §7.3 residue).
2. URL matches adapter `urls.match` or `urls.login` ⇒ allow.
3. Host in shared SSO allowlist (`shared/constants.ts`: `accounts.google.com`, `accounts.youtube.com`, `appleid.apple.com`, `login.microsoftonline.com`, `login.live.com`, `github.com`) or adapter `urls.ssoMatch` ⇒ allow (SSO flows stay in-webview).
4. Anything else ⇒ **return false** + open in system browser via opener plugin.

## 7. Bridge protocol (`bridge.rs` + `injected/bootstrap.ts`)

### 7.0 Identifiers & framing

- **`bootId`**: random 8-char id generated by bootstrap each time it runs (i.e., per real page load). All inbound messages carry it. A new bootId invalidates all per-bootId counters for that webview (Rust `lastSeq`, control-pane consumed-mid tracking; the page-side outbox is fresh by construction).
- **`seq`** (title channel): monotonic counter per bootId, assigned by bootstrap.
- **`mid`** (bulk channel): monotonic message id per bootId, assigned by engine.
- Outbound (Rust → page) ordering is inherent to `eval()` serialization; Rust assigns its own monotonic dispatch counter per webview for logging only.

### 7.1 Outbound (Rust → page): `webview.eval()`

All commands wrapped as `window.__MAC_BRIDGE__.dispatch(<BridgeMessage JSON>)`. Bootstrap queues dispatches until engine registers its handler; queue flushes in order.

### 7.2 Inbound small signals (page → Rust): document.title

- Format: `"​" + "MAC1|" + bootId + "|" + seq + "|" + base64url(JSON(BridgeMessage))`.
  - Prefix is exactly **U+200B ZERO WIDTH SPACE** (one code point). Rust strips it before parsing and ignores any title not starting with `​MAC1|`.
  - **Whole title string ≤ 900 chars** (including prefix) — safe under all platform title limits.
  - base64url = RFC 4648 §5, no padding, UTF-8 input.
- Bootstrap saves the real title before emit and restores it within 50 ms. If the page overwrites the title inside the emit window (emit lost), bootstrap retries that emit **once**.
- Rust keeps `lastSeq` per (webview label, bootId) and **drops `seq <= lastSeq`** (dedup + stale-title protection).
- Rate limit: bootstrap coalesces STATUS_REPORT to ≤1/s except immediate on-change reports.
- **Carries only**: `STATUS_REPORT` (dom/login/thinking heartbeat, every `statusIntervalMs` and on change), advisory hints (`RESPONSE_DONE` hint, chunk-ready), ack echoes. **Never authoritative payloads** — anything a workflow depends on rides §7.3.
- Per-provider fallback: if a provider's title channel proves unusable (site title churn), that adapter is marked bulk-only and the control pane falls back to hint-less **outbox polling** (§7.3 pull every `pollPullMs`, active only while that provider has a pending workflow step or an open ChatArea stream). *(Amended at M1 exit: sentinel fallback retired with §7.3.)*

### 7.3 Inbound bulk (page → control pane): `eval_with_callback` pull — **AMENDED at M1 exit (2026-07-03)**

> **M1 gate record.** The Phase B live gate (Windows 11 / WebView2, live chatgpt.com child webview, 2 full runs) measured both candidates at 192 KB: sentinel navigation 8/8 ok at ~300 ms; `eval_with_callback` pull 12/12 ok at 30–72 ms with payload integrity verified. Both were reliable; the pull wins on ~6× latency, no segmentation/reassembly/ack state machine, and no navigation interception on the hot path. **Sentinel navigation is retired**: its ingest/reassembly code is removed in M2 (git history keeps the reference implementation). Full data: `plans/m1-bridge-findings.md`.

- **Outbox**: engine queues authoritative bulk messages via `__MAC_BRIDGE__.enqueueBulk(message)`; each gets `mid` (monotonic per bootId). The outbox lives on the bootstrap object, per bootId.
- **Ready hint**: while the outbox is non-empty, bootstrap emits title hint `STATUS_REPORT {bulkReady: <count>}` (coalesced per §7.2 rate limit; immediate when a `RESPONSE_DONE` enters the outbox). *(v1.2.1 clarification)* the immediate DONE hint additionally carries **`doneReady: true`** so the control pane can distinguish it from an ordinary chunk hint. This marker — **not** the mere fact that a provider is awaiting — is what arms the §7.5-rule-2 5 s DONE watchdog. Ordinary chunk hints (`doneReady` absent/false) never arm that 5 s timer; the general "provider is awaiting but silent" case is covered by the longer step/workflow timeout, not the 5 s DONE watchdog. (Arming the 5 s timer at send time or on chunk hints corrupts any response whose engine `doneDelayMs` stability window exceeds 5 s — e.g. grok's 8 s — by synthesizing an error-DONE over the real answer.)
- **Pull**: the control pane (workflow engine) reacts to the hint by invoking `provider_eval_with_callback` with a peek expression — `window.__MAC_BRIDGE__ ? window.__MAC_BRIDGE__.peekOutbox() : []` — which returns all queued messages **without removing them**. The transport itself JSON-serializes the eval result exactly once (WebView2 `ExecuteScript` → `resultObjectAsJson`; wry contract), so the expression must return the **bare array** and the control pane parses the callback string once. *(v1.2.1 correction: v1.2 prescribed wrapping in `JSON.stringify(...)`, which double-encodes — live-gate-proven dead transport. Defensive rule: if the parsed value is a string, parse again.)* The `__MAC_BRIDGE__ ?` guard is mandatory: on Windows, eval exceptions are swallowed and the callback never fires (5 s Rust timeout). Rust is a dumb conduit (D5): it forwards the callback result to the caller and holds no pull logic.
- **Ack**: after successfully parsing the pulled batch, the control pane evals `__MAC_BRIDGE__.ackBulk(<maxMid>)`, which drops all outbox entries with `mid ≤ maxMid`. Pull-then-ack gives at-least-once transport; the control pane dedups by `(bootId, mid)` (tracks last consumed mid per bootId) for at-most-once consumption. A timed-out or unparseable pull is retried once after 1 s; a second failure marks the provider `bridge:'degraded'`.
- **Degraded recovery** *(v1.2.1 clarification)*: `bridge:'degraded'` suspends pulling but is **never permanent**. The control pane clears the degraded mark (and resets mid tracking) when title traffic arrives with an unseen bootId (page reload/navigation), or on explicit `provider_reload`/re-open. Persistent degraded ⇒ stale chip + reload suggestion (§13); the reload is the recovery path.
- **Limits**: single pull result ≤ **1 MB** decoded (engine caps `peekOutbox` batch accordingly); the cap is also enforced at **enqueue**: a single entry may not exceed the pull cap minus envelope — oversized `RESPONSE_CHUNK` payloads are truncated (chunks are cumulative snapshots, a later chunk/DONE supersedes), oversized `RESPONSE_DONE` payloads are truncated with a `truncated: true` payload flag *(v1.2.1: prevents an un-ackable wedged entry)*. Outbox total > **10 MB** ⇒ engine drops oldest `RESPONSE_CHUNK` entries first (never a `RESPONSE_DONE`) and flags degraded. New bootId ⇒ fresh empty outbox; control pane resets its per-bootId mid tracking.
- **Carries**: `RESPONSE_CHUNK` (payload = full accumulated text, debounced `chunkDebounceMs`, only when text changed — original semantics), `RESPONSE_DONE` (final text — authoritative, §7.5), `REPORT_BROKEN` diagnostics.
- **Sentinel residue**: `on_navigation` keeps blocking `mac-bridge.invalid` (**return false**) as a defensive guard, with no ingest behind it. The 8 KB segment constant and codec segmentation helpers in `shared/constants.ts`/codec are removed in M2.

### 7.4 Bus routing (improvement #3)

Rust bus is **dumb**: validate envelope → title dedup (§7.2) → emit Tauri event `bridge://msg` with the complete `BridgeMessage` to the control pane. Nothing else. Bulk messages do not transit the Rust bus: they return as the §7.3 pull invoke result, and the control pane injects them into the same TS-side message stream (dedup by `(bootId, mid)` happens there).
**All waiting/timeout/retry logic lives in the TS workflow engine** (`src/workflow/`), which subscribes via `host.bridge.onMessage()`. Rust holds no `waitForResponse` registry (ARCH D5).
Control pane → Rust: regular `invoke` (local IPC, full trust).

### 7.5 Delivery rules (normative)

1. `waitForResponse(provider)` resolves **only** on a §7.3-pulled `RESPONSE_DONE` whose payload is the final text. A title-channel DONE hint MUST NOT resolve it.
2. If a DONE hint arrives with no pulled `RESPONSE_DONE` within **5 s**, the control pane re-pulls once (§7.3 retry); if the outbox still yields no DONE, engine sends error-as-DONE (§8.3).
3. `RESPONSE_CHUNK` after its own `RESPONSE_DONE` (same mid ordering) is discarded by the workflow engine (stale).
4. Duplicate messages (same bootId+mid, or title seq replay) are dropped at the Rust layer; the control pane may assume at-most-once delivery per mid.

## 8. Injected engine (`injected/engine.ts`)

Port of `refs/multi-ai-chat/src/content/base.ts` (MIT) with transport shim:
- `chrome.runtime.sendMessage` → `__MAC_BRIDGE__.emit()` (title hint vs bulk outbox by size/authority per §7)
- `chrome.runtime.onMessage` → `__MAC_BRIDGE__.onDispatch()`
- Keep: `queryFirst` first-match-wins evaluated **at time of use** (not cached — this is what makes SPA route changes survivable); React-compatible native value setter for textarea; select-all + `execCommand('insertText')` for contenteditable; 800 ms pre-send wait; send-button click → Enter fallback → 1.5 s retry-once; MutationObserver on body + `backupPollMs` polling; `isThinking` poll; `doneDelayMs` stability window; `chunkDebounceMs`.

### 8.1 Boot & re-injection lifecycle (normative sequence)

0. Bootstrap first line: **subframe guard** — `if (window.self !== window.top) return;` (Windows injects init scripts into subframes, ARCH D2). Second check: `location.origin` must be non-opaque http(s).
1. `provider_open` creates webview; bootstrap runs via `initialization_script` on this and **every** subsequent real page load.
2. Bootstrap installs `window.__MAC_BRIDGE__` (idempotent: if present for same document, no-op), generates fresh `bootId`, patches `history.pushState/replaceState` + `popstate` listener (SPA status freshness), emits title `STATUS_REPORT {dom:'unknown', bootId}` (= HELLO).
3. Rust, on HELLO with unseen bootId **and** current URL matching adapter `urls.match`: eval `engine.js` bundle → dispatch `ADAPTER_UPDATE` (current adapter JSON) → dispatch `CHECK_STATUS`. (URL not matching — e.g. mid-SSO redirect — ⇒ do nothing; the post-login load produces a fresh HELLO.)
4. Engine installs (guard `window.__MAC_ENGINE__`: if same bootId already active, no-op; if adapterVersion newer, hot-swap config), resolves detectors, emits `STATUS_REPORT {dom:'ready', login, thinking}`.
5. Hard navigation destroys the JS context → steps 2–4 repeat automatically. Rust debounces engine eval to ≥1 s between pushes per webview (redirect chains).
6. SPA route change (no context loss): engine keeps running; per-use `queryFirst` + observers give original parity. Bootstrap emits a coalesced STATUS_REPORT on route change so staleness watchdog stays quiet.
7. `STATUS_REPORT {dom:'unknown'}` from a bootId that already received the engine ⇒ Rust re-pushes engine + adapter (self-heal, same debounce).

### 8.2 Named input strategies (exact ported logic — the ONLY provider-behavior code)

Engine implements a strategy table keyed by `adapter.inputStrategy`; adapters select by name. Porting must be verbatim from the original files:

| Strategy | Source | Behavior |
|---|---|---|
| `default` | base.ts:110-202 | textarea: React native value setter + `input` event. contenteditable: focus, select-all, `execCommand('insertText')`, `input` event. |
| `prosemirror-paste` | claude.ts:49-86, grok.ts:59-90 | Focus editor → remove existing `<p>` → append `<p>` with text → dispatch `input` → after 100 ms select-all + synthetic paste (`DataTransfer` + `ClipboardEvent('paste')`). |
| `quill-angular` | gemini.ts:69-101 | Clear `innerHTML` → one `<p>` per line (` ` for empty) → dispatch `input` + `InputEvent` → after 150 ms, if no text landed, fallback `execCommand('insertText')`. |

No `customScript` field exists in v1. New site frameworks ⇒ new named strategy via code PR (engine version bump), selectors still via adapter PR.

### 8.3 Error-as-DONE (original parity)

When input/send/response resolution fails permanently (e.g. input element not found after retries), engine sends `RESPONSE_DONE` with payload `"[Error: <reason>]"` (base.ts:101-106 pattern) so workflows unblock instead of hanging. Provider-side error states (rate limit, refusal banner, verification wall) detected via adapter `loggedOutDetectors`/selector misses resolve the same way. Golden-tested (§14).

## 9. Workflow engine (`src/workflow/`)

Port of `service-worker.ts` handlers with semantics preserved:
- `sendAndWait(provider, text)`: register listener first, then send (original ordering).
- Modes: free (Promise.all, errors swallowed → per-provider error badge), debate (pro→con→judge→summary), consult (parallel 2 → reviewer → summary), coding (8 steps), roundtable (5 rounds × 4, history accumulation).
- `WORKFLOW_STATUS` emitted before/after every step (same progress strings); `ROLE_ASSIGNMENT` emitted before each `sendAndWait` — both consumed by UI exactly as the original side panel (§10).
- Step timeout default 600 s, surfaced in UI with countdown (improvement #2): **retry** re-runs `sendAndWait` for the current step only; **skip** substitutes `"(no response — skipped)"` as that provider's answer in all downstream prompts and continues; **cancel** aborts the workflow.
- Default serial behavior without user action stays original: timeout/error aborts the serial workflow.
- `CANCEL_WORKFLOW`: sets abort flag (original) + best-effort `provider_eval` stop-click via adapter `stopButtonSelectors` on in-flight providers. Skip does NOT stop-click.
- `targets?: AIProvider[]` (improvement #4): free mode sends to the ConnectionBar-selected subset; omitted/all-selected = all sendable providers (original parity, golden-tested). Serial modes ignore `targets` (roles decide participants).

### 9.1 Connections lifecycle

- On mount, control pane calls `host.connections.get()` → full `ProviderState[]` snapshot (replaces `GET_CONNECTIONS` round-trip).
- Any change to `webview|dom|login|thinking` (from STATUS_REPORT ingestion, webview lifecycle, staleness watchdog) ⇒ `CONNECTIONS_UPDATE` event to the control pane with the changed `ProviderState`.
- Staleness: no STATUS_REPORT for >30 s while `webview:'loaded'` ⇒ Rust dispatches `CHECK_STATUS`; still silent after another 10 s ⇒ `dom:'unknown'` + `CONNECTIONS_UPDATE` (UI shows stale chip + suggests reload).

### 9.2 Serial-mode preflight (part of improvement #2)

Non-free modes refuse to start unless **every role-assigned provider is sendable**. The start dialog lists unavailable role providers and offers: open/login the provider, reassign the role (RoleConfig), or switch mode. No silent auto-exclusion in serial modes. (Free mode: non-sendable providers are simply excluded — original swallow behavior.)

## 10. Control pane UI

Ported components: ConnectionBar, ModeSelector, RoleConfig, ChatArea (chronological bubbles + streaming marker + role badges from `ROLE_ASSIGNMENT` pending-label semantics), InputBar (Enter=send, Shift+Enter=newline, stop button; disabled + status line driven by `WORKFLOW_STATUS` — original `isProcessing` port), SettingsModal (§11).

ConnectionBar chip mapping (normative): `no-webview` (webview≠loaded) / `needs-login` (login∈{logged_out, blocked}) / `stale` (dom=unknown or watchdog-stale) / `ready` (sendable). Chips double as free-mode `targets` toggles (improvement #4): clicking a ready chip toggles selection; default all selected.

New: pane chrome (per-provider header: show/hide, reload, open-login, report-broken), degraded-state banners, adapter update toast, placeholder pane with "Open <provider>" (lazy creation, §6).
Layout v1: CSS grid — left stack / center control pane / right stack; column widths draggable (Resizer pattern); provider→slot assignment via a Settings dropdown (NOT drag-and-drop — that is v2); hidden providers keep webviews alive (background streaming continues; memory cost documented in README; auto-suspend is v2).
Export (.md download via dialog+fs) and HackMD publish (Rust reqwest command `publish_hackmd`) port as-is.

### 10.1 OPEN_LOGIN semantics (per provider)

Desktop deviation from the original "open new tab" (equivalent outcome, documented):

| Provider | Default action | Blocked path |
|---|---|---|
| chatgpt / claude / grok | navigate `ai-<provider>` webview to `adapter.urls.login`, show + focus pane | — |
| gemini | same attempt, but if Google embedded-login block is detected (login `blocked`) | banner + button → system browser via opener; user logs in in Chrome/Edge, then retries embedded (session cookie sometimes carries); **no cookie import, no UA spoofing** (ARCH D6/D6b) |

SSO redirects during login stay in-webview per §6.3.

### 10.2 REPORT_BROKEN privacy contract

Diagnostics are **selector-structural only — never page text**:
- adapter name + adapterVersion + app version + URL **path only** (no query/fragment)
- per-selector-field miss results (which selectors matched/missed)
- for the first missing field: up to 5 candidate elements as tag + attribute summary (attribute allowlist: `id`, `class`, `data-testid`, `aria-label` truncated to 40 chars) + text **lengths** only
- explicitly excluded: any text content, input values, cookies, storage, account/profile DOM regions
User sees the exact payload in a preview dialog and must confirm; then a prefilled GitHub issue URL opens via opener. Size cap 10 KB.

## 11. Settings & persistence

`<app-data>/settings.json` via Rust settings.rs (BAT pattern): pane layout + slot assignment, open-provider set (for lazy restore), adapter channel/base-URL, HackMD token, updater channel, telemetry=none.
**HackMD token is stored in plaintext in settings.json — an accepted v1 tradeoff, disclosed in the Settings UI ("stored unencrypted on this machine") and README. OS keychain storage is v2.**
`<app-data>/webviews/<provider>/` — WebView2 profiles (login sessions; preserved on provider_close; deleted only via Settings "forget login").
`<app-data>/adapters-cache/` — last-known-good adapters.
No conversation persistence in v1 (explicit non-goal).

## 12. Packaging / release

- `tauri.conf.json`: identifier `com.tedh.multiaichat` (final TBD by owner), Windows NSIS + Evergreen WebView2 `downloadBootstrapper`, `createUpdaterArtifacts: true`, updater endpoint = `latest.json` uploaded to the fixed **`manifests`** GitHub release (BAT pattern, ARCH D7), minisign keypair for updater artifacts.
- Portable zip job: after NSIS build, zip the raw `target/release` app dir + `README-portable.txt` (WebView2 preflight note). **`PORTABLE` marker file present ⇒ updater disabled at runtime AND the updater section is hidden in Settings.**
- `release.yml` adapted from BAT (MIT attribution preserved): tag `v*` → verify (tsc, vitest, cargo check, adapter schema validation + §5.1 diff) → windows build → GitHub Release upload + `latest.json` to `manifests` release. Version injected from tag.
- `ci.yml`: PR gate = tsc + eslint + vitest + `cargo clippy` + adapter schema validation + §5.1 seed diff (adapter-only PRs get fast feedback without full build).

## 13. Error handling & degraded states

| Failure | Detection | Behavior / UX |
|---|---|---|
| Provider DOM changed | selectors miss **5** consecutive times / send fails | pane banner "adapter broken" + one-click REPORT_BROKEN (§10.2) |
| Login expired | loggedOut/login detectors flip | chip → needs-login; free mode excludes; serial mode = preflight block or mid-run timeout UI (§9.2) |
| Google blocks Gemini login | blocked-login DOM detected | banner + system-browser guidance (§10.1) |
| Provider-side error UI (rate limit / refusal / verification) | response never appears; error-as-DONE (§8.3) | bubble shows `[Error: …]`; serial workflows surface timeout/retry/skip UI |
| Cloudflare challenge | challenge DOM detected | pane surfaces webview for manual solve; engine pauses |
| Workflow step stall | no chunk within step timeout | countdown UI → retry / skip / cancel (§9) |
| Adapter fetch fails | reqwest error / validation fail | silent fallback to cache; toast on downgrade |
| Bridge: corrupted title / failed or unparseable pull | codec error, pull timeout, size cap | drop + `bridge:'degraded'` status; pull retry-once (§7.3); persistent ⇒ stale chip + reload suggestion |
| Bridge stall | STATUS_REPORT staleness > 30 s | watchdog per §9.1 |
| SPA navigation dropped engine | STATUS_REPORT dom=unknown on live bootId | auto re-eval engine + adapter ≤ 2 s (§8.1 step 7) |
| engine.ts eval throws | eval error surfaced to Rust | mark dom=unknown, retry once, then broken banner + REPORT_BROKEN offer |
| Child webview creation fails | provider_open error (unstable API) | pane error banner + docs pointer to `multiwindow-fallback` build; no runtime auto-switch (v1) |
| WebView2 runtime missing (portable) | preflight check at startup | dialog with Evergreen download link (README-portable) |
| HackMD publish fails | reqwest / API error | toast with error, conversation retained; token issues → Settings hint |
| Disk full / profile write fails | settings/profile IO error | non-fatal toast; app continues in-memory |
| SSO popup blocked | provider opens login via `window.open` | on_navigation policy routes to in-webview nav where possible; else opener + banner |

## 14. Testing

- Unit (vitest): workflow engine mode sequencing with mocked `host` (golden tests replicate original ordering incl. coding 8-step, roundtable history accumulation, `ROLE_ASSIGNMENT` consumption order, error-as-DONE unblocking, free-mode default-targets parity, serial preflight block); adapter schema validator; title codec round-trip; outbox pull batch parsing + `(bootId, mid)` dedup.
- Rust (`cargo test`): title codec (prefix/seq dedup/bootId switch), navigation policy table, adapter validation + version comparison, settings IO. *(Sentinel reassembly tests retire with the transport in M2.)*
- CI: §5.1 seed-adapter diff script.
- Manual smoke checklist per milestone (docs/PLAN.md): create webviews, login persist across restart, send/receive on all 4 providers, DPI 100/125/150%, mode runs, cancel/stop, hot-update, portable zip run.
- v2: playwright-driven adapter smoke against live sites (CI cron).

## 15. Open questions (tracked, non-blocking)

1. ~~`eval_with_callback` availability on child `Webview`~~ — **RESOLVED at M1 gate (2026-07-03)**: available on Tauri 2.11.x child webviews, live-verified at 192 KB; §7.3 amended to the callback pull transport.
2. Final repo home: new repo vs `desktop/` in teddashh/multi-ai-chat — **owner decision**.
3. App identifier / product name final ("Multi-AI Chat Desktop" placeholder).
4. Adapter signing — v2 (threat model documented in §1 non-goals).

## 16. Changelog

- **v1.2.1 (2026-07-04)** — M2 review corrections to §7.3: pull expression returns the **bare** `peekOutbox()` array (the transport's `ExecuteScript` already JSON-serializes once; the v1.2 `JSON.stringify(...)` wrapper double-encodes — live-gate-proven transport kill) with a mandatory `__MAC_BRIDGE__ ?` guard; degraded state gains an explicit recovery rule (new bootId / reload clears it — never permanent); 1 MB pull cap enforced at enqueue with a truncation policy (oversized `RESPONSE_DONE` truncated with a `truncated: true` flag — no silent final-answer loss, no wedged entry). Added `doneReady: true` marker on the immediate DONE hint (§7.3 Ready hint) so the §7.5-rule-2 5 s watchdog arms **only** on a real DONE hint, never at send time or on chunk hints (fix-pass re-review found the send-time arming corrupts grok's 8 s `doneDelayMs` window). Source: M2 multi-agent review + fix-pass re-review + live gate `plans/m2-log.md`.
- **v1.2 (2026-07-03)** — M1 gate amendment: §7.3 rewritten from sentinel navigation to **`eval_with_callback` pull** (outbox + ready hint + peek/ack pull; sentinel retired to a defensive navigation block, ingest removed in M2). Corollaries: §7.2 fallback = hint-less outbox polling; §7.4 bulk bypasses Rust bus; §7.5 wording; §6.0/§6.3 on_navigation; §13 bridge-error row; §14 test list; open question 1 resolved. Live gate data: `plans/m1-bridge-findings.md`.
- **v1.1 FINAL (2026-07-03)** — integrated adversarial reviews (grok B1–B5/M1–M10, codex 6 blocking/12 major, minors from both). Headlines: named input strategies replace customScript; sentinel framing (bootId/mid/segIdx/segTotal/len, 8 KB, ack); title channel hardening (U+200B, lastSeq, coalesce); DONE authority = sentinel only; boot/re-injection lifecycle; Rust bus made dumb (TS owns waiters); `targets` declared improvement #4; serial preflight; normative seed table §5.1; capabilities zero-permission rule; geometry contract; privacy contract for reports; expanded §13/§14. Dispositions: `.orchestration/reviews/spec-author-responses.md`.
- v1.0 DRAFT (2026-07-03) — initial contract.
