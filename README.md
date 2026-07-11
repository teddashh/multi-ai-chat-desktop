# Multi-AI Chat Desktop

**English** | [繁體中文](./README.zh-TW.md)

A Tauri 2 desktop control pane that orchestrates your **logged-in** ChatGPT, Claude, Gemini, and Grok web sessions — **no API keys, no telemetry**. Instead of just placing chats side by side, a central control pane drives them through multi-model **workflows** (debate, roundtable, consulting, coding, free-mode) and routes every provider's reply back to the hub.

Status: **current source (after v0.5.2)** — the control pane, five workflow modes, four web-session providers, reproducible runs (snapshots + replay), per-provider adapters with remote hot-update, and three-platform packaging (Windows / macOS / Linux) are built. The latest packaged release remains v0.5.2 until the next release is cut. Portable-first, MIT, with community-maintained selector adapters. See [`docs/SPEC.md`](./docs/SPEC.md) for the behavior contract and [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the design.

## Source changes after v0.5.2

- **Focused provider set.** The unfinished fifth web provider/orchestrator is removed; the web edition now stays focused on ChatGPT, Claude, Gemini, and Grok.
- **Desktop-agent launch.** Repo-scoped Codex and Claude Code Skills can check prerequisites and open the Tauri source app without an installer or separate agent CLI.
- **Conversation-first layout.** The composer now stays at the bottom of the control pane, workflow cards are compact, and the useful one-line process trace sits beside the provider view instead of consuming the conversation area.
- **Local conversation history.** A collapsible sidebar keeps up to 30 recent local transcripts and includes a one-click New conversation action that also resets the provider pages.
- **Readable results.** Collected answers render safe Markdown, and any process-trace answer can be opened in a full detail dialog.
- **Image reply completion.** ChatGPT image-only responses are detected as completed even when the page produces no Markdown text, so drawing prompts no longer leave a workflow waiting forever.
- **Longer, quieter diagnostics.** The in-memory log keeps up to 2,000 meaningful events and coalesces unchanged provider heartbeats.
- **Four interface languages.** English, 繁體中文, 日本語, and Deutsch are available from Settings.

## What's new in v0.5.2

- **No live-page detour.** ChatGPT, Claude, Gemini, and Grok remain active offscreen, so workflows can submit prompts without opening each provider's live page.
- **Verified sends.** The engine now confirms that the composer cleared, thinking started, or a response appeared; rejected clicks retry with Enter and fail fast instead of hanging.
- **Clean Claude prompts.** ProseMirror injection no longer inserts the same prompt twice.
- **Simpler composer.** The unused per-step confirmation toggle is gone; built-in workflows run automatically after you start them.

## Highlights

- **Zero API keys.** Everything runs on the web sessions you're already logged into. No keys are stored, requested, or transmitted.
- **Guided first run.** Start from a clear provider picker, see live connection and workflow-readiness states, and keep your draft when a workflow cannot start yet.
- **Four providers, one hub.** ChatGPT, Claude, Gemini, and Grok. Each keeps its own login profile.
- **Multi-model workflows.** Debate, roundtable, consulting, coding, and free-mode route prompts between providers and collect their replies — driven by a declarative graph engine, picked from a catalog of preset cards.
- **Focused view + status strip.** One provider takes the stage at a time; a compact strip lists all four with live status and next actions. Click to switch focus, or let focus follow whichever provider is responding. Only the focused provider's page is painted; the rest stay active offscreen so workflows continue without opening each live page.
- **Text-first center.** The focused provider shows a clean DOM-extracted text view by default; switch to the live page (真實頁面) only when you want to interact directly. A Login button appears in the header only when a provider actually needs it; reload and "report broken" sit behind a ⋯ menu.
- **Reproducible runs.** Opt-in execution snapshots with privacy tiers (metadata-only / hashes / prompt-text / full-local); a history icon opens the replay panel to rerun any past run on your current logged-in sessions.
- **Local file inject.** Drag-and-drop or pick multiple local files to attach to a prompt.
- **Light & dark themes + i18n.** Minimal light default with a dark toggle; English, 繁體中文, 日本語, and Deutsch language selector.
- **Hot-updatable adapters.** Per-provider selector adapters refresh remotely; what each adapter is allowed to touch is summarized per provider in Settings. A broken-adapter reporter and an opt-in redacted debug-bundle export are the only other outbound paths.

## Install

Download the assets from the [latest release](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest).

- **Windows** — download the portable `.zip`, unzip, and run the `.exe` (or use the `x64-setup.exe` installer). If SmartScreen warns, choose *More info → Run anyway*. Requires the Microsoft Edge WebView2 Evergreen Runtime.
- **macOS (Apple Silicon)** — open the `aarch64.dmg` and drag the app to Applications. Until notarization is added, use right-click → *Open* if Gatekeeper blocks the first launch. (Intel builds are not currently produced.)
- **Linux** — download the `.AppImage`, run `chmod +x *.AppImage`, then launch it.

## Launch from Codex or Claude Code (no installer)

The repository includes local desktop Skills that check prerequisites and open the Tauri source app for you:

- **Codex app** — open this repository in a local environment, select **Launch Multi-AI Chat**, or type `$launch-multi-ai-chat`.
- **Claude Code Desktop** — open the **Code** tab in a **Local** session, add this repository, then run `/launch-multi-ai-chat`.

No standalone Codex or Claude Code CLI is required when you use the desktop app. For safety, opening a repository never runs its code automatically, so one explicit Skill invocation is required. The source launch still needs Node.js 20+, pnpm, Rust/Cargo, and the platform's Tauri native prerequisites; the Skill reports exactly what is missing and never installs system toolchains silently. Remote or cloud sessions cannot open a GUI on your computer.

## Development

```sh
pnpm install
pnpm build:injected
pnpm verify
```

`pnpm tauri dev` runs the app; `pnpm tauri build` produces the installers / portable artifacts. On Windows this needs the MSVC C++ build tools and the WebView2 runtime.

## Privacy & trust

No API keys, no project account, no analytics. Your logins live in per-provider WebView profiles on your machine. Prompts go directly to the provider pages you selected; Multi-AI Chat has no separate conversation backend. Its other outbound actions are the opt-in adapter hot-update and the user-triggered broken-adapter/report links. Debug bundles are generated locally and saved only when you request one. Each adapter's access scope is visible in Settings. See [`docs/SPEC.md`](./docs/SPEC.md) for the exact transport and permission contract.

## Project

Sponsored by [AI-Sister.com](https://ai-sister.com). Created by Ted Huang ([TED@TED-H.com](mailto:TED@TED-H.com), [ted-h.com](https://ted-h.com)).

## License

MIT.
