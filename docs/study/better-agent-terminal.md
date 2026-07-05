# Better Agent Terminal Reusable-Asset Study

Study of `refs/better-agent-terminal` for building a Tauri 2 portable desktop app: a central control pane surrounded by embedded webviews of AI chat websites (ChatGPT, Claude, Gemini, Grok…), with unified input broadcast and response collection.

---

## 1. Overview

**What it is.** Better Agent Terminal (BAT) is a mature Tauri 2 desktop app that aggregates multiple project workspaces, each with xterm.js terminals and built-in AI agent panels (Claude Code, Codex, channel/CLI variants). It is *not* a multi-webview chat embedder — external AI websites are not loaded as child webviews. Instead, agents run via SDK/CLI inside native panels (`README.md:12-16`, `README.md:91-99`).

**Tauri version.** Tauri 2 throughout: `tauri = { version = "2" }` in `src-tauri/Cargo.toml:41`, `@tauri-apps/api` / `@tauri-apps/cli` at `^2.11.x` in `package.json:118-119`, and `$schema: https://schema.tauri.app/config/2` in `src-tauri/tauri.conf.json:2`.

**Frontend stack.** React 18, TypeScript 5.3, Vite 8, plain CSS (no Tailwind), i18next (EN / zh-TW / zh-CN), xterm.js 5.5 (`package.json:91-148`, `README.md:388-396`). State is hand-rolled store modules (`renderer/src/stores/`), not Zustand.

**Package manager.** pnpm 10.33.2, pinned in `package.json:6`. Single-repo layout (not a pnpm workspace monorepo). Sidecar has its own `node-sidecar/pnpm-lock.yaml`.

**Repo layout map.**

| Path | Role |
|------|------|
| `renderer/src/` | React UI: `App.tsx`, components, stores, `host-api.ts`, styles, locales |
| `src-tauri/` | Rust host: commands, PTY (`portable-pty`), window registry, sidecar bridge, remote server |
| `src-tauri/capabilities/` | Tauri 2 permission capabilities |
| `node-sidecar/` | Bundled Node JSON-RPC server for Anthropic SDK + remote-bridge handlers |
| `scripts/` | Build/bundle helpers (`tauri-build-mode.mjs`, `fetch-node-runtime.mjs`, release manifest) |
| `plans/` | Agent-driven migration/completion design docs (very detailed progress logs) |
| `tests/` | Extensive TS/Node/Rust integration tests |
| `choco/` | Chocolatey package (Windows) |
| `.github/workflows/` | Tag-dispatch + multi-platform release CI |
| `PLAN.md` | Original Electron-era implementation plan (historical) |
| `AGENTS.md` / `CLAUDE.md` | Agent/human governance for development |

---

## 2. Tauri Architecture

### Window / webview management

BAT uses **multiple top-level `WebviewWindow`s**, not embedded child webviews. There is no `add_child` / `WebviewBuilder` usage anywhere in the repo.

| Concern | Location | Notes |
|--------|----------|-------|
| Static main window | `tauri.conf.json:14-22` | One `main` window: 1280×800, min 800×600, `dragDropEnabled: true` |
| Main window lifecycle | `lib.rs:171-173` | `attach_window_lifecycle` on `main` at setup |
| Dynamic profile windows | `app.rs:222-268` | `WebviewWindowBuilder::new(app, window_id, url)` creates `profile-{safeId}-{ts}-{n}` windows; restores bounds from registry |
| Cmd+N new window | `app.rs:459-467`, `app_menu.rs:27-65` | `app_new_window` creates empty window for active profile |
| Detached workspace windows | `workspace.rs:431-454` | `WebviewWindowBuilder` with `index.html?detached={workspaceId}`, label `detached-{safeId}-{ts}` |
| Window registry (persistence) | `window_registry.rs:37-76` | `WindowEntry` snapshots workspaces/terminals/bounds per window; persisted to `windows.json` + per-profile JSON |
| Live window tracking | `window_registry.rs:725-763` | Uses `app.webview_windows()` to count live profile windows |
| Capabilities window patterns | `capabilities/default.json:5` | `["main", "profile-*", "detached-*"]` |

