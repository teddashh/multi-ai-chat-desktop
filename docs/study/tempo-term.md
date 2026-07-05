# TempoTerm Reusable-Asset Study

Study of `refs/tempo-term` for building a Tauri 2 multi-pane desktop app (center control pane + embedded AI chat webviews).

---

## 1. Overview

**What it is.** TempoTerm is a mature Tauri 2 desktop workspace that combines a native PTY terminal, code editor, file explorer, Git panel, notes, SSH/SFTP, web preview, and a bring-your-own-key AI assistant in one window. Work is organized into named **spaces** (groups) with **tabs**, and each tab owns a recursive **split pane tree** mixing terminal, editor, preview, and other pane types (`README.md:13`, `tabsStore.ts:26-31`).

**Tauri version.** Tauri 2 throughout: `tauri = { version = "2", features = ["protocol-asset", "unstable"] }` in `src-tauri/Cargo.toml:21`, `@tauri-apps/api` and `@tauri-apps/cli` at `^2` in `package.json:32,77`, and `$schema: https://schema.tauri.app/config/2` in `src-tauri/tauri.conf.json:2`.

**Frontend stack.** React 19, TypeScript 5.8, Vite 7, Tailwind CSS v4, Zustand 5, i18next, Vitest (`package.json:64-89`, `README.md:130`). Heavy pane content (CodeMirror, TipTap, git graph) is lazy-loaded (`PaneTabContent.tsx:15-35`).

**pnpm workspace layout.** Minimal single-package workspace: `pnpm-workspace.yaml:1-2` lists only `"."`. No nested packages; frontend at repo root, Rust backend in `src-tauri/`. Package manager pinned to `pnpm@11.7.0` (`package.json:91`). Dev server fixed at port 1420 (`vite.config.ts:25-27`, `tauri.conf.json:8`).

---

## 2. Tauri Architecture

### Window management

| Concern | Location | Notes |
|--------|----------|-------|
| Main window config | `tauri.conf.json:13-24` | Single `main` window: 1200×800, min 720×480, overlay title bar (macOS), `dragDropEnabled: true` |
| Main window setup | `lib.rs:103-123` | Clamps corrupt restored size; Windows gets `set_decorations(false)` for custom React title bar |
| Multi-window | `menu.rs:136-168` | `WebviewWindowBuilder` creates `win-{n}` labels; mirrors main window sizing |
| Window state persistence | `lib.rs:85-92` | `tauri-plugin-window-state` restores SIZE, POSITION, MAXIMIZED |
| Per-window frontend state | `window.ts:45-65` | Main uses `localStorage`; secondary windows use in-memory `StateStorage` |
| Window-scoped events | `menu.rs:108-130`, `App.tsx:105-116` | Menu actions `emit_to` focused window label so ⌘W/⌘`/⌘L don't broadcast |
| Native child webviews | `preview.rs:57-124`, `useNativePreviewWebview.ts:94-116` | Rust creates via `window.add_child(WebviewBuilder)`; JS positions/shows/hides |

Secondary windows share the same React app and capabilities pattern `["main", "win-*"]` (`capabilities/default.json:5`).

### `tauri.conf.json` highlights

- **Identifier:** `com.tempoterm.desktop` (`tauri.conf.json:5`)
- **Build:** `beforeDevCommand: pnpm dev`, `frontendDist: ../dist` (`tauri.conf.json:6-10`)
- **Security:** `csp: null`; `assetProtocol` enabled with deny-list for secrets (`.ssh`, `.env`, `*.pem`, etc.) (`tauri.conf.json:26-44`)
- **Updater:** active, pubkey + GitHub `latest.json` endpoint (`tauri.conf.json:47-55`)
- **Bundle:** `targets: "all"`, `createUpdaterArtifacts: true`, macOS signing identity + entitlements (`tauri.conf.json:57-72`)

### Capabilities / permissions

`src-tauri/capabilities/default.json` grants:

- `core:default`, window drag/minimize/maximize/close/destroy
- **Webview management:** `create-webview`, `set-webview-position`, `set-webview-size`, `webview-show/hide/close`, `set-webview-zoom`
- Plugins: `opener`, `dialog`, `notification`, `updater`, `process`

This capability set is **essential** for the native child-webview pane pattern used in web preview (and directly transferable to AI chat embedding).

### Rust plugins registered

`lib.rs:76-93`: `opener`, `dialog`, `notification`, `updater`, `process`, `window-state`.

### `#[tauri::command]` surface (grouped)

