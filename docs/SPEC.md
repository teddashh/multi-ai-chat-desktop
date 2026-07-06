# SPEC — Multi-AI Chat Desktop (Tauri 2)

> Status: **v2.0** (additive product contract; v1.2.1 frozen clauses preserved; §16 changelog)
> Date: 2026-07-06
> Upstream decisions: `docs/ARCHITECTURE.md` v1.0 (D1–D7), `docs/PLAN.md`, and `.orchestration/analysis/roadmap-synthesis.md` (N0–N9). Evidence: `docs/study/*.md`, `.orchestration/analysis/roadmap-grok.md`, `.orchestration/analysis/refs-survey.md`.
> Review history: v1.0 DRAFT reviewed adversarially by codex + grok (both REQUEST-CHANGES); all blocking/major findings integrated. v1.2.1 live-gated the callback-pull bridge. v2.0 evolves that contract additively from the rethought roadmap and keeps §5.1, §6.1, §7, §8.2, and the zero-key identity byte-intact/behavior-intact.
> Audience: implementing agents (codex) and community contributors.

## 0. One-paragraph summary

A Tauri 2 desktop app (Windows-first) with one main window: a central **control pane** (our React UI) flanked by **child webviews** loading the real AI chat websites (SHIPPED: ChatGPT, Claude, Gemini, Grok; NEXT-PHASE N6a: code-defined additions such as Claude Code). The user types once in the control pane; the message is injected into every provider page via DOM automation (ported from the MIT-licensed `multi-ai-chat` Chrome extension); streaming responses are scraped back and aggregated in the control pane. Five workflow modes (free/debate/consult/coding/roundtable) remain the shipped parity floor, and the v2 roadmap turns that floor into graph-driven presets with execution snapshots, replay, human relay checkpoints, and one-click workflow-pack sharing. Zero API keys: everything rides on the user's logged-in web sessions. Provider DOM selectors live in community-maintained `adapters/*.json` with remote hot-update. The product pivot is 底線硬、入口軟: hard adapter/transport/security floor, soft preset entry; the killer feature is reproducibility, not a day-one graph editor. NEXT-PHASE (N0/N4/N6) owner rule: "每個 adapter 進入預設五 workflow;選了 workflow 自動補齊 adapter."

## 1. Goals / Non-goals (v2.0)

### Goals
- G1. **SHIPPED floor:** single window: control pane + provider webviews, resizable, show/hide per provider.
- G2. **SHIPPED floor:** port the original extension's injection engine (`createContentScript`) and all 5 workflow modes with identical semantics, **except the four declared improvements** (§1.1).
- G3. **SHIPPED floor:** adapter system: JSON per provider, schema-validated, hot-updated from GitHub raw, last-known-good cache, one-click broken-DOM report.
- G4. **SHIPPED floor:** per-provider persistent login sessions (WebView2 profile dirs). Login survives app restarts.
- G5. **SHIPPED floor:** Windows NSIS installer and portable zip. **NEXT-PHASE (M6):** in-app auto-update.
- G6. **SHIPPED floor:** MIT, community-forkable; `adapters/` contributable without touching Rust for existing providers.
- G7. **NEXT-PHASE (N0):** graph-driven presets route production workflows through `executeGraph` while preserving all five modes' golden observable sequences. Current state: graph types/executor exist under `src/workflow/graph/`, but `runWorkflow` still calls imperative mode handlers at `src/workflow/index.ts:68-71`.
- G8. **NEXT-PHASE (N1):** execution snapshots + replay: each run can produce a reproducibility record containing graph id/graphVersion, provider adapter versions, role map, step inputs/outputs, human edits, timestamps, and app version; durable storage is opt-in with redaction tiers. Current graph code has no monotonic content `version`; N0/N1 must add `graphVersion` or an explicit equivalent.
- G9. **NEXT-PHASE (N2):** human relay checkpoints auto-fill the next step's draft in the control pane and require explicit user confirmation before sending; default mode behavior stays auto-for-parity until a checkpoint is enabled.
- G10. **NEXT-PHASE (N3):** workflow pack export/import (`.macflow.json`) for one-click sharing: graph + role defaults + prompt templates + metadata.
- G11. **NEXT-PHASE (N4):** preset catalog UX becomes the primary entry: cards with cost labels, required providers, estimated time, RAM hints, login prerequisites, and a read-only process trace.
- G12. **NEXT-PHASE (N5):** RAM-aware webview presentation states: session-ready chip → side rail → center stage, with lazy recreate/hibernate while preserving WebView2 profile directories.
- G13. **NEXT-PHASE (N6a):** Claude Code is added web-first as `claude.ai/code` via a web-DOM adapter provider (`claude-code`), using the existing frozen bridge. A lightweight terminal-agent adapter class is only a later separate adapter class, not an embedded SDK and not a change to §7.
- G14. **NEXT-PHASE (N7):** local file inject v2: drag/drop or picker can extract supported local text contexts (text now; PDF/DOCX later), chunk them, and optionally fan out to sendable providers or workflow steps.
- G15. **NEXT-PHASE (N8):** contributor graph view first, constrained editor last: read-only graph/process visualization before any limited editor; no arbitrary n8n-grade node wall as a launch surface.
- G16. **NEXT-PHASE (N9):** open-source flywheel: workflow packs can be PR'd back with metadata, maintenance state, cost label, local `downloadCount`/`lastDownloadedAt`, and completion signals that avoid telemetry by default.