**Implication for Multi-AI-Chat:** BAT's multi-window pattern helps if we want *separate OS windows per chat site*, but it does **not** demonstrate embedding multiple external webviews inside one control-pane layout. For that, see `docs/study/tempo-term.md` (native child webview pattern).

### `tauri.conf.json` highlights

- **Identifier:** `org.tonyq.better-agent-terminal` (`tauri.conf.json:6`)
- **Build:** `beforeDevCommand: pnpm exec vite`, `frontendDist: ../dist-tauri`, dev URL `http://127.0.0.1:5173` (`tauri.conf.json:7-11`)
- **Security:** `csp: null` (`tauri.conf.json:24-26`) — permissive; external chat sites would need tighter CSP design
- **Bundle resources (base):** sidecar `server.mjs` + `package.json` (`tauri.conf.json:37-40`)
- **Bundle resources (all-in-one):** merged via `tauri.all-in-one.conf.json:4-10` — adds `node_modules/`, `codex-runtime/`, bundled `node-runtime/`
- **Windows NSIS:** `installMode: perMachine`, custom template + hooks (`tauri.conf.json:41-47`)
- **Updater:** `createUpdaterArtifacts: true`, minisign pubkey, endpoint `latest-stable-all-in-one.json` (`tauri.conf.json:30-56`)

### Capabilities / permissions

`src-tauri/capabilities/default.json` grants:

- `core:default`
- `opener:default`, `opener:allow-open-url`, `opener:allow-open-path`
- `dialog:default`, `dialog:allow-message`, `dialog:allow-open`
- `clipboard-manager:default`, `clipboard-manager:allow-write-text`
- `updater:default`

**Notable absence:** No `core:webview-*` permissions — consistent with no child-webview embedding. Multi-AI-Chat will need additional webview-management capabilities if embedding chat sites natively.

### Rust plugins registered

`lib.rs:136-142`: `opener`, `dialog`, `clipboard-manager`, `updater`.

### Managed state (desktop)

`lib.rs:143-155`: `PtyState`, notification states, `FsWatcherState`, `SnippetState`, `WorkerBufferState`, `WorktreeState`, `RuntimeEventHubState`, remote client/server states, `CodexAppServerState`, `WindowRegistryState`, `SidecarState`.

### `#[tauri::command]` surface (grouped)

Commands are registered in `lib.rs:192-414`. ~150+ commands total.

**Settings:** `settings_load`, `settings_save`, `settings_get_shell_path`, `settings_clear_terminal_history`, `settings_detect_cx` — JSON settings in app data dir (`lib.rs:193-197`, `settings.rs:71-381`)

**Runtime install:** `runtime_get_status`, `runtime_install`, `runtime_open_runtime_folder`, `runtime_clear_managed` (`lib.rs:200-203`)

**Shell / dialog:** `shell_open_external`, `shell_open_path`; `dialog_confirm`, `dialog_select_folder`, `dialog_select_files`, `dialog_select_images` (`lib.rs:204-209`)

**Filesystem:** `fs_read_file`, `fs_home`, `fs_readdir`, `fs_is_directory`, `fs_list_dirs`, `fs_mkdir`, `fs_delete_path`, `fs_quick_locations`, `fs_resolve_path_links`, `fs_search`, `fs_watch`, `fs_unwatch`, `remote_upload_file_to_host`, `fs_upload_to_dir`, `fs_download_file` (`lib.rs:210-224`)

**Clipboard / image:** `clipboard_save_image`, `clipboard_write_text`, `clipboard_write_image`; `image_read_as_data_url`, `image_save_data_url` (`lib.rs:225-229`)