**App:** `app_build_info` (`lib.rs:66`)

**PTY:** `pty_open`, `pty_write`, `pty_resize`, `pty_shell_name`, `pty_foreground_command`, `pty_cwd`, `pty_close`, `pty_close_all` (`pty/mod.rs`)

**Clipboard:** `terminal_clipboard_paths`, `terminal_clipboard_image_paths`, `terminal_clipboard_text`, `terminal_prepare_clipboard_image_attachment`, `terminal_save_dropped_image` (`clipboard.rs`)

**Fonts:** `fonts_report` (`fonts/mod.rs`)

**Filesystem:** `fs_home_dir`, `fs_read_dir`, `fs_read_file`, `fs_write_file`, `fs_list_files`, `fs_grep`, `fs_create_file`, `fs_create_dir`, `fs_delete`, `fs_rename`, `fs_reveal` (`fs/mod.rs`)

**Git:** 30 commands including `git_status`, `git_commit`, `git_push`, `git_graph_log`, `git_worktree_list`, etc. (`git/mod.rs:454-1153`)

**Secrets:** `secrets_set_key`, `secrets_delete_key`, `secrets_has_key`, `ssh_secret_set`, `ssh_secret_delete` (`secrets/mod.rs`)

**PR:** `gh_available`, `pr_via_gh`, `pr_via_api` (`pr/mod.rs`)

**Preview (native webview):** `preview_create`, `preview_navigate`, `preview_reload`, `preview_history_back`, `preview_history_forward`, `preview_close` (`preview.rs`)

**AI:** `ai_chat` (`ai/mod.rs`)

**Terminal history:** `terminal_history_save`, `terminal_history_load`, `terminal_history_delete`, `terminal_history_clear`, `terminal_history_prune` (`terminal_history/mod.rs`)

**Session logs:** `session_logs_enforce_retention` (`session_log/mod.rs`)

**Claude/Codex progress:** `claude_progress_watch`, `claude_progress_unwatch`, `claude_session_title`, `codex_session_title` (`claude_progress/mod.rs`, `codex_progress/mod.rs`)

**Status hooks:** `claude_status_hook_install/uninstall`, `codex_status_hook_install/uninstall`

**Notes:** `notes_watch`, `notes_unwatch` (`notes/mod.rs`)

**SSH:** `ssh_open`, `ssh_write`, `ssh_resize`, `ssh_close`, `ssh_prompt_reply`, `ssh_forward_start`, `ssh_forward_stop` (`ssh/mod.rs`)

**SFTP:** `sftp_start`, `sftp_home`, `sftp_read_dir`, `sftp_read_file`, `sftp_write_file`, `sftp_close` (`sftp/mod.rs`)

**System:** `system_stats` (`sysmon/mod.rs`), `list_ports`, `kill_port_process` (`ports/mod.rs`)

**Editor watch:** `editor_watch_set` (`editor_watch/mod.rs`)

All registered in `lib.rs:141-245` via `generate_handler![...]`.

---

## 3. Multi-Pane Layout

This is the highest-value area for our multi-AI chat shell.

### Data model

Each **tab** stores:

- `paneTree: LayoutNode` — recursive binary split tree (`tabsStore.ts:55`, `terminalLayout.ts:39-46`)
- `activeLeafId` — focused pane (`tabsStore.ts:56`)
- `paneOrder: string[]` — stable add-order for grid restoration (`tabsStore.ts:57-59`)

`LayoutNode` is either a **leaf** (one pane with `PaneContent`) or a **split** with `direction: "row" | "col"` and `sizes: [number, number]` (`terminalLayout.ts:39-46`). Immutable tree ops: `splitLeaf`, `wrapTree`, `removeLeaf`, `setSizesById` (`terminalLayout.ts:72-214`).

`PaneContent` kinds today: `terminal`, `editor`, `note`, `preview`, `git-graph`, `diff`, `launcher` (`terminalLayout.ts:15-22`). For our app, add something like `{ kind: "ai-chat"; provider: "chatgpt" | ... }`.

**Pane cap:** 8 panes per tab (`tabsStore.ts:671`, `tabsStore.ts:881`).

### State management (Zustand)

`tabsStore.ts` is the orchestrator:

