# Multi-AI Chat Desktop

A Tauri 2 desktop control pane that orchestrates your **logged-in** ChatGPT, Claude, Gemini, and Grok web sessions — no API keys. Rather than just placing four chats side by side, a central control pane drives them through multi-model **workflows** (debate, roundtable, consulting, coding, free-mode) and routes each provider's replies back to the hub.

Status: **v0.1.0** — first release. The control pane, five workflow modes, per-provider adapters with remote hot-update, a broken-adapter reporter, file broadcast, and three-platform packaging (Windows / macOS / Linux) are built and shipping. Portable-first, MIT, with community-maintained selector adapters. See `docs/SPEC.md` for the behavior contract and `docs/ARCHITECTURE.md` for the design.

## Install

- Windows portable: download the portable `.zip`, unzip it, and run the `.exe`. If SmartScreen warns, choose More info -> Run anyway. Requires the Microsoft Edge WebView2 Evergreen Runtime.
- Linux: download the `.AppImage`, run `chmod +x *.AppImage`, then launch it.
- macOS: open the `.dmg` and drag the app to Applications. Until notarization is added, use right-click -> Open if Gatekeeper blocks first launch.

## Development

```sh
pnpm install
pnpm build:injected
pnpm verify
```

`pnpm tauri dev` runs the app; `pnpm tauri build` produces the installers / portable artifacts. On Windows this needs the MSVC C++ build tools and the WebView2 runtime.