**PTY:** `pty_create`, `pty_write`, `pty_read_buffer`, `pty_resize`, `pty_get_viewport_state`, `pty_set_viewport_mode`, `pty_set_viewport_size`, `pty_kill`, `pty_restart`, `pty_get_cwd` (`lib.rs:230-239`, `pty.rs:1019-1519`)

**Workspace / windows:** `workspace_load`, `workspace_save`, `workspace_detach`, `workspace_reattach`, `workspace_move_to_window` (`lib.rs:240-244`, `workspace.rs:173-494`)

**App / multi-window:** `app_get_window_id`, `app_get_window_index`, `app_get_launch_profile`, `app_get_window_profile`, `app_set_title`, `app_resolve_profile_window_close`, `app_new_window`, `app_take_fresh_window_flag`, `app_focus_next_window`, `app_open_new_instance`, `app_restore_active_profiles`, `app_set_dock_badge` (`lib.rs:260-271`, `app.rs:406-630`)

**Update:** `update_get_version`, `update_check`, `update_get_bundle_mode`, `update_check_native`, `update_install` (`lib.rs:245-249`, `update.rs:32-153`)

**Debug:** `debug_is_debug_mode`, `debug_log`, `debug_open_logs_folder` (`lib.rs:250-252`)

**Git / GitHub:** 7 git + 7 github commands wrapping CLI (`lib.rs:253-285`)

**Notifications:** 7 notification list/focus/mark commands (`lib.rs:272-278`)

**Snippets:** 10 CRUD/search commands, SQLite-backed (`lib.rs:286-295`)

**Profiles:** `profile_list`, `profile_list_local`, `profile_get`, `profile_get_active_ids`, `profile_create`, `profile_save`, `profile_load`, `profile_delete`, `profile_rename`, `profile_update`, `profile_duplicate`, `profile_activate`, `profile_deactivate` (`lib.rs:296-308`)

**Claude / Codex agent (large):** 60+ commands — session lifecycle (`claude_start_session`, `claude_send_message`, `claude_stop_session`, …), auth/accounts, models/effort/permissions, archive/resume/fork, MCP, worktree, Codex unified accounts (`lib.rs:309-378`, `claude.rs:3061-5047`)

**Claude channel / CLI variants:** `claude_channel_*` (5), `claude_cli_*` (4) (`lib.rs:379-387`)

**Worktree:** `worktree_create`, `worktree_remove`, `worktree_status`, `worktree_merge`, `worktree_rehydrate` (`lib.rs:388-392`)

**Agent presets:** `agent_get_supported_session_types`, `agent_list_presets` (`lib.rs:393-394`)

**Usage polling:** `agent_usage_snapshot`, `agent_usage_peek` (`lib.rs:395-396`, `claude_usage.rs:233-254`)

**Worker / Procfile:** `worker_buffer_*`, `worker_procfile_*` (`lib.rs:397-403`)

**Remote / tunnel:** `remote_start_server`, `remote_stop_server`, `remote_server_status`, `remote_rotate_token`, `remote_connect`, `remote_disconnect`, `remote_client_status`, `remote_test_connection`, `remote_list_profiles`, `tunnel_get_connection` (`lib.rs:404-413`)

**Codex Fugu:** `codex_fugu_status`, `codex_fugu_set_key` (`lib.rs:198-199`)

### Headless alternate binary

`Cargo.toml:28-30` defines `bat-server` binary built with `--no-default-features --features headless` — GUI-free remote server without WebKit (`plans/headless-server-decouple.md:1-28`).

---

## 3. Node Sidecar

### Why it exists

The Rust host intentionally stays thin for some workloads; heavy JavaScript SDK integration (Anthropic Claude Agent SDK, remote-bridge handlers, Codex runtime pieces) runs in a bundled Node process (`Cargo.toml:80-83`, `lib.rs:1-6`, `node-sidecar/package.json:5-6`).

### How it is spawned and bundled