- Tab/space CRUD, active tab, reorder (`tabsStore.ts:67-125`)
- Split ops: `splitActivePane`, `splitPaneWith`, `wrapPaneWith`, `resizePane`, `closePane` (`tabsStore.ts:126-168`)
- Sidebar open helpers: `openFromSidebar`, `openInNewTab` (`tabsStore.ts:88-107`)
- Persisted via `zustand/persist` + `perWindowStorage()` (`tabsStore.ts:1097-1108`)

`uiStore.ts` tracks sidebar visibility, overlays, modals (`uiStore.ts:5-18`). `overlayCount` drives native webview hide/show (`uiStore.ts:13-17`, `overlayGuard.ts:4-14`).

### Rendering pipeline

```
App.tsx (sidebar + main)
  └─ TabsArea.tsx — lazy tab mount, hidden inactive tabs stay alive
       └─ PaneTabContent.tsx — one tab's pane tree
```

**TabsArea** (`TabsArea.tsx:6-62`): Only active tab mounts on first launch; once visited, tabs stay mounted (hidden) so terminals/sessions survive tab switches.

**PaneTabContent** (`PaneTabContent.tsx:64-113`):

1. `computeLayout(tab.paneTree)` → flat list of `{ id, rect%, content }` (`terminalLayout.ts:371-398`)
2. `computeSplitters(tab.paneTree)` → draggable divider descriptors (`terminalLayout.ts:431-461`)
3. Each pane rendered as `position: absolute` with percentage `left/top/width/height` (`PaneTabContent.tsx:390-400`)
4. Per-kind content: `TerminalView`, lazy `PreviewTabContent`, etc. (`PaneTabContent.tsx:428-491`)

### Resize logic

Two resizer implementations:

1. **Sidebar** — generic `Resizer.tsx` with pointer capture (`Resizer.tsx:12-51`), used in `App.tsx:439-442`
2. **Pane splits** — custom mousemove handler in `PaneTabContent.tsx:350-380`:
   - Tracks dragging splitter id for visual feedback
   - Converts pointer position to fraction within split span
   - Clamps to `MIN_FRACTION=0.1` / `MAX_FRACTION=0.9` (`PaneTabContent.tsx:56-57`)
   - Calls `resizePane(tabId, splitterId, [fraction, 1-fraction])`

Split IDs are derived from sorted leaf IDs (`terminalLayout.ts:191-193`) so persisted trees don't need explicit split IDs.

### Drag-to-split UX

Sophisticated drop-zone resolution in `resolveDropZone` (`terminalLayout.ts:294-361`):

- Single-pane tabs: left/right edge zones only
- Multi-pane: per-pane perpendicular edges + outer container band
- `wrapTree` for outer-edge drops (whole layout shifts as a block) (`terminalLayout.ts:108-121`)

Drag sources use dedicated stores (`dragEntry.ts`, `noteDrag.ts`, `sshDrag.ts`) because WKWebView swallows HTML5 drop events when `dragDropEnabled` is on (`PaneTabContent.tsx:495-498`).

### Native webview panes (preview — template for AI chats)

`PreviewTabContent` + `useNativePreviewWebview` is the **direct architectural template** for embedding external websites:

- Rust `preview_create` attaches child webview to window (`preview.rs:57-124`)
- JS hook tracks host `getBoundingClientRect()`, multiplies by `uiZoom`, calls `setPosition`/`setSize` (`useNativePreviewWebview.ts:109-113`)
- Visibility gated by `shouldShowPreview` (active tab, not dragging, no overlay) (`previewWebview.ts:33-38`)
- Race-safe lifecycle with `creatingWebviews` / `pendingCloses` maps (`useNativePreviewWebview.ts:50-60`)
- Menu accelerators for keys swallowed by focused native webview (`menu.rs:9-18`, `preview.rs:26-34`)

### Grid layout helper

`gridLayout` arranges up to 8 panes into ≤4 columns × 2 rows (`terminalLayout.ts:477-497`). Used when restoring multi-pane sessions from flat `paneOrder`.

### Suggested mapping to our app

| TempoTerm | Our multi-AI chat |
|-----------|-------------------|
| Center sidebar (explorer, AI view) | **Center control pane** (unified input, response aggregation) |
| `preview` pane (native webview) | **Side panes** embedding chatgpt.com, claude.ai, etc. |
| `tabsStore` + `terminalLayout` | Same split-tree model; add `ai-chat` pane kind |
| `useOverlayGuard` | Hide chat webviews when control-pane modals open |
| Menu accelerators | Route ⌘W/shortcuts past focused chat webviews |

---

## 4. Build & Distribution

### Bundling targets

