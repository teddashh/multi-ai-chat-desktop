---
name: launch-multi-ai-chat
description: Launch the local Multi-AI Chat Tauri source app from this repository without building or running an installer. Use when the user explicitly asks to open, run, preview, or try the desktop app in a local Claude Code Desktop session.
disable-model-invocation: true
---

Launch the checked-out source app, not an installer or release build.

1. Confirm the Code session environment is Local. If it is Remote, SSH, or has no graphical desktop, explain that the Tauri window can only open on the user's computer and stop.
2. Run `node scripts/agent/doctor.mjs` from the repository root.
3. If a prerequisite is missing, report the exact missing item and stop. Do not silently install system toolchains or weaken security settings.
4. Run `node scripts/agent/launch.mjs`.
5. Report that the first Rust build may take several minutes. If the window does not appear, run `node scripts/agent/status.mjs` and summarize the last relevant error from `.agent-runtime/tauri-dev.log`.

Never run `pnpm tauri build`, download an installer, access provider credentials, or delete an existing provider profile. The user completes any first-time provider login inside the Tauri window.
