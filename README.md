# Multi-AI Chat Desktop

Pre-alpha desktop port of Multi-AI Chat. The app uses Tauri 2, React, TypeScript, Tailwind, and provider webviews so users can chat through their own logged-in ChatGPT, Claude, Gemini, and Grok sessions without API keys.

Status: M0 scaffold. The control pane shell, adapter seeds, injected-script build step, and Tauri command skeleton are present. Provider webview automation lands in later milestones per `docs/PLAN.md`.

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

Do not run `pnpm tauri dev` until the Windows C++ build tools prerequisite from the plan is installed.
