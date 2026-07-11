---
name: launch-multi-ai-chat
description: Launch, inspect, or stop the local Multi-AI Chat Tauri source app from this repository without an installer. Use only when the user explicitly asks Codex to open, run, preview, check, or stop the app on a local graphical computer.
---

Launch the checked-out source app, not an installer or release build.

1. Confirm this agent has a local shell on the user's graphical computer. A remote cloud task cannot display the Tauri window on the user's screen.
2. Run `node scripts/agent/doctor.mjs` from the repository root.
3. If a prerequisite is missing, report the exact missing item and stop. Do not silently install system toolchains or weaken security settings.
4. Run `node scripts/agent/launch.mjs`.
5. Report that the first Rust build may take several minutes. If the window does not appear, run `node scripts/agent/status.mjs --lines 80` and summarize the last relevant error from `.agent-runtime/tauri-dev.log`.

For a status request, run `node scripts/agent/status.mjs`. For an explicit stop request, run `node scripts/agent/stop.mjs`.

Never run `pnpm tauri build`, download an installer, access provider credentials, or delete an existing provider profile. The user completes any first-time provider login inside the Tauri window. Do not claim that a window opened unless the launch command succeeds.