### 1.1 Declared behavior improvements (the ONLY intentional deviations)
1. **Status tri-state** — `ProviderState` replaces the original boolean `connected` (ARCH D5 #1).
2. **Step timeout UI** — 600s timeout surfaced with countdown + retry + skip (ARCH D5 #2), plus serial-mode preflight (§9.5).
3. **Explicit bus routing** — replaces Chrome implicit broadcast (ARCH D5 #3).
4. **Functional free-mode `targets`** — user may deselect providers for free mode; default (nothing deselected) = all sendable = original fan-out parity (golden-tested).

Everything else must match the original extension's observable behavior. Any other deviation found in review is a bug.

### 1.2 v2 capability additions

The following capabilities are intentional extensions beyond the extension parity surface. They MUST NOT change the shipped five-mode golden sequences unless the user enables a new v2 affordance:

1. **NEXT-PHASE (N0) Graph-driven presets** — built-in and imported presets are backed by `WorkflowGraph` definitions; the graph substrate is internal first and UI-visible later.
2. **NEXT-PHASE (N1) Execution snapshots + replay** — reproducibility records capture workflow structure, adapter versions, role mappings, redaction-tiered inputs/outputs, human edits, timestamps, and app version; they never capture cookies or provider storage.
3. **NEXT-PHASE (N2) Relay checkpoints** — optional graph step policies pause between providers, auto-fill a control-pane draft, and wait for Confirm / Skip / Edit-in-provider.
4. **NEXT-PHASE (N3) Workflow packs** — `.macflow.json` files carry graph, role defaults, prompt templates, and metadata (`displayName`, `description`, `costLabel`, `requiredProviders`, `estMinutes`, `author`, `minAdapterVersion`).
5. **NEXT-PHASE (N4) Preset catalog + process trace** — cards are the soft entry; read-only trace is the transparency layer; graph editing is deferred.
6. **NEXT-PHASE (N5) RAM three-state webviews** — providers can sit as a session-ready chip, side rail, or center stage; hibernate destroys the webview but preserves its profile.
7. **NEXT-PHASE (N6a) Claude Code web adapter** — `claude-code` is a code-defined web-DOM provider for `claude.ai/code`; it reuses the frozen web bridge.
8. **NEXT-PHASE (N7) Local-file inject v2** — local files become controlled workflow inputs, not hidden uploads; text extraction/chunking is local.
9. **NEXT-PHASE (N8) Contributor graph view → constrained editor** — read-only view first; a limited editor may later reorder serial steps, swap role providers, or edit prompt templates.
10. **NEXT-PHASE (N9) OSS feedback loop** — pack metadata and local counters can surface temperature/maintenance state without adding a telemetry server.

### Non-goals (v2.0)
- No API-key mode. This is not a deferred option: zero-key web-session identity is the product core.
- No automatic full conversation persistence. Snapshots and replay are opt-in and redaction-tiered; in-memory chat plus explicit export remains valid.
- No macOS/Linux release builds as a v2.0 launch gate (code stays portable; CI matrix can come later).
- No split-tree drag-and-drop layout. The v2 RAM model is chip/side/center, not a tempo-term pane tree.
- No remote Tauri IPC to provider origins. No local WebSocket server for provider pages.
- No code signing certificate as a spec requirement; release/updater hardening continues without making signing a behavior dependency.
- No new provider IDs via adapters alone: **the provider set is fixed and code-defined**; adding `claude-code` or any future provider requires code changes (types, UI labels, seed adapter/profile dir).
- No adapter signing in v2.0 (schema validation + repo-pinned HTTPS only; signing remains v2+).
- No arbitrary n8n-grade workflow editor. The end-state editor is constrained and contributor-oriented.
- No embedded Claude/Codex SDK path. The immediate Claude Code adapter is web-DOM; any later terminal-agent adapter spawns a local CLI/PTY as a separate adapter class and does not alter §7.
- Capability Tags are deferred; preset metadata remains explicit fields until usage proves the taxonomy.

## 2. Tech stack (pinned)

| Layer | Choice | Rationale |
|---|---|---|
| Shell | Tauri 2 — **exact-patch pin** `=2.x.y` in Cargo.toml (tauri, tauri-build, all plugins aligned to same minor) | child webviews need `unstable` cargo feature (ARCH D1) |
| Rust crates | tauri (features `["unstable"]`), tauri-plugin-updater, tauri-plugin-dialog, tauri-plugin-opener, reqwest, serde/serde_json, tokio, thiserror | same set proven in refs; updater registration remains NEXT-PHASE (M6) |
| Frontend | React 18 + TypeScript 5 + Vite + Tailwind CSS | direct port of original sidepanel UI plus preset catalog/process trace |
| State | Zustand | small, proven pattern (clean-room) |
| Injected scripts | TypeScript compiled to IIFE strings via esbuild (build step), embedded via `include_str!` | one bundle per concern: bootstrap, engine |
| Workflow graph | `src/workflow/graph/` TypeScript graph types/validator/executor | already present and golden-tested for debate; N0 wires to production (`src/workflow/index.ts:68-71` currently bypasses it) |
| Package manager | pnpm (pinned via `packageManager` field) | BAT convention |
| Monorepo layout | single package + `src-tauri/` | matches both refs |
| Future graph UI dep | `@xyflow/react` / React Flow only when N8b starts | neither `better-agent-terminal` nor `tempo-term` provides an editable workflow canvas |

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

`WorkflowGraph`, graph nodes, and graph edges already live internal to `src/workflow/graph/`; v2.0 makes that existing graph substrate production-routed at N0. Snapshot replay's `graphVersion` is a **NEXT-PHASE (N0/N1)** field to add to the existing graph schema, or to map to another explicit content-versioning field. It MUST NOT be treated as a shipped field today.

### 4.2 v2 TARGET additions

The following target additions do not exist as a complete `shared/types.ts` surface today. They are **NEXT-PHASE** additions and must be added schema-validly in the named milestone.

```ts
type AIProviderV2 = AIProvider | 'claude-code'; // NEXT-PHASE N6a.
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
  graphVersion: number;                      // NEXT-PHASE N0/N1 content-version field.
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

**NEXT-PHASE (N6/N9) contributor gate:** a new provider seed + adapter PR MUST pass the §14 golden tests for all five shipped modes (`free`, `debate`, `consult`, `coding`, `roundtable`) before promotion, OR declare an explicit mercy tier (§18.2) at merge. The CI gate (§12/§14) enforces this for promoted providers and keeps the five-mode floor as the adapter quality bar.

The §5.1 table below is the frozen v1 seed contract for the four shipped chat providers. N6a `claude-code` is a separate code-defined web provider addition; it must add its own seed adapter/profile-dir code path without rewriting or weakening the frozen table.

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

- Control pane window label: full local IPC (the command set in this spec) via `capabilities/default.json`.
- `ai-<provider>` labels: **ZERO Tauri permissions**. No capability entries, no `remote.urls`, no plugin access. All provider communication is eval / title / navigation only (ARCH D3).
- `withGlobalTauri: false`. Renderer never imports Tauri APIs outside `src/host/`.

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
2. URL matches adapter `urls.match` or `urls.login` ⇒ allow.
3. Host in shared SSO allowlist (`shared/constants.ts`: `accounts.google.com`, `accounts.youtube.com`, `appleid.apple.com`, `login.microsoftonline.com`, `login.live.com`, `github.com`) or adapter `urls.ssoMatch` ⇒ allow (SSO flows stay in-webview).
4. Anything else ⇒ **return false** + open in system browser via opener plugin.

**NEXT-PHASE (N6a):** `claude-code` follows the same policy class as the other web-DOM providers: `claude.ai/code` and its login/SSO hosts are adapter-owned URL data, and any new allowed host must arrive through the code-defined provider addition plus adapter validation. A later terminal-agent adapter class has no provider webview navigation policy and does not alter this section.

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

**NEXT-PHASE (N6a):** `claude-code` is another web-DOM adapter that uses this same engine and §7 bridge. The later terminal-agent class, if built, is a separate adapter class outside `injected/engine.ts` and MUST NOT add provider-page Tauri permissions or modify §7.

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
- **NEXT-PHASE (N0/N1):** graph versions are monotonic integers. Current `src/workflow/graph/types.ts:8-18` has no monotonic content `version`; N0/N1 MUST add `graphVersion` or an explicit equivalent before snapshot replay depends on it. A snapshot records `graphId` + `graphVersion`; replay refuses to silently substitute a different graph version unless the user explicitly selects "replay with current graph".
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
- Replay never reuses cookies or provider storage from the snapshot. It uses the current user's logged-in web sessions and blocks preflight if required providers are unavailable.
- Replay can compare prior output refs against new outputs when the redaction tier preserved comparable material or hashes. Metadata-only snapshots can replay structure but cannot display prompt/output text.
- Replay is a workflow run and therefore emits normal `WORKFLOW_STATUS`, `ROLE_ASSIGNMENT`, process-trace, timeout, cancel, and snapshot events.
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

**NEXT-PHASE (N0/N4/N6):** adapters and presets are mutually discoverable modules per the owner rule in §0.

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

Existing pane chrome remains: per-provider header (show/hide/promote, reload, open-login, report-broken), degraded-state banners, adapter update toast, and placeholder with "Open <provider>" (lazy creation, §6). **NEXT-PHASE (N5):** session-ready chip uses the same area. Export (.md download via dialog+fs) and HackMD publish (Rust reqwest command `publish_hackmd`) port as-is.

### 10.1 OPEN_LOGIN semantics (per provider)

Desktop deviation from the original "open new tab" (equivalent outcome, documented):

| Provider | Default action | Blocked path |
|---|---|---|
| chatgpt / claude / grok | navigate `ai-<provider>` webview to `adapter.urls.login`, show + focus pane | — |
| claude-code (NEXT-PHASE N6a) | after N6a, navigate `ai-claude-code` webview to `adapter.urls.login`, show + focus pane | — |
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

**SHIPPED today:** `<app-data>/settings.json` via Rust settings.rs (BAT pattern) stores pane layout + slot assignment, open-provider set (for lazy restore), adapter channel/base-URL, HackMD token, updater channel, portable flag, and `telemetry=none`. Current `src/ui/settingsModel.ts` `AppSettings` has NO snapshot, pack-catalog, RAM, or presentation fields.
**HackMD token is stored in plaintext in settings.json — an accepted v1 tradeoff, disclosed in the Settings UI ("stored unencrypted on this machine") and README. OS keychain storage is v2+.**

**SHIPPED today:** `<app-data>/webviews/<provider>/` holds WebView2 profiles (login sessions; preserved on provider_close; deleted only via Settings "forget login"). `<app-data>/adapters-cache/` holds last-known-good adapters.

**SHIPPED today:** diagnostics/event log is in-memory only (`src/diagnostics/eventLogStore.ts` module array, `src/diagnostics/eventLog.ts` cap 500); no snapshot/pack/execution-log persistence exists until N1/N3.

**NEXT-PHASE (N1):** settings gain snapshot opt-in defaults and a minimum session checkpoint (graph id, step index, pending checkpoint id/action state) so an interrupted metadata-only run can resume where it stopped. Full replay remains opt-in.

**NEXT-PHASE (N5):** settings gain webview presentation state (`chip`/`side`/`center`) and RAM chip state.

**NEXT-PHASE (N3/N9):** settings or a bounded local pack index gain pack catalog entries and pulse metadata (`downloadCount`, `lastDownloadedAt`, `successRate`/`compatibilityReports`). These counters are local-only and MUST NOT upload automatically.

**NEXT-PHASE (N3):** `<app-data>/workflow-packs/` stores imported `.macflow.json` files after validation; built-in packs remain bundled/read-only.

**NEXT-PHASE (N1):** `<app-data>/snapshots/` stores opt-in `ExecutionSnapshot` records. Snapshots, packs, logs, and session checkpoints reference provider ids and adapter versions, NEVER cookies, storage, or profile files. Redaction tiers:
- `metadata-only`: graph/provider/adapter/timestamps/status only; no prompt/output text or hashes.
- `hashes`: metadata plus content hashes for compare-without-display.
- `prompt-text`: prompts and human edits; provider outputs are hashes/refs unless explicitly included.
- `full-local`: prompts, outputs, and human edits stored locally for full replay/compare. Never includes cookies or provider storage.

**NEXT-PHASE (N1):** `<app-data>/execution-logs/` stores bounded-channel JSONL run logs with retention. Tempo's `session_log` pattern is useful inspiration, but the local checkout has no LICENSE; reimplement the bounded-channel/retention shape rather than copying verbatim. Better Agent Terminal's MIT window registry/message-archive patterns may be adapted with notice for opaque snapshot storage and paging.

No telemetry server is introduced. Temperature/usage counters for packs are local unless a future governance decision explicitly adds an opt-in sharing channel.

## 12. Packaging / release

- **SHIPPED floor:** `tauri.conf.json` identifier `com.tedh.multiaichat` (final TBD by owner), Windows NSIS installer + Evergreen WebView2 `downloadBootstrapper`, and portable zip packaging.
- **NEXT-PHASE (M6):** updater artifacts, updater endpoint, minisign registration, and in-app auto-update. Current state: `src-tauri/tauri.conf.json:46` = `"createUpdaterArtifacts": false`; `src-tauri/src/lib.rs:10` = `TODO(SPEC §12, M6): register updater plugin with minisign pubkey`.
- **NEXT-PHASE (M6):** set `createUpdaterArtifacts: true`, upload updater `latest.json` to the fixed **`manifests`** GitHub release (BAT pattern, ARCH D7), register the updater plugin with the minisign public key, and surface in-app update checks in Settings.
- Portable zip job: after NSIS build, zip the raw `target/release` app dir + `README-portable.txt` (WebView2 preflight note). **`PORTABLE` marker file present ⇒ updater disabled at runtime AND the updater section is hidden in Settings.**
- `release.yml` adapted from BAT (MIT attribution preserved): tag `v*` → verify (tsc, vitest, cargo check, adapter schema validation + §5.1 diff) → windows build → GitHub Release upload. **NEXT-PHASE (M6):** also upload `latest.json` to `manifests`. Version injected from tag.
- `ci.yml`: PR gate = tsc + eslint + vitest + `cargo clippy` + adapter schema validation + §5.1 seed diff (adapter-only PRs get fast feedback without full build). **NEXT-PHASE (N6/N9):** new provider seed + adapter PRs must pass §14 golden tests for all five modes before promotion, or carry a declared §18.2 mercy tier at merge.
- Release/updater hardening and verification should adapt Better Agent Terminal MIT patterns with notice: resource boundary checks, updater manifest validation, release-readiness scripts, and capabilities tests.
- Capability tests are v2 gates: provider labels (`ai-<provider>`) MUST be absent from capabilities; no Tauri imports outside `src/host/`; provider webviews receive no `remote.urls`.
- Tempo release/webview lifecycle examples are pattern-reference only until licensing is confirmed; do not copy local Tempo code verbatim.

## 13. Error handling & degraded states

| Failure | Detection | Behavior / UX |
|---|---|---|
| Provider DOM changed | selectors miss **5** consecutive times / send fails | pane banner "adapter broken" + one-click REPORT_BROKEN (§10.2); **NEXT-PHASE (N4):** catalog cards requiring this provider show a degraded badge |
| Login expired | loggedOut/login detectors flip | chip → needs-login; free mode excludes; serial mode = preflight block or mid-run timeout UI (§9.5) |
| Google blocks Gemini login | blocked-login DOM detected | banner + system-browser guidance (§10.1) |
| Provider-side error UI (rate limit / refusal / verification) | response never appears; error-as-DONE (§8.3) | bubble shows `[Error: …]`; serial workflows surface timeout/retry/skip UI |
| Cloudflare challenge | challenge DOM detected | pane surfaces webview for manual solve; engine pauses |
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
- CI: §5.1 seed-adapter diff script. **NEXT-PHASE (N6/N9):** new provider seed + adapter promotion gate runs §14 golden tests for all five modes, unless the PR declares a §18.2 mercy tier.
- Capability/security tests: provider labels absent from capabilities, `withGlobalTauri:false`, no Tauri imports outside `src/host/`, provider webviews have no `remote.urls`.
- Manual smoke checklist per milestone (docs/PLAN.md): create webviews, login persist across restart, send/receive on shipped providers, DPI 100/125/150%, mode runs, cancel/stop, hot-update, portable zip run, graph parity, snapshot replay, pack import/export, chip/side/center promotion, local-file insert.
- Playwright-driven adapter smoke against live sites can run on CI cron; it must not require API keys.

## 15. Open questions (tracked, non-blocking)

1. ~~`eval_with_callback` availability on child `Webview`~~ — **RESOLVED at M1 gate (2026-07-03)**: available on Tauri 2.11.x child webviews, live-verified at 192 KB; §7.3 amended to the callback pull transport.
2. Final repo home: new repo vs `desktop/` in teddashh/multi-ai-chat — **owner decision**.
3. App identifier / product name final ("Multi-AI Chat Desktop" placeholder).
4. Adapter signing — v2+ (threat model documented in §1 non-goals).
5. Snapshot default UX: durable snapshots are opt-in; product copy must make replay limitations visible when the user chooses metadata-only/no persistence.
6. Terminal-agent adapter class — future-only. If accepted later, it is a separate PTY/CLI adapter class and not BAT's embedded SDK/server machinery.

## 16. Changelog

- **v2.0 (2026-07-06)** — additive roadmap pivot: preserves the v1 Chrome-extension port as the hard floor and specifies graph-driven presets, execution snapshots + replay, human relay checkpoints, `.macflow.json` workflow packs, preset catalog + read-only process trace, RAM-aware chip/side/center webviews, Claude Code web adapter (`claude.ai/code`) as `claude-code`, local-file inject v2, staged contributor graph view/constrained editor, and OSS temperature/governance loop. Explicitly preserved byte-intact/unchanged: §5.1 normative seed adapter table, §6.1 capabilities/security scoping, §7 bridge protocol, §8.2 named input strategies, and zero-API-key web-session identity.
- **v1.2.1 (2026-07-04)** — M2 review corrections to §7.3: pull expression returns the **bare** `peekOutbox()` array (the transport's `ExecuteScript` already JSON-serializes once; the v1.2 `JSON.stringify(...)` wrapper double-encodes — live-gate-proven transport kill) with a mandatory `__MAC_BRIDGE__ ?` guard; degraded state gains an explicit recovery rule (new bootId / reload clears it — never permanent); 1 MB pull cap enforced at enqueue with a truncation policy (oversized `RESPONSE_DONE` truncated with a `truncated: true` flag — no silent final-answer loss, no wedged entry). Added `doneReady: true` marker on the immediate DONE hint (§7.3 Ready hint) so the §7.5-rule-2 5 s watchdog arms **only** on a real DONE hint, never at send time or on chunk hints (fix-pass re-review found the send-time arming corrupts grok's 8 s `doneDelayMs` window). Source: M2 multi-agent review + fix-pass re-review + live gate `plans/m2-log.md`.
- **v1.2 (2026-07-03)** — M1 gate amendment: §7.3 rewritten from sentinel navigation to **`eval_with_callback` pull** (outbox + ready hint + peek/ack pull; sentinel retired to a defensive navigation block, ingest removed in M2). Corollaries: §7.2 fallback = hint-less outbox polling; §7.4 bulk bypasses Rust bus; §7.5 wording; §6.0/§6.3 on_navigation; §13 bridge-error row; §14 test list; open question 1 resolved. Live gate data: `plans/m1-bridge-findings.md`.
- **v1.1 FINAL (2026-07-03)** — integrated adversarial reviews (grok B1–B5/M1–M10, codex 6 blocking/12 major, minors from both). Headlines: named input strategies replace customScript; sentinel framing (bootId/mid/segIdx/segTotal/len, 8 KB, ack); title channel hardening (U+200B, lastSeq, coalesce); DONE authority = sentinel only; boot/re-injection lifecycle; Rust bus made dumb (TS owns waiters); `targets` declared improvement #4; serial preflight; normative seed table §5.1; capabilities zero-permission rule; geometry contract; privacy contract for reports; expanded §13/§14. Dispositions: `.orchestration/reviews/spec-author-responses.md`.
- v1.0 DRAFT (2026-07-03) — initial contract.

## 17. Roadmap (N0–N9)

Sequence: N0 → N1 → N2+N4 → N3 → N5 → N6 → N7 → N8 → N9. N5 may parallelize with N1 if a second track owns `webviews.rs` + layout. None of these milestones reopens the zero-key identity. N0/N4/N6 implement the owner rule from §0: every promoted adapter enters the built-in five workflows, and choosing a workflow auto-completes missing adapters/providers before hard-blocking.

| # | Milestone | What / why | Frozen transport impact |
|---|---|---|---|
| N0 | Graph → production | Route `runWorkflow` through `executeGraph`; graph exists but is currently unwired at `src/workflow/index.ts:68-71`; this unlocks presets while preserving five-mode parity. | No — reuses existing `sendAndWait` / `runStep`. |
| N1 | Execution snapshots + replay | Persist opt-in reproducibility records with graph/version, adapter versions, role map, redaction-tiered step data, human edits, timestamps, app version; persist minimum session checkpoint even when full replay is off. | No — read-only attachment to workflow/bridge events. |
| N2 | Human relay checkpoints | Add checkpoint node/policy: control-pane draft, user confirms/edits/skips before target send; `FILL_DRAFT` fills provider draft without send activation for Edit-in-provider. | No — confirm uses existing send path; `FILL_DRAFT` is additive §4/engine behavior, not §7. |
| N3 | Workflow pack export/import | `.macflow.json` graph + role defaults + prompt templates + metadata, including required providers, adapter minimums, and partial-run policy; makes workflows safe to forward and PR back. | No. |
| N4 | Preset catalog UX + process trace | Cards with plain-language scenario/provider/time/RAM/login labels, auto-complete panel, degraded badges, thinking pulse rows, and read-only step trace; soft entry for non-technical users without hiding the process. | No. |
| N5 | RAM-aware webview lifecycle | Session-ready chip → side rail → center stage; lazy recreate/hibernate preserves profile dirs for typical office-PC RAM limits and surfaces chip activity. | No — hibernate is close/reopen and replays §8.1 boot. |
| N6 | Adapter completeness: Claude Code + hardening | N6a adds `claude-code` as `claude.ai/code` web-DOM provider with seed adapter/profile dir; DOM ops stay adapter-driven; promoted provider seeds pass all five-mode golden tests or declare mercy tier. N6b, later, may add lightweight terminal-agent PTY/CLI adapter class. | N6a: no — same web bridge. N6b: separate adapter transport class; must not alter §7. |
| N7 | Local context injection v2 | PDF/DOCX/text extraction, chunking, optional fan-out to all sendable providers or workflow steps; desktop-local data advantage. | No — fan-out uses existing SEND path. |
| N8 | Contributor graph view → constrained editor | 8a read-only graph/process view; 8b constrained editor for reorder/swap/templates only. Editable canvas requires a new dep such as `@xyflow/react`; refs do not provide it. | No. |
| N9 | Dynamic preset promotion | Local privacy-preserving counters and metadata surface community temperature without telemetry by default; promotion weighs maintenance quality and completion rate, not raw downloads. Thresholds remain governed by §18.2–§18.4. | No. |

Reuse/license map for roadmap work:
- `better-agent-terminal` is MIT; reusable/adaptable code requires preserving notice.
- `tempo-term` has no LICENSE in the local checkout; use as pattern-reference only and reimplement.
- Neither ref provides an editable workflow graph editor; add a purpose-built dependency only when N8b starts.

## 18. Open questions / OSS governance

These are real unresolved risks, not launch blockers disguised as solved policy:

1. **Confirmation theater** — relay checkpoints may still ask users to approve content they cannot evaluate. Mitigation candidates: side-by-side provider peek, snapshot diff, and "edit in provider" before continue.
2. **及格線 mercy tier** — lightweight/local models may need a two-tier pass/fail standard so useful but weaker providers are not excluded from every pack. New provider seed + adapter PRs that fail one of the five-mode golden gates may merge only with an explicit mercy-tier label and user-visible degraded/preset eligibility limits.
3. **溫度回饋 vanity-metric risk** — "87 families used this" can motivate contributors or become empty gamification. Keep counters local/private by default and tie N9 promotion to maintenance quality and completion rate, not raw downloads.
4. **Workflow-author abandonment / promotion thresholds TBD** — packs need fork, auto-stale-mark, and merge-authority rules before community catalogs become authoritative. N9 promotion thresholds must resolve:
   - minimum recent successful completions / `successRate`
   - maximum stale-maintenance age
   - adapter health and `minAdapterVersion` pass rate
   - mercy-tier eligibility limits from §18.2
   - fork/ownership handoff after abandonment
5. **Adapter-outage playbook** — graceful degradation needs a community SLA: fallback presets, auto-stale badges, partial-sendable recommendations, and maintainer escalation rules tied to the §18.2 mercy tier.
6. **Capability Tags deferred** — do not launch a premature taxonomy; keep explicit pack metadata until repeated workflows prove stable tags.
7. **Microcopy** — wording and onboarding require continuous improvement, but they are not a launch gate for the v2 architecture.