1. **Build pipeline:** `pnpm run prepare:tauri-bundle:all-in-one` fetches Node runtime, installs sidecar deps, prunes platform-specific native modules, esbuild-bundles `server.mjs`, prepares codex runtime (`package.json:67-71`)
2. **Bundle inclusion:** Base `tauri.conf.json:37-40` ships `node-sidecar/dist/server.mjs`; all-in-one adds full `node_modules`, codex runtime, and `node-runtime/` (`tauri.all-in-one.conf.json:4-10`)
3. **Lazy spawn:** `sidecar.rs:296-349` — first JSON-RPC call triggers `ensure_spawned`; child exit triggers respawn with backoff (`sidecar.rs:43-45`)
4. **Launch:** `spawn_sidecar` runs bundled `node` + `server.mjs` with piped stdin/stdout/stderr (`sidecar.rs:527-561`). Windows uses eval-bootstrap to avoid argv path mangling (`sidecar.rs:180-200`)

### IPC between sidecar and Rust/frontend

- **Transport:** Line-delimited JSON-RPC over stdin/stdout (`sidecar.rs:1-6`)
- **Request/reply:** Correlated by `id`; blocking `mpsc` with timeout on calling thread (`sidecar.rs:90-111`)
- **Events:** Server pushes `{method: "event:foo"}` without `id`; fan out via `EventSink` to Tauri `emit` or remote broadcast (`sidecar.rs:6-7`, `lib.rs:435-441`)
- **Frontend access:** Renderer never talks to sidecar directly — goes through `host-api.ts` → Tauri `invoke` → Rust command → `sidecar::call` bridge
- **Logging:** Sidecar stderr mirrored to `<app-data>/logs/sidecar.log` (`AGENTS.md:27`, `sidecar.rs:545-548`)

### Usefulness for Multi-AI-Chat

**High value if we need to run Node-based agent CLIs or browser automation** that is awkward in Rust. The JSON-RPC sidecar pattern gives:

- Isolated crash domain (sidecar death ≠ app death)
- Reuse of npm AI SDKs
- Uniform bridge for both desktop and headless `bat-server`

**Lower value if our core model is embedding vendor chat webviews** — we would not need Claude Agent SDK in a sidecar; we might instead use Rust for webview orchestration + optional sidecar only for response scraping / automation scripts.

**Effort to adapt:** Large — sidecar is ~entire agent stack, not a minimal shell. Copy the *bridge architecture* (`sidecar.rs` + spawn/bundle scripts), not the handler surface.

---

## 4. Build & Distribution

### Portable vs installer artifacts

| Platform | Primary artifacts | Portable? |
|----------|-------------------|-----------|
| Windows | NSIS `.exe` installer + `.zip` | Zip is extract-and-run; installer is per-machine NSIS (`README.md:273`, `tauri.conf.json:42-46`) |
| macOS | `.dmg` (all-in-one + lightweight variants) | Drag-to-Applications; not a single-file portable (`README.md:274`) |
| Linux | `.AppImage` x86_64 + arm64 (+ lightweight suffix) | AppImage is self-contained portable (`README.md:275-277`) |
| Linux server | `bat-server` tar.gz + AppImage (post-release job) | Headless bundle, no WebKit (`release.yml:816-911`) |

### Bundle modes: all-in-one vs lightweight

- **`all-in-one`:** Bundles Node runtime, sidecar `node_modules`, codex runtime — larger, offline-capable (`tauri.all-in-one.conf.json:4-10`, `scripts/tauri-build-mode.mjs:12-24`)
- **`lightweight`:** Sidecar script only; runtimes installed on first use via in-app managed-runtime UI (`package.json:68-71`, `release.yml:443-445`)
- Mode baked into binary at build time via `BAT_BUNDLE_MODE` env (`release.yml:484-485`) so updater never cross-upgrades modes