- `bundle.targets: "all"` — NSIS `.exe`, MSI, macOS `.app`/`.dmg`, etc. (`tauri.conf.json:59`)
- macOS: Developer ID signing + `entitlements.plist` (`tauri.conf.json:69-72`)
- Windows: built on `windows-latest` runner (native deps: git2, font-kit, portable-pty) (`windows-build.yml:5-7`)

### GitHub Actions workflows

Only **one** workflow file exists:

| Workflow | Path | Triggers | Output |
|----------|------|----------|--------|
| **Build Windows** | `.github/workflows/windows-build.yml` | `workflow_dispatch`, push tag `v*` | NSIS exe + MSI + `.sig`; uploads to release on tag; artifacts always |

macOS releases use local `scripts/release.sh` (not CI): builds `aarch64-apple-darwin`, notarizes DMG, generates `latest.json` (`release.sh:1-80`).

### Updater setup

- Plugin: `tauri-plugin-updater` (`Cargo.toml:36`, `lib.rs:80`)
- Config: pubkey + `https://github.com/mukiwu/tempo-term/releases/latest/download/latest.json` (`tauri.conf.json:48-54`)
- `createUpdaterArtifacts: true` — signed `.tar.gz` + `.sig` on macOS (`tauri.conf.json:60`)
- Frontend: `updaterStore.ts` — launch check (5s delay), 6-hour periodic check, modal + toast (`App.tsx:261-277`, `updaterStore.ts:30-35`)
- Manifest builder: `scripts/buildManifest.mjs` embeds changelog into `notes` field (`buildManifest.mjs:4-24`)
- Windows CI restores `notes` after `tauri-action` overwrites `latest.json` (`windows-build.yml:78-94`)

### Portable build support

**No dedicated portable/zip distribution mode.** The repo uses standard Tauri installers (NSIS, MSI, DMG). The crate `portable-pty` (`Cargo.toml:25`) is the PTY library, not a portable-app packaging strategy. Windows artifacts are installer-based (`windows-build.yml:101-104`). A portable build would need a custom target or extracting NSIS contents — not implemented here.

---

## 5. UI Patterns Worth Stealing

### Theming

- `themes.ts` defines `AppTheme` with semantic `ThemeColors` + xterm palette (`themes.ts:4-26`)
- `applyTheme` sets CSS custom properties on `:root` (`themes.ts:444-452`)
- Tailwind reads `--color-*` variables; `data-theme` / `data-appearance` for light/dark (`themes.ts:450-452`)
- Settings UI with live syntax-colored preview swatch (`SettingsView.tsx:22-55`)

### Settings

- `settingsStore.ts` — persisted Zustand store (language, theme, zoom, terminal, AI, workspace prefs) (`settingsStore.ts:33-73`)
- `SettingsModal.tsx` — full-screen overlay modal with `useOverlayGuard` (`SettingsModal.tsx:8-15`)
- `SettingsView.tsx` — sectioned nav: appearance, terminal, AI, workspace, shortcuts, about (`SettingsView.tsx:14-15`)

### Command palette

Not a generic command palette — **FileFinder** serves as fuzzy-find palette:

- Global overlay, ⌘/Ctrl+P (`FileFinder.tsx:18-24`, `App.tsx:384-386`)
- Fuzzy rank via `fuzzy.ts`; opens files via `openFromSidebar` (`FileFinder.tsx:35-36`)
- Pattern reusable for "switch AI provider" or "open URL in pane"

### Keyboard shortcuts

**App-level** (`App.tsx:297-397`):

| Shortcut | Action |
|----------|--------|
| ⌥1–6 | Jump sidebar panel |
| ⌘1–9 | Switch tab |
| ⌘T / ⇧⌘T | Launcher tab / new terminal |
| ⌘P | File finder |
| ⌘B | Toggle sidebar |
| ⌘, | Settings |
| ⌘D / ⇧⌘D | Split right / split down |
| ⌘+/-/0 | UI zoom |
| ⌘[ / ⌘] | Preview back/forward |

