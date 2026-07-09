# Multi-AI Chat Desktop

**English** | [繁體中文](./README.zh-TW.md)

A Tauri 2 desktop control pane that orchestrates your **logged-in** ChatGPT, Claude, Gemini, Grok, and Claude Code web sessions — **no API keys, no telemetry**. Instead of just placing chats side by side, a central control pane drives them through multi-model **workflows** (debate, roundtable, consulting, coding, free-mode) and routes every provider's reply back to the hub.

Status: **v0.4.0** — the control pane, five workflow modes, five web-session providers, reproducible runs (snapshots + replay), human relay checkpoints, per-provider adapters with remote hot-update, and three-platform packaging (Windows / macOS / Linux) are built and shipping. Portable-first, MIT, with community-maintained selector adapters. See [`docs/SPEC.md`](./docs/SPEC.md) for the behavior contract and [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the design.

## Highlights

- **Zero API keys.** Everything runs on the web sessions you're already logged into. No keys are stored, requested, or transmitted.
- **Five providers, one hub.** ChatGPT, Claude, Gemini, Grok, and Claude Code (`claude.ai/code`, the agentic tier). Each keeps its own login profile.
- **Multi-model workflows.** Debate, roundtable, consulting, coding, and free-mode route prompts between providers and collect their replies — driven by a declarative graph engine.
- **一大三小 focus layout.** All webviews live on the left: one large focused view plus small thumbnails; focus automatically follows the provider that's currently responding, or lock it manually.
- **Text-first center (v0.4.0).** The focused provider shows a clean DOM-extracted text view by default; switch to the live page (真實頁面) only when you want to interact directly. A "thinking…" indicator shows while a model is reasoning.
- **Reproducible runs.** Opt-in execution snapshots with privacy tiers (metadata-only / hashes / prompt-text / full-local); replay any past run on your current logged-in sessions.
- **Human relay checkpoints.** Pause between serial steps to review or edit the draft before it's sent — nothing is ever auto-sent on your behalf.
- **Local file inject.** Drag-and-drop or pick multiple local files to attach to a prompt.
- **Light & dark themes + i18n.** Minimal light default with a dark toggle; English and 繁體中文 language selector.
- **Hot-updatable adapters + diagnostics.** Per-provider selector adapters refresh remotely; a broken-adapter reporter, diagnostics panel, and opt-in redacted debug-bundle export are the only outbound paths.

## Install

Download the assets from the [latest release](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest).

- **Windows** — download the portable `.zip`, unzip, and run the `.exe` (or use the `x64-setup.exe` installer). If SmartScreen warns, choose *More info → Run anyway*. Requires the Microsoft Edge WebView2 Evergreen Runtime.
- **macOS (Apple Silicon)** — open the `aarch64.dmg` and drag the app to Applications. Until notarization is added, use right-click → *Open* if Gatekeeper blocks the first launch. (Intel builds are not currently produced.)
- **Linux** — download the `.AppImage`, run `chmod +x *.AppImage`, then launch it.

## Development

```sh
pnpm install
pnpm build:injected
pnpm verify
```

`pnpm tauri dev` runs the app; `pnpm tauri build` produces the installers / portable artifacts. On Windows this needs the MSVC C++ build tools and the WebView2 runtime.

## Privacy & trust

No API keys, no accounts, no analytics. Your logins live in per-provider WebView profiles on your machine. The app never sends your conversations anywhere — the only outbound actions are the opt-in adapter hot-update, the opt-in broken-adapter report, and the manual, redacted debug-bundle export. See [`docs/SPEC.md`](./docs/SPEC.md) for the exact transport and permission contract.

## License

MIT.