### GitHub Actions workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `release-tag-dispatch.yml` | Push tag `v*` | Dispatches `release.yml` on `main` with tag + `run_verification=false` (`release-tag-dispatch.yml:4-25`) |
| `release.yml` | Manual `workflow_dispatch` | Full release pipeline (`release.yml:4-15`) |

**`release.yml` jobs:**

1. **`verify`** (optional) — frozen pnpm install, version injection, `verify:tauri-release-ci` (`release.yml:23-74`)
2. **`build`** (matrix) — Windows/macOS/Linux × all-in-one/lightweight; Rust + Node caches; macOS signing + notarization; Linux AppImage tooling; uploads `.exe`/`.dmg`/`.AppImage` + updater metadata artifacts (`release.yml:76-613`)
3. **`release`** — Creates GitHub Release with installers only; generates + publishes update manifests to pinned `manifests` release (`release.yml:615-713`)
4. **`choco`** — Windows Chocolatey pack/push (gated until 2026-05-01, stable tags only) (`release.yml:733-814`)
5. **`bat-server-bundle`** — Post-release headless Linux server bundle upload (`release.yml:816-911`)

### Code signing

- **macOS app:** `APPLE_CERTIFICATE`, `APPLE_SIGNING_IDENTITY`, notarization via `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` (`release.yml:414-437`, `464-470`)
- **macOS bundled binaries:** `scripts/sign-macos-resource-binaries.sh` before Tauri build (`release.yml:464-470`)
- **Updater artifacts:** minisign via `TAURI_SIGNING_PRIVATE_KEY` + password; pubkey in `tauri.conf.json:51-55` (`release.yml:485-487`)

### Auto-update mechanism

- **Plugin:** `tauri-plugin-updater` (Rust + config) (`lib.rs:142`, `tauri.conf.json:50-56`)
- **Manifests:** `scripts/generate-update-manifest.mjs` publishes `latest-{channel}-{mode}.json` to fixed `manifests` GitHub release (`release.yml:664-713`, `plans/auto-update-plan.md:37-45`)
- **Channels:** stable vs pre (pre only when `BAT_DEBUG` / debug mode on) (`renderer/src/lib/auto-update.ts:8-9`, `46-50`)
- **UX:** Background download + install; apply on next restart; `UpdateBanner` in `App.tsx:8` (`auto-update.ts:1-6`)
- **Homebrew:** Separate tap update via repository-dispatch (out of band from Tauri updater) (`release.yml:715-731`)

### Versioning model

Committed version stays `0.0.1-dev`; CI injects real version from git tag at build time (`CLAUDE.md:73-74`, `package.json:3-5`).

---

## 5. UI Patterns Worth Stealing

### Layout system

- **App shell:** Resizable sidebar + main workspace area + optional right panels (snippets, skills, markdown preview) via `ResizeHandle` (`App.tsx:18-42`, `App.tsx:99-100`)
- **Workspace view:** Sidebar lists workspaces; active workspace renders `WorkspaceView` (`App.tsx:7-11`)
- **Split terminal layout:** ~70% `MainPanel` + ~30% `ThumbnailBar` scrollable terminal thumbnails (`README.md:78`, `WorkspaceView.tsx:8-9`)
- **CSS variables theming:** `layout.css` uses `--bg-tertiary`, `--accent-color`, `--text-primary` etc. (`layout.css:10-14`)
- **Panel width persistence:** `localStorage` keys like `better-terminal-panel-settings` (`App.tsx:36-42`)

### Pane / tab management

- **Workspace tabs:** terminal / files / git / github per workspace, persisted in `localStorage` (`WorkspaceView.tsx:24-74`)
- **Terminal instances:** Multiple per workspace; agent presets (Claude Code, Codex, plain terminal, worktree variants) (`WorkspaceView.tsx:14-15`, `MainPanel.tsx:30-37`)
- **Lazy loading:** Heavy panels (`MainPanel`, `FileTree`, `GitPanel`, agent panels) use `React.lazy` (`WorkspaceView.tsx:18-22`, `MainPanel.tsx:11-17`)
- **Detachable workspaces:** Pop out to separate OS window (`workspace_detach` + `?detached=` query) (`workspace.rs:411-414`, `README.md:72`)