**Menu-accelerated** (work when native webview has focus): ⌘W close tab, ⌘` cycle pane, ⌘L preview address bar (`menu.rs:49-70`, `App.tsx:403-425`).

**Documented in UI:** `ShortcutsSettingsSection.tsx` with platform-aware labels (`ShortcutsSettingsSection.tsx:19-47`).

**Editable-target guard:** shortcuts yield in inputs except terminal (`App.tsx:68-77`).

### Other patterns

- Custom Windows `TitleBar.tsx` + `data-tauri-drag-region` (`lib.rs:117-122`)
- `ConfirmDialog` / `InfoDialog` with overlay guard
- i18next with en + zh-Hant (`README.md:122-124`)
- `@dnd-kit` for tab reorder (`TabBar.tsx:17-31`)

---

## 6. License

| Source | Finding |
|--------|---------|
| Root `LICENSE` | **Absent** — no top-level license file in repo |
| `package.json` `license` field | **Absent** (`package.json:1-92`) |
| GitHub API `license` | **`null`** (no SPDX license on repository) |
| Subcomponent | `src/assets/icons/catppuccin/LICENSE` — **MIT** (Catppuccin icons only) |

**Legal assessment:** Without an explicit license from the copyright holder, TempoTerm source is **not open source** under default copyright (all rights reserved). You **cannot legally copy substantial code** into an open-source project without permission or a license grant from the author (mukiwu). You may:

- **Study patterns** and reimplement independently
- **Use MIT-licensed subcomponents** (Catppuccin icons) with attribution
- **Request a license** from the maintainer before copying files wholesale

Forking on GitHub does not grant redistribution rights without a license.

---

## 7. Reuse Shortlist

Top 10 concrete assets, ordered by relevance to our multi-AI chat shell.

| # | Asset | Path | Effort | Adaptation needed |
|---|-------|------|--------|-------------------|
| 1 | Native child webview lifecycle hook | `src/modules/preview/hooks/useNativePreviewWebview.ts` | **L** | Generalize beyond preview: per-provider URL, cookie/session isolation, label namespace; keep position/zoom/visibility logic |
| 2 | Rust preview webview commands | `src-tauri/src/modules/preview.rs` | **M** | Rename to `chat_webview_*`; relax URL validation for known AI domains; add optional user-agent / injection scripts for input broadcast |
| 3 | Split tree + layout math | `src/modules/terminal/lib/terminalLayout.ts` | **M** | Add `ai-chat` to `PaneContent`; possibly simplify drop zones; keep `computeLayout` / `computeSplitters` |
| 4 | Pane renderer + resize | `src/modules/terminal/PaneTabContent.tsx` | **L** | Replace terminal/editor branches with `ChatWebviewPane`; retain splitter drag + overlay drop UX |
| 5 | Tab/pane Zustand store | `src/stores/tabsStore.ts` | **L** | Strip terminal/git/editor open helpers; add `openAiChatPane(provider)`; adjust persist schema |
| 6 | Overlay guard for native layers | `src/lib/overlayGuard.ts`, `src/stores/uiStore.ts:13-17` | **S** | Copy as-is; critical whenever modals cover chat webviews |
| 7 | Menu accelerators + scoped events | `src-tauri/src/modules/menu.rs`, `App.tsx:105-116,403-425` | **M** | Rebind shortcuts for our control pane; keep pattern for focus-stealing webviews |
| 8 | Tauri capabilities for webviews | `src-tauri/capabilities/default.json:14-20` | **S** | Copy permission set into our `capabilities/default.json` |
| 9 | Resizer component | `src/components/Resizer.tsx` | **S** | Reuse for sidebar + any outer control-pane split; pane splits may keep inline handler |
| 10 | Theme system | `src/themes/themes.ts`, `applyTheme` | **M** | Trim terminal-specific palettes; keep CSS-variable pattern for unified chrome around webviews |

**Effort key:** S = hours, M = 1–2 days, L = 3+ days with tests.

**License caveat:** Items 1–10 require **clean-room reimplementation or explicit permission** — do not copy-paste until a license is obtained.

---

## Key Takeaways for Multi-AI Chat

1. **Native child webviews, not iframes**, bypass X-Frame-Options — required for embedding ChatGPT/Claude/Gemini (`README.md:94`, `useNativePreviewWebview.ts:97-100`).
2. **Split-pane shell is frontend-only** (immutable tree + absolute positioning) — no Rust changes needed for layout beyond webview create/position.
3. **Native webviews float above DOM** — must manually hide on overlay/tab switch (`previewWebview.ts:28-38`).
4. **Keyboard routing** must use Tauri menu accelerators when chat webview holds focus (`menu.rs:49-51`).
5. **Tauri 2 `unstable` feature** enabled for webview child APIs (`Cargo.toml:21`).
6. **No portable zip build** — plan separate packaging if "portable desktop app" is a hard requirement.