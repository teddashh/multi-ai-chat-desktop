# SPEC — Multi-AI Chat Desktop (Tauri 2)

> Status: **v2.2.6 feature-frozen** (four-provider web edition; `v1.4.0` maintenance baseline)
> Date: 2026-07-18
> Authority: `docs/PLAN.md` final-scope table supersedes every historical `NEXT-PHASE` note in this document and in `.orchestration/` material.
> Review history: v1.0 DRAFT received adversarial codex + grok review; v1.2.1 live-gated the callback-pull bridge; v2.1 retired the fifth-provider experiment; v2.2 closes feature development after one final AI-Sister commemorative theme; v2.2.5 hardens the response-language compatibility repair against provider echo; v2.2.6 surfaces Grok challenge state without starting automation on the challenge page.
> Audience: maintenance contributors. Existing snapshot/replay/checkpoint behavior is compatibility-maintained but has no vNext roadmap.

## 0. One-paragraph summary

A Tauri 2 desktop app with one main window: a React control pane and child webviews loading the real ChatGPT, Claude, Gemini, and Grok sites. The user types once; DOM automation sends through the user's logged-in web sessions and aggregates responses into five shipped workflows. Zero API keys and local provider profiles remain the product core. Adapter JSON can be maintained when provider DOM changes. Sessions, snapshots, replay, checkpoints, diagnostics, and source-launch Skills remain available in their shipped form. No marketplace, graph editor, fifth provider, embedded terminal agent, or snapshot vNext is planned. The only final product addition is the optional AI-Sister Commemorative Edition theme; the response-language rule in §1.1 #5 is a maintenance compatibility repair.

## 1. Goals / Non-goals (v2.1)

### Goals
- G1. **SHIPPED floor:** single window: control pane + provider webviews, resizable, show/hide per provider.
- G2. **SHIPPED floor:** port the original extension's injection engine (`createContentScript`) and all 5 workflow modes with identical semantics, **except the five declared improvements** (§1.1).
- G3. **SHIPPED floor:** adapter system: JSON per provider, schema-validated, hot-updated from GitHub raw, last-known-good cache, one-click broken-DOM report.
- G4. **SHIPPED floor:** per-provider persistent login sessions (WebView2 profile dirs). Login survives app restarts.
- G5. **SHIPPED floor:** Windows NSIS installer and portable zip, macOS Apple Silicon DMG, Linux x86_64 AppImage, and tag-driven draft Releases.
- G6. **SHIPPED floor:** MIT, community-forkable; `adapters/` contributable without touching Rust for existing providers.
- G7. **FROZEN compatibility:** shipped sessions, snapshots, replay, checkpoints, local-file insertion, preset catalog, and process trace may receive bug fixes but no feature expansion or new persistence schema.
- G8. **FINAL addition:** one optional AI-Sister Commemorative Edition theme; it must not alter provider automation, workflow ordering, security boundaries, or the default readable theme.

