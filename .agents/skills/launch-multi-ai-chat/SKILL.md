---
name: launch-multi-ai-chat
description: Audit, launch, verify, inspect, or stop the local Multi-AI Chat Tauri source app. Use only when the user explicitly asks to run this checked-out repository on their local graphical computer.
---

Operate the source-development lane defined by `agent-release.json`. It is not an installer, release build, container, or remote GUI.

Source launch executes code from the checked-out repository, locked JavaScript dependencies, and Rust build dependencies. Keep all lifecycle records local and never read provider credentials, cookies, storage, or profiles.

For an explicit launch request:

1. Confirm the shell is on the user's local graphical computer. Do not claim a remote or headless shell can display the window.
2. Run `node scripts/agent/audit.mjs --phase before --write --json`.
3. Run `node scripts/agent/doctor.mjs --json`.
4. If prerequisites are missing, report the exact checks and stop. This skill never installs or removes host toolchains, global packages, PATH entries, shell profiles, or security settings. A separate host-change request requires separate explicit approval outside this skill, with exact commands and side effects disclosed first.
5. Run `node scripts/agent/launch.mjs --wait --timeout-ms 600000 --json`.
6. Run `node scripts/agent/audit.mjs --phase after --write --json`, including after a launch failure or timeout.
7. Claim readiness only when launch or `node scripts/agent/status.mjs --json --lines 80` reports `state: "ready"`. “accepted” or “building” does not mean the window is ready.

For status, run `node scripts/agent/status.mjs --json --lines 80`. For an explicit stop request, run `node scripts/agent/stop.mjs --json`. Never stop an unverified process. Use `--clear-invalid-state` only after the user explicitly asks to recover inspected corrupt state; it removes no process.

Never run `pnpm tauri build`, generate installers, download release assets for this lane, upload logs or audits, weaken OS security, delete provider profiles, or automatically roll back/uninstall host software. Shared pnpm/Cargo caches and normal app data are user-managed.