### Settings UI

- **Centralized store:** `settings-store.ts` loads/saves via `host` invoke, merges defaults, normalizes models (`settings-store.ts:24-52`)
- **Rich settings surface:** theme, color presets, fonts, shell, language, agent defaults, remote server, auto-update channel (`settings-store.ts:24-52`)
- **Platform-aware defaults:** e.g. Windows → Cascadia Code (`settings-store.ts:29`)
- **Open logs folder:** `debug_open_logs_folder` command (`CLAUDE.md:38`)

### Theming

- Built-in dark theme + color presets (`novel` default) with custom BG/FG/cursor overrides (`settings-store.ts:31-35`)
- No Tailwind — component-scoped CSS files under `renderer/src/styles/` (`settings.css`, `panels.css`, `layout.css`, etc.)
- i18n via `react-i18next` + JSON locale files (`renderer/src/locales/`)

### host-api adapter (critical pattern)

`renderer/src/host-api.ts` exposes a stable `host` proxy; renderer never calls `invoke` directly. Unported APIs throw loudly (`host-api.ts:1-11`, `60-62`). This enabled Electron→Tauri migration without rewriting UI (`lib.rs:1-6`).

**For Multi-AI-Chat:** Steal this indirection layer early so webview control, broadcast input, and response collection APIs stay stable.

---

## 6. Plans / Docs — Agent-Driven Development Governance

### `PLAN.md`

Original Electron-era product plan (Traditional Chinese): workspace/terminal data model, IPC event design, step-by-step implementation (`PLAN.md:1-88`). **Historical** — stack has migrated to Tauri 2; useful for domain concepts (workspace/terminal persistence) not for current architecture.

### `plans/` directory