### 1.1 Declared behavior improvements (the ONLY intentional deviations)
1. **Status tri-state** — `ProviderState` replaces the original boolean `connected` (ARCH D5 #1).
2. **Step timeout UI** — 600s timeout surfaced with countdown + retry + skip (ARCH D5 #2), plus serial-mode preflight (§9.5).
3. **Explicit bus routing** — replaces Chrome implicit broadcast (ARCH D5 #3).
4. **Functional free-mode `targets`** — user may deselect providers for free mode; default (nothing deselected) = all sendable = original fan-out parity (golden-tested).
5. **Response-language routing repair** — interface language controls app chrome, not provider output. The separate response-language preference defaults to `auto`: an explicit request wins, followed by current-question language, established user conversation language, then resolved interface locale. The resulting policy is prepended centrally to every provider-bound workflow prompt so the actual request remains the final text, and it must ignore workflow copy, relayed AI text, quotations, attachments, code, URLs, and filenames as language evidence. A fixed response language may be selected, while an explicit per-question request remains authoritative. The bridge strips an exact or partially streamed internal policy echo before it can enter the transcript, snapshots, or downstream prompts; a policy-only final response becomes an explicit retryable provider error.

Everything else must match the original extension's observable behavior. Any other deviation found in review is a bug.

### 1.2 Frozen capability boundary

The shipped five-mode sequences, graph runtime, snapshots/replay, checkpoints, local sessions, diagnostics, preset catalog, focus layout, and local-file insertion form the compatibility boundary. Maintenance may repair data loss, crashes, inaccessible UI, or provider breakage. It must not introduce new workflow-pack formats, snapshot schemas, graph editing, telemetry, provider IDs, or background services. The commemorative theme is presentation-only.

### Non-goals (v2.1)
- No API-key mode. This is not a deferred option: zero-key web-session identity is the product core.
- No automatic full conversation persistence. Snapshots and replay are opt-in and redaction-tiered; in-memory chat plus explicit export remains valid.
- No additional platform architecture beyond the currently published Windows x64, macOS Apple Silicon, and Linux x86_64 artifacts.
- No split-tree drag-and-drop layout. The v2 RAM model is chip/side/center, not a tempo-term pane tree.
- No remote Tauri IPC to provider origins. No local WebSocket server for provider pages.
- No Developer ID/notarization or self-updater program in this frozen edition; macOS DMGs use an ad-hoc bundle signature as a minimum integrity requirement, and GitHub Releases remains the documented distribution channel.
- No new provider IDs via adapters alone: **the provider set is fixed and code-defined**; adding any future provider requires code changes (types, UI labels, seed adapter/profile dir).
- No adapter signing in v2.0 (schema validation + repo-pinned HTTPS only; signing remains v2+).
- No workflow graph editor or pack marketplace.
- No embedded agent SDK/CLI runtime in this web-session edition. Any terminal-agent work belongs to a separate product and repository.
- No Capability Tags, promotion metrics, or community temperature system.

## 2. Tech stack (pinned)

| Layer | Choice | Rationale |
|---|---|---|
| Shell | Tauri 2 — **exact-patch pin** `=2.x.y` in Cargo.toml (tauri, tauri-build, all plugins aligned to same minor) | child webviews need `unstable` cargo feature (ARCH D1) |
| Rust crates | tauri (features `["unstable"]`), tauri-plugin-updater (inactive compatibility dependency), tauri-plugin-dialog, tauri-plugin-opener, reqwest, serde/serde_json, tokio, thiserror | self-update is intentionally not registered in the frozen edition |
| Frontend | React 18 + TypeScript 5 + Vite + Tailwind CSS | direct port of original sidepanel UI plus preset catalog/process trace |
| State | Zustand | small, proven pattern (clean-room) |
| Injected scripts | TypeScript compiled to IIFE strings via esbuild (build step), embedded via `include_str!` | one bundle per concern: bootstrap, engine |
| Workflow graph | `src/workflow/graph/` TypeScript graph types/validator/executor | shipped internal workflow runtime; no editor roadmap |
| Package manager | pnpm (pinned via `packageManager` field) | BAT convention |
| Monorepo layout | single package + `src-tauri/` | matches both refs |
| Graph UI dependency | none | graph editing is retired scope |

## 3. Repository layout

```
multi-ai-desktop/
├─ src/                      # control pane (React + TS + Vite)
│  ├─ host/                  # host-api proxy (ONLY place that calls invoke/listen)
│  ├─ workflow/              # graph executor + parity-preserving 5-mode engine
│  │  └─ graph/              # WorkflowGraph types/validator/executor (N0 production substrate)
│  ├─ components/            # sidepanel components, preset catalog, process trace, pane chrome
│  ├─ stores/                # zustand: connections, messages, layout, settings, catalog UI state
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
├─ adapters/                 # code-defined provider adapters + schema.json
├─ shared/                   # types.ts, constants.ts (ported, used by src/ and injected/)
├─ docs/                     # ARCHITECTURE.md SPEC.md PLAN.md study/
├─ plans/                    # living implementation logs (BAT pattern)
├─ AGENTS.md CLAUDE.md CONTRIBUTING.md LICENSE (MIT)
└─ .github/workflows/        # ci.yml (lint+test+adapter diff), release.yml (tag → build → Release)
```

## 4. Domain model

The snippets in this section are **ILLUSTRATIVE shape summaries** for implementers. They split current code from v2 target additions so contributors do not mistake target fields for shipped fields.

### 4.1 SHIPPED types (current code)

Current code (`shared/types.ts`) has exactly four providers (`chatgpt|claude|gemini|grok`). `ProviderState` has no `presentation` field today. Current graph code (`src/workflow/graph/types.ts:8-18`) has no monotonic content `version` field.

```ts
// shared/types.ts (SHIPPED current code summary)
type AIProvider = 'chatgpt' | 'claude' | 'gemini' | 'grok';
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

interface WorkflowGraph {                    // src/workflow/graph/types.ts current shape
  schemaVersion: 1;
  id: string;
  mode?: ChatMode;
  start: NodeId;
  roles: Record<RoleKey, GraphRole>;
  preflight: GraphPreflight;
  nodes: Record<NodeId, GraphNode>;
  edges: GraphEdge[];
  onComplete?: { status: '' };
}
```

`WorkflowGraph`, graph nodes, and graph edges already live internal to `src/workflow/graph/`; v2.0 made that existing graph substrate production-routed at N0. Snapshot replay's shipped `graphVersion` field is the monotonic content version used to prevent silent replay against changed graph semantics.

### 4.2 v2 TARGET additions

The following target additions do not exist as a complete `shared/types.ts` surface today. They are **NEXT-PHASE** additions and must be added schema-validly in the named milestone.

```ts
type AIProviderV2 = AIProvider; // Snapshot schema compatibility alias.
// Fixed, code-defined set. Adapters update known providers only. Adding any
// provider requires code changes (types, UI labels, seed adapter, profile dir).

type WebviewPresentationState = 'chip' | 'side' | 'center'; // NEXT-PHASE N5.
type SnapshotRedactionTier = 'metadata-only' | 'hashes' | 'prompt-text' | 'full-local'; // NEXT-PHASE N1.

type MessageActionV2 =
  | MessageAction
  | 'FILL_DRAFT'; // NEXT-PHASE N2: insert provider draft without send activation.
// FILL_DRAFT is additive §4 MessageAction + engine behavior. It is NOT a §7
// transport change and MUST NOT modify the frozen §7 protocol.

interface ProviderStateV2 extends ProviderState {
  presentation: WebviewPresentationState;    // NEXT-PHASE N5 UI state: chip/side/center
}

interface RedactedValueRef {
  tier: SnapshotRedactionTier;
  kind: 'omitted' | 'hash' | 'inline' | 'artifact';
  sha256?: string;
  text?: string;
  artifactId?: string;
  byteLength?: number;
  truncated?: boolean;
}

interface ExecutionSnapshot {
  snapshotId: string;
  graphId: string;
  graphVersion: number;                      // Shipped monotonic graph content version.
  appVersion: string;
  createdAt: string;
  completedAt?: string;
  adapterVersions: Partial<Record<AIProviderV2, number>>;
  roleMap: Record<string, AIProviderV2>;
  redactionTier: SnapshotRedactionTier;
  steps: Array<{
    nodeId: string;
    provider?: AIProviderV2;
    inputRef: RedactedValueRef;
    outputRef: RedactedValueRef;
    status: 'pending' | 'running' | 'checkpoint' | 'done' | 'skipped' | 'error' | 'cancelled';
    startedAt: string;
    completedAt?: string;
    retryOf?: string;
  }>;
  humanEdits: Array<{
    checkpointId: string;
    sourceNodeId: string;
    targetNodeId: string;
    beforeRef: RedactedValueRef;
    afterRef: RedactedValueRef;
    editedAt: string;
  }>;
}

interface WorkflowPack {
  schemaVersion: 1;
  fileExtension: '.macflow.json';
  graph: WorkflowGraph;             // internal graph type from src/workflow/graph/
  roleDefaults: Record<string, AIProviderV2>;
  promptTemplates: Record<string, string>;
  metadata: {
    displayName: string;
    description: string;
    costLabel: string;
    requiredProviders: AIProviderV2[];
    estMinutes: number;
    author: string;
    minAdapterVersion: Partial<Record<AIProviderV2, number>>;
    partialRunPolicy?: 'block' | 'allow-with-consent'; // NEXT-PHASE N3/N4.
    downloadCount?: number;           // NEXT-PHASE N9 local pack-index pulse.
    lastDownloadedAt?: string;        // NEXT-PHASE N9 local pack-index pulse.
    successRate?: number;             // NEXT-PHASE N9 local completion signal.
    compatibilityReports?: Array<{
      providerVersions: Partial<Record<AIProviderV2, number>>;
      completedAt: string;
      result: 'success' | 'degraded' | 'failed';
    }>;
  };
}

interface RelayCheckpoint {
  kind: 'relayCheckpoint';
  checkpointId: string;
  sourceNodeId: string;
  targetNodeId: string;
  policy: 'draft-confirm' | 'off';
  defaultDraftTemplate?: string;
}

interface PresetCatalogEntry {
  id: string;
  packRef?: string;
  graphId: string;
  displayName: string;
  description: string;
  costLabel: string;                 // provider count / estimated time / RAM hint
  requiredProviders: AIProviderV2[];
  estMinutes: number;
  ramHint: 'low' | 'medium' | 'high';
  source: 'builtin' | 'imported' | 'community';
  lastMaintainedAt?: string;
  partialRunPolicy?: 'block' | 'allow-with-consent'; // NEXT-PHASE N3/N4.
  downloadCount?: number;            // NEXT-PHASE N9 local-only counter.
  lastDownloadedAt?: string;         // NEXT-PHASE N9 local-only counter.
  successRate?: number;              // NEXT-PHASE N9 local completion signal.
  compatibilityReports?: Array<{
    providerVersions: Partial<Record<AIProviderV2, number>>;
    completedAt: string;
    result: 'success' | 'degraded' | 'failed';
  }>;
}
```

Role interfaces (DebateRoles, ConsultRoles, CodingRoles, RoundtableRoles) and default role assignments port unchanged from `shared/constants.ts` of the original.

The v2 target pack/pulse fields are local-first (§11). They MUST NOT introduce a telemetry server or automatic upload channel.

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
  "responseSelectors": ["[data-message-author-role=\"assistant\"] .markdown", "[data-message-author-role=\"assistant\"]"],
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

**Validation (Rust, on bundle + every fetch):** JSON parse → `schemaVersion` supported → required fields present → required selector arrays non-empty (`inputSelectors`, `sendButtonSelectors`, `responseSelectors`, `loginDetectors`) → optional arrays may be empty (`loggedOutDetectors`, `thinkingDetectors`, `stopButtonSelectors`, `urls.ssoMatch`) → `inputStrategy`/`sendStrategy` in enum → every adapter URL is HTTPS without credentials, custom ports, query strings, or fragments → `adapterVersion` integer ≥ `max(bundled, cached)` for the update to apply. Invalid remote bundle ⇒ keep last-known-good, emit warning event. Remote fetch response capped at 64 KB per adapter file.

**Hot update flow**: on startup + every 6h, Rust `reqwest` GETs `https://raw.githubusercontent.com/<org>/<repo>/main/adapters/<provider>.json` (base URL configurable; HTTPS required) → validate → persist to `<app-data>/adapters-cache/` → push to live webviews via `ADAPTER_UPDATE` eval. Bundled adapters ship in the binary as final fallback. A fetched or cached adapter may narrow paths and update selectors, approved strategies, or timing, but it MUST NOT expand the bundled `urls.app`, `urls.login`, `urls.match`, or `urls.ssoMatch` scopes; broader navigation requires an app release and security review. Downgrade (lower `adapterVersion`) only applies on explicit channel/base-URL change in Settings, with toast.

**NEXT-PHASE (N9) contributor gate:** a new provider seed + adapter PR MUST pass the §14 golden tests for all five shipped modes (`free`, `debate`, `consult`, `coding`, `roundtable`) before promotion, OR declare an explicit mercy tier (§18.2) at merge. The CI gate (§12/§14) enforces this for promoted providers and keeps the five-mode floor as the adapter quality bar.

The §5.1 table below is the frozen seed contract for the four shipped chat providers.

### 5.1 Normative seed adapters (bundled v1 content)

Source of truth: `docs/study/multi-ai-chat.md` §2 + §7 (line-referenced to the original MIT source). Bundled JSONs MUST match this table exactly; **CI diffs bundled adapters against this table** (script asserts selector lists + timings).

| Field | chatgpt | claude | gemini | grok |
|---|---|---|---|---|
| urls.app | `https://chatgpt.com` | `https://claude.ai` | `https://gemini.google.com/app` | `https://grok.com` |
| urls.match | `chatgpt.com/*`, `chat.openai.com/*` | `claude.ai/*` | `gemini.google.com/*` | `grok.com/*` |
| inputSelectors | `#prompt-textarea` · `[id="prompt-textarea"]` · `div[contenteditable="true"][data-placeholder]` | `.ProseMirror[contenteditable="true"]` · `[contenteditable="true"].ProseMirror` · `div.ProseMirror` · `fieldset div[contenteditable="true"]` | `.ql-editor[contenteditable="true"]` · `rich-textarea .ql-editor` · `div[contenteditable="true"][aria-label="Enter a prompt here"]` · `div[contenteditable="true"][aria-label]` · `.input-area [contenteditable="true"]` · `rich-textarea [contenteditable="true"]` | `[data-testid="chat-input"] .ProseMirror[contenteditable="true"]` · `[data-testid="chat-input"] [contenteditable="true"]` · `.ProseMirror[contenteditable="true"]` · `[contenteditable="true"].ProseMirror` · `div.ProseMirror[contenteditable="true"]` |
| sendButtonSelectors | `[data-testid="send-button"]` · `button[aria-label="Send prompt"]` · `button[aria-label="Send"]` | `button[aria-label="Send Message"]` · `button[aria-label="Send message"]` · `button[aria-label="Send"]` · `fieldset button[type="button"]:last-of-type` | `button.send-button` · `button[aria-label="Send message"]` · `button[aria-label="Send"]` · `button[aria-label="傳送訊息"]` · `button[aria-label="送出"]` · `button[data-mat-icon-name="send"]` · `.send-button-container button` · `button mat-icon[data-mat-icon-name="send"]` · `.action-wrapper button[aria-label]` · `.input-area-container button.send` · `button.send-message-button` | `button[data-testid="chat-submit"]` · `button[aria-label="Submit"]` · `form button[type="submit"]` · `button[type="submit"]` |
| responseSelectors | `[data-message-author-role="assistant"] .markdown` · `[data-message-author-role="assistant"]` (image-only fallback) | `.font-claude-response` · `[data-is-streaming] .font-claude-response` · `.font-claude-message` | `.model-response-text .markdown` · `.model-response-text` · `model-response .markdown` · `model-response message-content` · `.response-content .markdown` · `.message-content[data-message-id]` | `[data-testid="assistant-message"] .response-content-markdown` · `[data-testid="assistant-message"]` · `.response-content-markdown` · `.message-bubble.assistant` |
| loginDetectors | `#prompt-textarea` · `[data-testid="send-button"]` | `.ProseMirror[contenteditable="true"]` · `[contenteditable="true"].ProseMirror` | `.ql-editor[contenteditable="true"]` · `rich-textarea [contenteditable="true"]` · `div[contenteditable="true"][aria-label="Enter a prompt here"]` | `[data-testid="chat-input"] .ProseMirror[contenteditable="true"]` · `.ProseMirror[contenteditable="true"]` · `[data-testid="chat-submit"]` |
| thinkingDetectors | `[data-testid="stop-button"]` · `button[aria-label="Stop generating"]` · `button[aria-label="Stop streaming"]` · `button[aria-label="Stop"]` | `[data-is-streaming="true"]` · `button[aria-label="Stop Response"]` · `button[aria-label="Stop response"]` · `button[aria-label="Stop"]` | `.loading-indicator` · `.thinking-indicator` · `mat-progress-bar` · stop buttons (en + zh-TW per original gemini.ts:53-65) · `.response-streaming` · `[data-test-id="response-loading"]` | stop buttons (grok.ts:38-43) · `[data-streaming="true"]` · `{selector: ".thinking-container", textIncludes: "Thinking", textExcludes: "Thought for"}` |
| stopButtonSelectors | the 4 stop-button selectors above | the 3 `button[aria-label*=Stop]` selectors | stop buttons subset (en + zh-TW) | stop buttons subset |
| inputStrategy | `prosemirror-paste` | `prosemirror-paste` | `quill-angular` | `prosemirror-paste` |
| doneDelayMs | 3000 | 5000 | 4000 | **8000** — do not reduce: roundtable round 5 carries 4 rounds × 4 speakers of history; Grok finalizes prematurely with shorter delays (original grok.ts:92-94) |
| chunkDebounceMs | 800 | 500 | 600 | 600 |

(Exact selector strings for the "stop buttons subset" cells are enumerated in the study §2 line refs; implementer copies them verbatim from `refs/multi-ai-chat/src/content/<provider>.ts`.)

## 6. Webview management (Rust, `webviews.rs`)

- `#[tauri::command] async fn provider_open(provider, bounds)` — **async mandatory** (Windows deadlock, ARCH D1). Creates or promotes a child webview:
  - label `ai-<provider>`, `WebviewUrl::External(adapter.urls.app)`
  - `.initialization_script(BOOTSTRAP_JS)` (bootstrap embedded at build time)
  - `.data_directory(<app-data>/webviews/<provider>)`
  - `.on_document_title_changed(...)` → bridge ingestion (§7.2)
  - `.on_navigation(...)` → `mac-bridge.invalid` defensive block (§7.3 residue, return false) + navigation policy (§6.3)
  - real (unmodified) user agent
  - **If the webview already exists**: show + focus + `set_bounds(bounds)`; do NOT reload; return current `ProviderState`.
- `provider_close(provider)` — destroys the webview (in-flight response is lost; state → `webview:'none'`, `dom:'unknown'`). The WebView2 profile directory is **preserved** (login survives close/reopen). Profile deletion is only via explicit Settings "forget login" action. N5 hibernate uses this same preservation rule.
- `provider_show / provider_hide / provider_set_bounds` — geometry driven by control pane (§6.2). **NEXT-PHASE (N5):** these commands also honor presentation state (`chip` / `side` / `center`).
- `provider_eval(provider, js)` — internal only; not exposed to frontend directly (host-api wraps semantic commands: `host.provider.send(text)`, `host.adapter.push(cfg)` …).
- **Creation policy**: lazy. No webview at app start unless it was open in the previous session (persisted in settings). **NEXT-PHASE (N5):** closed or hibernated providers render a session-ready chip or placeholder with an "Open <provider>" / "Promote" action.
- **NEXT-PHASE (N5) presentation policy:** `chip` means no native webview is visible and may be destroyed for RAM; `side` means a docked child webview with normal bridge lifecycle; `center` means a focused large bounds region over the control pane. A chip is not sendable until promotion recreates the webview and §8.1 reaches `dom:'ready'`.
- **NEXT-PHASE (N4/N5) chip activity:** when `ProviderState.thinking` and `presentation='chip'`, the session-ready chip MUST show a pulse/badge and the process trace MUST show an active row so minimizing a provider does not hide activity.
- Focus/overlay guard: control pane modals, drag overlays, pack import dialogs, and relay checkpoint editors must `provider_hide` overlapping webviews (native layers always float above DOM). Tempo's `overlayGuard` pattern is useful but the local `tempo-term` checkout has no LICENSE; reimplement the pattern rather than copying verbatim.
- Fallback mode (build-time feature flag `multiwindow-fallback`): same command surface backed by `WebviewWindowBuilder` top-level windows. No runtime auto-switch in v2.0.

### 6.1 Capabilities / security scoping

- Control pane webview label `main`: full local IPC (the command set in this spec) via `capabilities/default.json` using `webviews:["main"]`; the capability MUST omit `windows` so sibling provider webviews do not inherit it.
- `ai-<provider>` labels: **ZERO Tauri permissions**. No capability entries, no `remote.urls`, no plugin access. All provider communication is eval / title / navigation only (ARCH D3).
- `withGlobalTauri: false`. Renderer never imports Tauri APIs outside `src/host/`.
- Bundled control-pane HTML uses a production CSP restricted to local assets, Tauri IPC, and `https://api.github.com` for the explicit update check. `devCsp:null` is allowed only for the local Vite development server.

### 6.2 Geometry contract

- Control pane tracks each pane slot's `getBoundingClientRect()` in **CSS pixels** (control pane zoom is fixed at 1.0).
- `host.layout.setBounds(provider, rect)` → `provider_set_bounds` with Tauri **`LogicalPosition` / `LogicalSize`** built directly from CSS px — Tauri/WebView2 applies the window scale factor. No manual DPI math in either layer.
- Rounding: `Math.round` on all four values before invoke.
- Manual acceptance at 100% / 125% / 150% Windows display scale (PLAN M4).
- **NEXT-PHASE (N5):** `side` presentation uses the existing dock-slot rects. `center` presentation uses the measured center-stage rect and hides any native webview that would overlap control-pane overlays. `chip` presentation calls `provider_hide` or `provider_close` depending on the RAM policy, but it never deletes the provider profile directory.
- Divider drag and native child-webview hit testing MUST keep a DOM overlay above provider webviews while resizing so pointer capture stays in the control pane. Tempo's pane drag pattern is pattern-reference only because the local checkout has no LICENSE.

### 6.3 Navigation policy (`on_navigation`)

Order of checks:
1. Host == `mac-bridge.invalid` ⇒ **return false** (defensive block; no ingest — §7.3 residue).
2. Grok only: `about:blank` or `about:srcdoc` ⇒ allow for Cloudflare challenge auxiliary documents. Other `about:`, `data:`, and `javascript:` URLs remain denied.
3. URL matches adapter `urls.match` or `urls.login` ⇒ allow.
4. Host in shared SSO allowlist (`shared/constants.ts`: `accounts.google.com`, `accounts.youtube.com`, `appleid.apple.com`, `login.microsoftonline.com`, `login.live.com`, `github.com`) or adapter `urls.ssoMatch` ⇒ allow (SSO flows stay in-webview).
5. Anything else ⇒ **return false** + open in system browser via opener plugin.

Grok's Cloudflare-protected WebView MUST NOT receive `PERMISSION_SHIM_JS`. Cloudflare's WebView integration requires standard Web APIs and no modification of core browser behavior; the other three providers retain the notification/geolocation prompt shim. This is a provider-specific compatibility exception, not a reduction of Tauri capability isolation. Reference: `https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/`.

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
8. N5 hibernate/recreate is intentionally equivalent to `provider_close` followed by `provider_open`: the profile directory is retained, bootstrap generates a fresh `bootId`, and the control pane must treat the provider as non-sendable until steps 2–4 complete again.

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

**SHIPPED state:** the v1 workflow engine ports `service-worker.ts` handlers with semantics preserved. Current production dispatch still calls imperative mode handlers at `src/workflow/index.ts:68-71`; the graph foundation already exists under `src/workflow/graph/` and is golden-tested for `debateGraph` but is not wired to `runWorkflow`.

**NEXT-PHASE (N0) v2 contract:** production dispatch routes through `executeGraph` for every built-in mode and imported preset. This is an internal execution substrate change only; it reuses `sendAndWait`/`runStep` and does not alter §7.

- `sendAndWait(provider, text)`: register listener first, then send (original ordering).
- Built-in graphs MUST preserve the five shipped observable sequences: free (Promise.all, errors swallowed → per-provider error badge), debate (pro→con→judge→summary), consult (parallel 2 → reviewer → summary), coding (8 steps), roundtable (5 rounds × 4, history accumulation).
- `WORKFLOW_STATUS` emitted before/after every step (same progress strings); `ROLE_ASSIGNMENT` emitted before each provider step — both consumed by UI exactly as the original side panel (§10). The process trace derives from these graph-step events, not from a new provider transport.
- Step timeout default 600 s, surfaced in UI with countdown (improvement #2): **retry** re-runs `sendAndWait` for the current step only; **skip** substitutes `"(no response — skipped)"` as that provider's answer in all downstream prompts and continues; **cancel** aborts the workflow.
- Default serial behavior without user action stays original: timeout/error aborts the serial workflow.
- `CANCEL_WORKFLOW`: sets abort flag (original) + best-effort `provider_eval` stop-click via adapter `stopButtonSelectors` on in-flight providers. Skip does NOT stop-click.
- `targets?: AIProvider[]` (improvement #4): free mode sends to the ConnectionBar-selected subset; omitted/all-selected = all sendable providers (original parity, golden-tested). Serial modes ignore `targets` unless a v2 pack explicitly exposes a role/provider choice before preflight.
- **NEXT-PHASE (N1):** every graph-backed run creates an `ExecutionSnapshot` object. Durable persistence is opt-in (§11), but the in-memory object exists for replay preview, debug bundle linking, and the run trace until the app exits.
- **SHIPPED today:** diagnostics/event log is in-memory only (`src/diagnostics/`, capped 500); no snapshot/pack/execution-log persistence exists until N1/N3.

### 9.1 Graph runtime and presets

- Built-in graph ids: `free`, `debate`, `consult`, `coding`, `roundtable`. **NEXT-PHASE (N3):** imported pack graph ids are namespaced by pack id.
- Roundtable history accumulation is intentional: each speaker receives all earlier speeches from the same workflow run, including earlier speakers in the current round. Every `executeGraph` call creates a fresh history map, so this prompt context never carries into a different workflow question. Starting a new app conversation also requests a new session from every loaded provider.
- Built-in graph versions are monotonic integers. A snapshot records `graphId` + `graphVersion`; replay refuses to silently substitute a different graph version unless the user explicitly selects "replay with current graph". The response-language prompt-policy repair bumps all built-in graphs from version 1 to version 2.
- **NEXT-PHASE (N3):** `WorkflowPack` import validates graph shape, required provider ids, `minAdapterVersion`, prompt-template parameters, and absence of executable code. Packs contain prompts and metadata only; they do not carry scripts, cookies, local paths, or Tauri permissions.
- **NEXT-PHASE (N3):** pack role defaults are suggestions. Serial-mode preflight (§9.5) remains authoritative and blocks if a required role provider is not sendable.

### 9.2 Relay checkpoints

- **NEXT-PHASE (N2):** a `RelayCheckpoint` is a graph node or step policy between source output and target send.
- When enabled, the engine creates the next step's draft from the source output and prompt template in the **control pane**, then stops at a checkpoint card. It MUST NOT auto-send the draft.
- Checkpoint actions: **Confirm** sends the control-pane draft through the existing `sendAndWait` / `SEND_MESSAGE`; **Skip** records a skipped edge and uses the pack-defined skip value; **Edit in provider** promotes the target provider to center stage.
- **NEXT-PHASE (N2) Edit-in-provider:** provider-side draft fill requires the additive `FILL_DRAFT` `MessageAction` (§4). `FILL_DRAFT` reuses the named input-strategy INSERTION logic (§8.2) without click/Enter/send activation. It is a new §4 MessageAction + engine behavior, is NOT part of the frozen §7 transport, and MUST NOT modify §7.
- Default built-in mode behavior remains auto-for-parity until the user or imported pack enables a checkpoint. This preserves the v1 golden sequences.
- Snapshot records include checkpoint ids, before/after draft refs, action taken, editor timestamp, and target provider.

### 9.3 Snapshot replay

- **NEXT-PHASE (N1):** replay uses the snapshot's graph id/version, role map, provider ids, and adapter-version requirements to reconstruct the run plan.
- Every production workflow and replay passes the runtime Tauri package version into the existing `ExecutionSnapshot.appVersion` field. The `0.0.0` recorder fallback is compatibility-only for direct tests or callers that cannot resolve a runtime package version.
- Replay never reuses cookies or provider storage from the snapshot. It uses the current user's logged-in web sessions and blocks preflight if required providers are unavailable.
- Replay can compare prior output refs against new outputs when the redaction tier preserved comparable material or hashes. Metadata-only snapshots can replay structure but cannot display prompt/output text.
- Replay is a workflow run and therefore emits normal `WORKFLOW_STATUS`, `ROLE_ASSIGNMENT`, process-trace, timeout, cancel, and snapshot events.
- Response-language replay adds no snapshot field. `prompt-text` and `full-local` snapshots recover the versioned policy tag already present in retained step input. `metadata-only`, `hashes`, and legacy snapshots cannot retain that prompt metadata and therefore use the current response-language setting after any applicable graph-version gate; a same-version replay does this without an additional language-policy confirmation.
- **NEXT-PHASE (N1) crash/restart checkpoint:** even when durable full snapshots are off or redaction is metadata-only, the app persists a minimum session checkpoint (graph id, step index, pending checkpoint id/action state) in `settings.json` or bounded JSONL so an interrupted run can resume at the stopped step. Full replay remains opt-in.

### 9.4 Connections lifecycle

- On mount, control pane calls `host.connections.get()` → full `ProviderState[]` snapshot (replaces `GET_CONNECTIONS` round-trip).
- Any change to `webview|dom|login|thinking` (from STATUS_REPORT ingestion, webview lifecycle, staleness watchdog) ⇒ `CONNECTIONS_UPDATE` event to the control pane with the changed `ProviderState`.
- **NEXT-PHASE (N5):** presentation-state changes (`chip|side|center`) also emit `CONNECTIONS_UPDATE`; this requires adding `ProviderState.presentation` because `shared/types.ts` has no `presentation` field today.
- Staleness: no STATUS_REPORT for >30 s while `webview:'loaded'` ⇒ Rust dispatches `CHECK_STATUS`; still silent after another 10 s ⇒ `dom:'unknown'` + `CONNECTIONS_UPDATE` (UI shows stale chip + suggests reload).

### 9.5 Serial-mode preflight (part of improvement #2)

Non-free modes and imported serial packs refuse to start unless **every role-assigned provider is sendable**. The start dialog lists unavailable role providers and offers: open/login the provider, promote a session-ready chip, reassign the role (RoleConfig), or switch mode. No silent auto-exclusion in serial modes. (Free mode: non-sendable providers are simply excluded — original swallow behavior.)

**NEXT-PHASE (N3/N4) partial-run policy:** imported packs may declare that a partial sendable set is allowed only after explicit user consent. Consent UI MUST name omitted providers/roles, record the degraded run in the snapshot/session checkpoint, and preserve no-substitution semantics unless the pack author provided a fallback prompt. If the user declines or the pack does not permit partial runs, the hard block above remains authoritative.

### 9.6 Adapter⇄Preset coupling

**NEXT-PHASE (N0/N4):** adapters and presets are mutually discoverable modules per the owner rule in §0.

- When a provider seed/adapter is added or updated, that provider becomes selectable in the built-in five graphs' role assignments and eligible in the preset catalog, subject to the fixed code-defined provider set and the §5 contributor gate.
- On preset/pack start, if `requiredProviders` is not a subset of the current sendable set, the UI MUST show an auto-complete panel before the §9.5 hard-block. The panel offers: open the provider, login, promote a session-ready chip, reassign the role, or choose an allowed partial-run path.
- Pack `requiredProviders` and `minAdapterVersion` drive the panel. Adapter-version failures also surface catalog degraded state (§13) before the user attempts to run.

## 10. Control pane UI

Ported components remain part of the shipped floor: ConnectionBar, ModeSelector, RoleConfig, ChatArea (chronological bubbles + streaming marker + role badges from `ROLE_ASSIGNMENT` pending-label semantics), InputBar (Enter=send, Shift+Enter=newline, stop button; disabled + status line driven by `WORKFLOW_STATUS` — original `isProcessing` port), SettingsModal (§11).

ConnectionBar chip mapping (SHIPPED floor, normative): `no-webview` (webview≠loaded) / `needs-login` (login∈{logged_out, blocked}) / `stale` (dom=unknown or watchdog-stale) / `ready` (sendable). Chips double as free-mode `targets` toggles (improvement #4): clicking a ready chip toggles selection; default all selected.

**NEXT-PHASE (N5):** presentation chips add `session-ready` for profile-present but currently hibernated providers; they are not sendable until promoted and ready. **NEXT-PHASE (N4/N5):** when `ProviderState.thinking` and `presentation='chip'`, show a pulse/badge on the session-ready chip and a process-trace activity row.

**NEXT-PHASE (N4):** primary v2 entry is the preset catalog:
- Built-in cards: Free fan-out, Debate, Consult, Coding, Roundtable. Imported packs appear with source and maintenance metadata.
- Each card displays cost label, required provider count, estimated time, RAM hint, and login prerequisites. Cost labels are descriptive, not billing estimates.
- Preset-card copy contract: `displayName` + `description` MUST state in plain language the scenario ("when to use / what you get"), provider count, estimated time, RAM hint, and login prerequisites. Default-locale copy MUST avoid graph/editor jargon. Example cost strings: "4 AI · 3 logins · 3-5 min · 8 GB RAM" and "2 AI · 2 logins · about 2 min · low RAM".
- "More…" opens the advanced drawer: raw ModeSelector, RoleConfig, imported pack management, snapshot replay, and settings.
- Starting a card runs the graph-backed preset after preflight. The old mode dropdown remains reachable for parity testing and power users.

**NEXT-PHASE (N4):** read-only process trace:
- Shows step list, provider/role, status, elapsed time, retry/skip/cancel state, checkpoint state, and snapshot availability.
- It is not a canvas and not an editor. It may render a compact graph/sequence view later, but N4 trace is a status surface.
- Better Agent Terminal's MIT `agent-task-tree` / `AgentActivityTree` patterns may be adapted with notice for trace state and UI. They are not a graph editor.

**NEXT-PHASE (N5):** webview presentation:
- `chip`: session-ready or not-open provider affordance; click promotes to side rail or center stage.
- `side`: docked child webview in the existing layout.
- `center`: focused provider over the control pane for login, manual review, checkpoint edit, or side-by-side comparison.
- Overlay guard extends to modals, dropdowns, drag/drop overlays, pack import, and checkpoint cards.

Pack/snapshot/local-file UI:
- **NEXT-PHASE (N3):** export pack: card/menu action writes `.macflow.json` through dialog+fs after validation.
- **NEXT-PHASE (N3):** import pack: drag/drop onto catalog or Settings; validation preview shows metadata, required providers, and adapter minimums before install.
- **NEXT-PHASE (N1):** snapshot replay: run-history entry can replay with recorded graph/provider requirements and selected redaction tier.
- **NEXT-PHASE (N2/N4):** checkpoint cards use the product label 「一鍵接力」 for auto-fill + human confirm. Built-in modes stay auto-for-parity unless a pack or user setting enables a checkpoint.
- Local file drag/drop: current shipped behavior inserts text files into InputBar (`src/ui/fileInsert.ts:1-4`; binary/PDF unsupported). **NEXT-PHASE (N7):** extend this to PDF/DOCX text extraction, chunking, and optional fan-out through existing send paths. Better Agent Terminal's MIT native-drop cache/hit-test utilities may be reused/adapted inside `src/host/` with notice.

Existing pane chrome remains: per-provider header (show/hide/promote, reload, open-login, report-broken), degraded-state banners, adapter update toast, and placeholder with "Open <provider>" (lazy creation, §6). **NEXT-PHASE (N5):** session-ready chip uses the same area. Markdown export records local and UTC export time plus the current app version. It adds latest-run graph/snapshot/adapter provenance only when that in-memory snapshot's question matches the current conversation's latest user message, preventing provenance leakage across sessions.

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
- per-selector-field observations; selector arrays are ordered fallbacks, so one match makes that field available
- conditionally rendered fields are not failures: an empty composer may have no send button, and a new-session page has no response node before the first reply
- only an actionable all-fallback miss sets `firstMissingField` and enables GitHub issue creation in the preview
- for the first actionable missing field: up to 5 candidate elements as tag + attribute summary (attribute allowlist: `id`, `class`, `data-testid`, `aria-label` truncated to 40 chars) + text **lengths** only
- explicitly excluded: any text content, input values, cookies, storage, account/profile DOM regions
User sees the exact payload in a preview dialog and must confirm; then a prefilled GitHub issue URL opens via opener. Size cap 10 KB.

## 11. Settings & persistence

`<app-data>/settings.json` stores interface language, response-language preference, layout, provider selection, adapter channel/base URL, portable/update-channel flags, snapshot opt-in/redaction settings, and `telemetry=none`. The response-language preference defaults to `auto`: explicit output-language requests win, followed by the current question and established conversation language, with the resolved interface locale as the final fallback. Provider credentials are never stored there. A configured HackMD token is plaintext on this machine, as disclosed in Settings.

`<app-data>/webviews/<provider>/` contains isolated provider profiles. `<app-data>/adapters-cache/` contains last-known-good adapters. Local conversation sessions and minimum workflow checkpoints are bounded and stored locally.

Diagnostics keep up to 2,000 deduplicated events in memory and export only on explicit user action.

`<app-data>/snapshots/` may store opt-in `ExecutionSnapshot` records. Snapshots and checkpoints reference provider ids and adapter versions, never cookies, storage, or profile files. Supported redaction tiers are frozen:
- `metadata-only`: graph/provider/adapter/timestamps/status only; no prompt/output text or hashes.
- `hashes`: metadata plus content hashes for compare-without-display.
- `prompt-text`: prompts and human edits; provider outputs are hashes/refs unless explicitly included.
- `full-local`: prompts, outputs, and human edits stored locally for full replay/compare. Never includes cookies or provider storage.

Snapshot/replay/checkpoint persistence receives compatibility and data-loss fixes only. No new snapshot schema, execution-log store, workflow-pack store, telemetry server, usage counter, or sharing channel will be added.

## 12. Packaging / release

- **SHIPPED:** final identifier `com.tedh.multiaichat`; Windows NSIS + portable zip, macOS Apple Silicon DMG, and Linux x86_64 AppImage.
- **FROZEN policy:** `createUpdaterArtifacts` remains false. The app may detect a newer GitHub Release and open its page, but does not download or install updates. No updater endpoint, minisign registration, Developer ID, or notarization roadmap remains. Ad-hoc signing of the macOS bundle is mandatory and verified inside the produced DMG.
- Portable zip job: after NSIS build, zip the raw `target/release` app dir + `README-portable.txt` (WebView2 preflight note). **`PORTABLE` marker file present ⇒ updater disabled at runtime AND the updater section is hidden in Settings.**
- `release.yml`: annotated `v*` tag → version injection → verify → Windows/macOS/Linux bundles → draft GitHub Release with four artifact classes.
- `ci.yml`: TypeScript, ESLint, Vitest, adapter validation, Agent source-contract self-tests, and cross-platform Rust tests/`cargo clippy -- -D warnings` gates.
- Capability tests are v2 gates: provider labels (`ai-<provider>`) MUST be absent from capabilities; no Tauri imports outside `src/host/`; provider webviews receive no `remote.urls`.

### 12.1 Agent-Ready Source Release

- `agent-release.json` is the machine-readable source-development contract; `agent-release.schema.json` is its strict schema. Contract version and Skill version MUST match.
- This lane is explicit-only. Opening or cloning the repository MUST NOT execute code. It is distinct from release installers and MUST NOT invoke `pnpm tauri build`.
- The Codex and Claude Code Skill instruction bodies MUST remain semantically identical; tool-specific frontmatter and Codex UI metadata may differ. Implicit invocation is disabled on both surfaces.
- Source trust warning is normative: dependency installation may execute JavaScript lifecycle scripts, and Rust compilation may execute build scripts/procedural macros from the checked-out dependency graph.
- Lifecycle commands are `doctor`, `audit`, `launch`, `status`, and `stop`. `--json` emits one object carrying `schemaVersion`, `contractVersion`, and `command`. Exit codes are stable: `0` success, `1` prerequisite/runtime/operation failure, `2` invalid usage/contract, `3` readiness timeout.
- `launch --dry-run` MUST NOT create, delete, or rewrite runtime state and MUST predict reuse/refusal instead of always claiming it would start. Normal launch uses a short-lived `.agent-runtime/launch.lock` mutex, may install only locked project dependencies when absent, build generated code, use existing pnpm/Cargo caches, and start `tauri dev`.
- Process acceptance is not readiness. `ready` requires an identity-verified live runner plus a flushed `[MAC_AGENT] READY control-pane` marker in the current launch segment, with the same `startedAt` identity the wait began with. Append-only markers from older or replacement runs MUST be ignored.
- Runtime state is one of `not_started`, `building`, `ready`, `failed`, `exited`, `invalid_state`, or `foreign_process`. Stop MUST re-verify before kill, re-check the same `pid`/`startedAt` before deleting state, refuse foreign identity, and may terminate only the recorded repository runner process tree. Invalid state fails closed; an explicit `stop --clear-invalid-state` recovery removes only the inspected corrupt state file and no process.
- Before/after audits and the launch receipt remain under gitignored `.agent-runtime/`. Comparisons accept only a same-contract, same-repository `phase:before` receipt and probe declared dependency/generated/binary/runtime evidence files. They are not recursive hashes, a sandbox, whole-host inventory, or proof of machine-wide non-mutation.
- Lifecycle scripts MUST NOT install/uninstall host toolchains or global packages, modify `PATH`/profiles/security policy, access provider credentials/profiles, upload logs/receipts, or perform automatic host rollback. Host changes require a separate explicit user-approved operation outside the Skill.
- Docker is not a distribution lane. Native WebViews, the host graphical session, and local provider profiles make container display/profile forwarding a more complex and misleading path than the supported local source launch.
- Full rationale and reusable checklist: `docs/AGENT-READY-SOURCE-RELEASE.md`.

## 13. Error handling & degraded states

| Failure | Detection | Behavior / UX |
|---|---|---|
| Provider DOM changed | selectors miss **5** consecutive times / send fails | pane banner "adapter broken" + one-click REPORT_BROKEN (§10.2); **NEXT-PHASE (N4):** catalog cards requiring this provider show a degraded badge |
| Login expired | loggedOut/login detectors flip | chip → needs-login; free mode excludes; serial mode = preflight block or mid-run timeout UI (§9.5) |
| Google blocks Gemini login | blocked-login DOM detected | banner + system-browser guidance (§10.1) |
| Provider-side error UI (rate limit / refusal / verification) | response never appears; error-as-DONE (§8.3) | bubble shows `[Error: …]`; serial workflows surface timeout/retry/skip UI |
| Cloudflare challenge | challenge DOM detected, or a known Grok challenge title observed natively | pane surfaces webview for manual solve; bridge startup remains deferred; the native title observer may report Grok as blocked without page injection |
| Workflow step stall | no chunk within step timeout | countdown UI → retry / skip / cancel (§9) |
| Adapter fetch fails | reqwest error / validation fail | silent fallback to cache; toast on downgrade |
| Bridge: corrupted title / failed or unparseable pull | codec error, pull timeout, size cap | drop + `bridge:'degraded'` status; pull retry-once (§7.3); persistent ⇒ stale chip + reload suggestion |
| Bridge stall | STATUS_REPORT staleness > 30 s | watchdog per §9.4 |
| SPA navigation dropped engine | STATUS_REPORT dom=unknown on live bootId | auto re-eval engine + adapter ≤ 2 s (§8.1 step 7) |
| engine.ts eval throws | eval error surfaced to Rust | mark dom=unknown, retry once, then broken banner + REPORT_BROKEN offer |
| Child webview creation fails | provider_open error (unstable API) | pane error banner + docs pointer to `multiwindow-fallback` build; no runtime auto-switch (v1) |
| WebView2 runtime missing (portable) | preflight check at startup | dialog with Evergreen download link (README-portable) |
| HackMD publish fails | reqwest / API error | toast with error, conversation retained; token issues → Settings hint |
| Disk full / profile write fails | settings/profile IO error | non-fatal toast; app continues in-memory |
| SSO popup blocked | provider opens login via `window.open` | on_navigation policy routes to in-webview nav where possible; else opener + banner |
| Graph validation fails | built-in graph load / pack import validation | **NEXT-PHASE (N0/N3):** block run/import; show node/edge/template error; no partial install |
| Pack requires unavailable provider | pack metadata / preflight | auto-complete panel (§9.6) before hard block; **NEXT-PHASE (N3/N4):** if the pack permits partial sendable-set execution, run only after explicit consent and record degraded state; no silent provider substitution |
| Adapter version below pack minimum | `minAdapterVersion` comparison | block run until adapter update or user imports compatible pack version; **NEXT-PHASE (N4):** catalog card shows degraded badge with required/current versions |
| Partial sendable-set run | pack policy + explicit user consent | **NEXT-PHASE (N3/N4):** omit named providers/roles only as declared by the pack, show degraded badge in run trace, and record the omission in snapshot/session checkpoint |
| Relay checkpoint abandoned | checkpoint open while workflow active | **NEXT-PHASE (N2):** workflow remains paused; user may confirm / skip / cancel; no auto-send fallback |
| Snapshot persistence disabled | user did not opt in | in-memory snapshot only; full replay after restart unavailable; **NEXT-PHASE (N1):** minimum session checkpoint still resumes graph id / step index / pending checkpoint |
| Snapshot write fails | disk/full/permission/serialization error | **NEXT-PHASE (N1):** run continues; toast + debug bundle note; no provider transport impact |
| Replay mismatch | graph/version/provider/adapter requirements differ | **NEXT-PHASE (N1):** block or require explicit "replay with current graph"; record mismatch in new snapshot |
| Chip promotion fails | hibernated webview recreate/login/bridge failure | **NEXT-PHASE (N5):** chip → stale/needs-login; user can retry open/login; profile is not deleted |
| Local file extraction fails | unsupported type / parser error / size cap | **NEXT-PHASE (N7):** attachment chip shows error; no hidden upload; user may insert plain text manually |

## 14. Testing

- Unit (vitest): workflow engine mode sequencing with mocked `host` through `executeGraph` (golden tests replicate original ordering incl. coding 8-step, roundtable history accumulation, `ROLE_ASSIGNMENT` consumption order, error-as-DONE unblocking, free-mode default-targets parity, serial preflight block); adapter schema validator; title codec round-trip; outbox pull batch parsing + `(bootId, mid)` dedup.
- **NEXT-PHASE (N0/N1/N2/N3/N4):** graph tests cover built-in graph validation, pack import validation, relay checkpoint pauses/confirm/skip, `FILL_DRAFT` inserts without send activation, "auto-fill but never auto-send" assertion, replay version mismatch, snapshot redaction tiers, minimum session checkpoint resume, partial-run consent, and catalog degraded badges.
- Rust (`cargo test`): title codec (prefix/seq dedup/bootId switch), navigation policy table, adapter validation + version comparison, settings IO, provider profile path validation. **NEXT-PHASE (N1):** snapshot/log retention IO and session-checkpoint persistence. *(Sentinel reassembly tests retire with the transport in M2.)*
- CI: §5.1 seed-adapter diff script plus executed Rust library tests on Windows, macOS, and Linux. **NEXT-PHASE (N9):** new provider seed + adapter promotion gate runs §14 golden tests for all five modes, unless the PR declares a §18.2 mercy tier.
- Capability/security tests: capability targets `webviews:["main"]` and omits `windows`/`remote`, production CSP preserves only required control-pane connections, `withGlobalTauri:false`, and provider webviews receive no Tauri capability.
- Adapter Rust tests reject HTTPS credential/port/query tricks, provider-host expansion, and SSO path broadening while allowing selector/timing changes inside bundled URL scopes.
- Agent source-contract tests validate the manifest/schema, entrypoint/package alignment, Skill-body parity, explicit invocation, JSON output, invalid-usage exit code, audit/dry-run non-mutation, current-run READY segmentation, and runner identity. CI executes them on Windows, macOS, and Linux; GUI observation remains a separate manual claim.
- Manual smoke checklist per milestone (docs/PLAN.md): create webviews, login persist across restart, send/receive on shipped providers, DPI 100/125/150%, mode runs, cancel/stop, hot-update, portable zip run, graph parity, snapshot replay, pack import/export, chip/side/center promotion, local-file insert.
- Playwright-driven adapter smoke against live sites can run on CI cron; it must not require API keys.

## 15. Closed decisions

1. Callback-pull transport is the frozen bridge implementation.
2. The product remains in `teddashh/multi-ai-chat-desktop` with identifier `com.tedh.multiaichat` and name **Multi-AI Chat Desktop**.
3. Adapter signing, Developer ID/notarization, and self-update are closed scope; ad-hoc macOS bundle signing is release integrity, not a new signing program.
4. Durable snapshots stay opt-in; snapshot/replay/checkpoint behavior is compatibility-only and will not gain new schemas or UI.
5. Terminal-agent work, if pursued, is a separate product and repository.
6. The only final presentation work is the AI-Sister ensemble commemorative theme.
7. The repository-scoped Agent-Ready Source Release remains a narrow source-launch contract, not Docker, a package manager, daemon, embedded agent SDK, or host rollback system.

## 16. Changelog

- **v2.2.6 (2026-07-18)** — challenge-passive status repair: keeps bridge startup deferred on provider security checks, surfaces known Grok challenge titles through Tauri's native title observer, replaces the misleading cross-profile login promise, and adds focused frontend/Rust coverage.
- **v2.2.5 (2026-07-15)** — response-language echo hardening: moves the internal routing policy before the provider request, marks it as non-user-visible metadata, and sanitizes complete, fenced, or partially streamed policy echoes before workflow/UI consumption.
- **v2.2.4 (2026-07-13)** — response-language compatibility repair: separates interface and response language, applies a question-aware policy to every provider-bound workflow prompt, versions the changed built-in graphs, and preserves retained replay policy without expanding the snapshot schema.
- **v2.2.3 (2026-07-12)** — Apple Silicon compatibility follow-up: records the first successful real-Mac `v1.0.1` launch and three-provider login report, while treating Grok's Cloudflare verification loop as a release blocker. Grok and its challenge frames no longer receive permission Web-API monkey-patches, and only Cloudflare-required `about:blank` / `about:srcdoc` auxiliary navigation is added. Final success remains pending an Apple Silicon retest.
- **v2.2.2 (2026-07-12)** — formalizes the Codex/Claude source-launch path as Agent-Ready Source Release contract 1.0.0: strict manifest/schema, explicit trust and permission boundaries, deterministic JSON lifecycle commands, read-only dry-run, local before/after receipts, current-run control-pane READY evidence, identity-safe stop, Skill drift tests, and cross-platform CI self-tests. Explicitly rejects Docker, silent host installation, automatic rollback, and readiness claims based only on process creation.
- **v2.2.1 (2026-07-11)** — final hardening clarification: preserves same-session roundtable history and existing prompts while correcting snapshot app-version provenance, adding session-safe Markdown provenance, narrowing Tauri capability scope to the `main` webview, enabling production CSP, locking remote adapters to bundled URL scopes, and documenting private security reporting plus honest platform/provider smoke evidence.
- **v2.2 (2026-07-11)** — feature-freeze decision: retires all N-series expansion, preserves shipped snapshot/replay/checkpoints as compatibility-only, closes updater/signing/editor/marketplace work, and scopes one final AI-Sister ensemble theme before maintenance-only status.
- **v2.1 (2026-07-10)** — fixes the web edition at four providers and retires the unfinished fifth-provider/N6 experiment. Source launch from local Codex and Claude Code desktop sessions is documented in the README and implemented as repo-scoped Skills; it does not add another provider or alter the web bridge.
- **v2.0 (2026-07-06)** — additive roadmap pivot: preserves the v1 Chrome-extension port as the hard floor and specifies graph-driven presets, execution snapshots + replay, human relay checkpoints, `.macflow.json` workflow packs, preset catalog + read-only process trace, RAM-aware chip/side/center webviews, local-file inject v2, staged contributor graph view/constrained editor, and OSS temperature/governance loop. A fifth web-provider experiment was later retired to keep this edition focused on its four stable web sessions. Explicitly preserved byte-intact/unchanged: §5.1 normative seed adapter table, §6.1 capabilities/security scoping, §7 bridge protocol, §8.2 named input strategies, and zero-API-key web-session identity.
- **v1.2.1 (2026-07-04)** — M2 review corrections to §7.3: pull expression returns the **bare** `peekOutbox()` array (the transport's `ExecuteScript` already JSON-serializes once; the v1.2 `JSON.stringify(...)` wrapper double-encodes — live-gate-proven transport kill) with a mandatory `__MAC_BRIDGE__ ?` guard; degraded state gains an explicit recovery rule (new bootId / reload clears it — never permanent); 1 MB pull cap enforced at enqueue with a truncation policy (oversized `RESPONSE_DONE` truncated with a `truncated: true` flag — no silent final-answer loss, no wedged entry). Added `doneReady: true` marker on the immediate DONE hint (§7.3 Ready hint) so the §7.5-rule-2 5 s watchdog arms **only** on a real DONE hint, never at send time or on chunk hints (fix-pass re-review found the send-time arming corrupts grok's 8 s `doneDelayMs` window). Source: M2 multi-agent review + fix-pass re-review + live gate `plans/m2-log.md`.
- **v1.2 (2026-07-03)** — M1 gate amendment: §7.3 rewritten from sentinel navigation to **`eval_with_callback` pull** (outbox + ready hint + peek/ack pull; sentinel retired to a defensive navigation block, ingest removed in M2). Corollaries: §7.2 fallback = hint-less outbox polling; §7.4 bulk bypasses Rust bus; §7.5 wording; §6.0/§6.3 on_navigation; §13 bridge-error row; §14 test list; open question 1 resolved. Live gate data: `plans/m1-bridge-findings.md`.
- **v1.1 FINAL (2026-07-03)** — integrated adversarial reviews (grok B1–B5/M1–M10, codex 6 blocking/12 major, minors from both). Headlines: named input strategies replace customScript; sentinel framing (bootId/mid/segIdx/segTotal/len, 8 KB, ack); title channel hardening (U+200B, lastSeq, coalesce); DONE authority = sentinel only; boot/re-injection lifecycle; Rust bus made dumb (TS owns waiters); `targets` declared improvement #4; serial preflight; normative seed table §5.1; capabilities zero-permission rule; geometry contract; privacy contract for reports; expanded §13/§14. Dispositions: `.orchestration/reviews/spec-author-responses.md`.
- v1.0 DRAFT (2026-07-03) — initial contract.

## 17. Feature-freeze and maintenance policy

Allowed after the commemorative edition:

- provider selector/DOM compatibility fixes and adapter hot-updates;
- security fixes, privacy corrections, data-loss prevention, and crash fixes;
- dependency, CI, packaging, and operating-system build-breakage fixes;
- compatibility fixes for the versioned Agent source manifest, lifecycle scripts, and shipped Codex/Claude Skills;
- accessibility corrections that do not redesign workflow behavior;
- documentation corrections for shipped behavior.

Closed permanently in this repository:

- snapshot/replay/checkpoint expansion, new persistence formats, or comparison UI;
- workflow-pack import/export, marketplace, graph editor, promotion metrics, or telemetry;
- fifth provider, embedded SDK/CLI agents, or terminal orchestration;
- Docker/container source launch, automatic host-tool installation/uninstallation, or machine-wide rollback;
- self-update, package-manager distribution, Developer ID/notarization program, or new platform matrix;
- new workflow modes or changes to the five shipped sequences.

## 18. Final AI-Sister commemorative theme

The final scoped feature is the shipped optional presentation theme featuring all four AI-Sister characters together. It adds supplied artwork, provider avatars, active-speaker treatment, color tokens, and themed panel surfaces while preserving the default theme, text contrast, keyboard focus, reduced-motion behavior, responsive layout, and every provider/workflow behavior. Asset provenance and implementation scope are defined in `docs/AI-SISTER-THEME.md`.