| Plan | Focus |
|------|-------|
| `tauri-migration-plan.md` | Massive living log of Electron→Tauri port batches (#58–#66+): sidecar namespace ports, host-api gaps, test contracts |
| `tauri-completion-plan.md` | Remaining adapter parity: remote profile routing, drag-drop, direct-call elimination |
| `auto-update-plan.md` | Two-axis updater design (channel × bundle mode), minisign vs Apple signing |
| `headless-server-decouple.md` | `bat-server` without WebKit for enterprise Linux |
| `runtime-setup-install-plan.md` | Managed runtime auto-install for lightweight builds |
| `claude-channel-agent-plan.md` / `claude-cli-transcript-agent-plan.md` | Alternate agent transports |
| `websocket.md` | Remote WebSocket protocol notes |
| Others | Workspace archive, mobile viewport, etc. |

**Organization pattern:** Each plan has **status**, **motivation**, **incremental progress log with issue numbers**, explicit **trade-offs**, and **remaining work** bullets. The migration plan in particular reads like an agent session journal — extremely useful for resuming multi-month ports.

### `AGENTS.md` / `CLAUDE.md`

Shared governance (agents load `AGENTS.md` first, full rules in `CLAUDE.md`):

- **pnpm only**, frozen lockfile, `pnpm exec` not `npx` (`AGENTS.md:7-12`)
- **Verification gates:** `tsc`, `compile`, `test:sidecar`, `check:tauri-rust`; `tauri:build:debug` for local packaging (`AGENTS.md:16-21`)
- **No regressions policy** — trace consumers of shared code (`CLAUDE.md:3-8`)
- **Logging contract:** renderer uses `host.debug.log`, not `console.log` (`CLAUDE.md:26-38`)
- **IPC compatibility:** additive-only changes to `host.*` and event names (`AGENTS.md:30-37`)
- **Release via tags only** — no version commits (`CLAUDE.md:71-81`)
- **Git workflow:** no auto-branching (`CLAUDE.md:66-69`)

**Copy for our repo:** Dual `AGENTS.md` + `CLAUDE.md`, pinned pnpm, explicit verify scripts, tag-based release, and "host API is a compatibility contract" rule.

---

## 7. License

**License:** MIT (`LICENSE:1-21`)

**Copyright:** TonyQ (2024)

**Can we copy code into an open-source project?** Yes, with conditions:

- Include the copyright notice and MIT license text in copies or substantial portions
- No warranty; standard MIT permissions for use, modification, distribution, and sublicense

There are no copyleft or additional attribution requirements beyond preserving the license header.

---

## 8. Reuse Shortlist — Top 10

| # | Asset | Path | Effort | Adaptation needed |
|---|-------|------|--------|-------------------|
| 1 | **host-api adapter pattern** | `renderer/src/host-api.ts` | M | Replace namespaces with `webview`, `broadcast`, `collect`; keep proxy + loud not-implemented stubs |
| 2 | **Dynamic window + registry persistence** | `src-tauri/src/window_registry.rs`, `src-tauri/src/commands/app.rs` | M | Repurpose snapshots for webview layout/state instead of terminals; add child-webview APIs (not in BAT) |
| 3 | **Sidecar JSON-RPC bridge** | `src-tauri/src/sidecar.rs`, `node-sidecar/src/server.mjs` | L | Only if we run Node CLIs/automation; trim handlers to our needs; keep spawn/backoff/logging |
| 4 | **Tauri capabilities baseline** | `src-tauri/capabilities/default.json` | S | Extend with webview create/position/size/zoom permissions for embedded chat panes |
| 5 | **Release CI + updater manifests** | `.github/workflows/release.yml`, `scripts/generate-update-manifest.mjs`, `scripts/stage-updater-artifacts.mjs` | M | Simplify matrix (likely Windows portable-first); generate our manifest URLs |
| 6 | **Bundle mode tooling** | `scripts/tauri-build-mode.mjs`, `tauri.all-in-one.conf.json`, `scripts/fetch-node-runtime.mjs` | M | Optional dual lightweight/all-in-one if we bundle runtimes; else drop codex-specific resources |
| 7 | **Resizable panel layout + stores** | `renderer/src/App.tsx`, `renderer/src/styles/layout.css`, `renderer/src/components/ResizeHandle.tsx` | M | Swap terminal thumbnails for webview pane tabs; keep sidebar + control-pane split |
| 8 | **Settings persistence pattern** | `renderer/src/stores/settings-store.ts`, `src-tauri/src/commands/settings.rs` | S | JSON settings file via invoke; theme/language/update channel scaffolding |
| 9 | **Auto-update controller** | `renderer/src/lib/auto-update.ts`, `src-tauri/src/commands/update.rs` | M | Wire to our endpoints; keep "download background, restart to apply" UX |
| 10 | **Agent governance docs** | `AGENTS.md`, `CLAUDE.md`, `plans/*.md` structure | S | Copy pnpm/verify/tag-release/IPContract rules; add `plans/` for our migration batches |

### What BAT does *not* provide (look elsewhere)

- **Embedded external webviews in one window** — no child webview code; use TempoTerm `preview.rs` / `useNativePreviewWebview.ts` pattern
- **Unified input broadcast across webviews** — not implemented
- **Response extraction from chat websites** — BAT uses SDK/terminal agents, not DOM scraping

---

## Summary Matrix: BAT vs Multi-AI-Chat Needs

| Need | BAT coverage |
|------|----------------|
| Tauri 2 portable desktop shell | Strong |
| Multi-window management | Strong |
| Child webview embedding | None |
| Node sidecar for CLIs/SDK | Strong |
| Release/updater CI | Strong |
| Control-pane + multi-chat layout | Partial (layout only) |
| Governance/docs for agents | Strong |