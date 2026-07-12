# Agent-Ready Source Release Contract / Agent 可操作原始碼發行契約

> Contract version: **1.0.0**<br>
> Machine-readable source of truth: [`agent-release.json`](../agent-release.json)<br>
> Schema: [`agent-release.schema.json`](../agent-release.schema.json)

This document defines a conservative interface through which a local coding agent can audit, launch, verify, inspect, and stop the Multi-AI Chat Desktop source app. It is a source-development lane, not a replacement for normal release artifacts.

本文件定義一套保守、可驗證的介面，讓本機 coding agent 能審計、啟動、確認、檢查與停止 Multi-AI Chat Desktop 原始碼版。這是「原始碼開發通道」，不是一般安裝版本的替代品。

## Two Distribution Lanes

| Lane | Intended user | Entry point | Host development tools | Output |
|---|---|---|---|---|
| Release artifact | Most users | GitHub Release installer / portable package / DMG / AppImage | Not required | Packaged app |
| Agent-ready source | Developers and users intentionally working with a local agent | Explicit Codex or Claude Code Skill | Required and installed separately | `tauri dev` process from this checkout |

Opening the repository never launches the app. The source Skill is explicit-only. A remote agent can edit or test the repository, but only an agent shell running inside the user's local graphical session can open a desktop window there.

一般使用者應優先下載 Release。只有明確要求本機 Agent 執行 Skill，才會進入原始碼通道。遠端／雲端 Agent 可以修改或測試 repo，但無法把桌面視窗顯示到使用者的本機圖形 session。

## Contract Surface

| File | Purpose |
|---|---|
| `agent-release.json` | Versioned requirements, permissions, side effects, runtime states, entrypoints, and privacy promises |
| `agent-release.schema.json` | Strict JSON Schema for the manifest |
| `.agents/skills/launch-multi-ai-chat/` | Explicit Codex Skill and UI metadata |
| `.claude/skills/launch-multi-ai-chat/` | Explicit Claude Code Skill |
| `scripts/agent/*.mjs` | Deterministic lifecycle commands |
| `scripts/agent/tests/*.test.mjs` | Contract, drift, dry-run, identity, and runtime-state tests |
| `.agent-runtime/` | Ignored local state, log, launch receipt, and audit receipts |

The two Skill instruction bodies are intentionally identical and tested for drift. Tool-specific frontmatter is the only expected difference.

## Trust and Permission Boundary

### Source execution warning

Source launch executes code from the checked-out repository and its locked dependencies:

- `pnpm install --frozen-lockfile` may execute JavaScript dependency lifecycle scripts.
- Cargo compilation may execute Rust build scripts and procedural macros.
- `tauri dev` runs this checkout as a native desktop application.

Review and trust the checkout before invoking the Skill. The lifecycle is auditable, but it is not a sandbox.

### Allowed without another host-change approval

- Read repository files and run version/prerequisite checks.
- Install locked JavaScript dependencies into this project when absent.
- Use the user's existing pnpm and Cargo caches.
- Write the repository-local generated paths declared in the manifest.
- Start, inspect, and stop only the identity-verified launcher process tree for this checkout.

### Requires a separate, explicit approval

- Installing or uninstalling Node.js, pnpm, Rust, Xcode tools, Visual Studio Build Tools, WebView2, or Linux packages.
- Running `winget`, `brew`, `apt`, `rustup`, a global package install, `sudo`, or an elevated installer.
- Changing `PATH`, shell profiles, OS security settings, Gatekeeper policy, or execution policy.

The Skill reports a missing prerequisite and stops. If the user separately asks an agent to modify the host, that is a new operation: disclose the exact commands and side effects, obtain explicit approval, and audit before and after. The Skill never automatically uninstalls tools or attempts a machine-wide rollback.

### Always prohibited in this lane

- Implicit execution merely because the repository was opened.
- Installer/release generation (`pnpm tauri build`) or release-asset download.
- Reading, exporting, deleting, or uploading provider credentials, cookies, storage, or profiles.
- Stopping an unverified PID.
- Uploading logs or audit receipts automatically.
- Weakening OS security to make the app launch.

## Stable Lifecycle

All commands use exit code `0` for success, `1` for a prerequisite/runtime/operation failure, `2` for invalid usage or contract data, and `3` for a readiness timeout. `--json` produces one versioned JSON object on stdout; command/build progress is kept off JSON stdout.

```sh
node scripts/agent/audit.mjs --phase before --write --json
node scripts/agent/doctor.mjs --json
node scripts/agent/launch.mjs --dry-run --json
node scripts/agent/launch.mjs --wait --timeout-ms 600000 --json
node scripts/agent/status.mjs --json --lines 80
node scripts/agent/audit.mjs --phase after --write --json
node scripts/agent/stop.mjs --json
```

If state is corrupt, normal launch/stop fails closed. After inspecting the local state and log, the user may explicitly request `node scripts/agent/stop.mjs --clear-invalid-state --json`; it removes only the corrupt state file and never terminates an unknown process.

Recommended agent sequence:

1. Read `agent-release.json` and confirm a local graphical session.
2. Write the before-audit receipt.
3. Run doctor. Stop and report exact missing checks if it fails.
4. Launch with `--wait`; do not equate process creation with readiness.
5. Write the after-audit receipt even when launch fails or times out.
6. Report `ready` only when the current run emitted the deterministic control-pane marker.
7. Stop only after an explicit request.

`launch --dry-run` performs prerequisite checks and reports its plan without creating, deleting, or rewriting runtime state.

## Runtime Truth

| State | Meaning |
|---|---|
| `not_started` | No repository launcher state exists |
| `building` | The identity-verified process is alive; the control pane has not proved readiness |
| `ready` | The current launch segment contains `[MAC_AGENT] READY control-pane` and its verified process is alive |
| `failed` | The launcher exited before readiness and the current log segment contains a build/runtime failure |
| `exited` | The recorded launcher is no longer alive |
| `invalid_state` | State JSON, repository identity, PID, timestamp, or log path violates the contract |
| `foreign_process` | The recorded PID is alive but no longer matches this repository runner and token |

The READY marker is emitted from the mounted React control pane through a debug-only Tauri command. A marker from an older append-only log segment cannot satisfy a newer run. `accepted` means only that a launcher PID was recorded; it never means the UI is ready or visible in front of other windows.

The runner token prevents accidental PID-reuse termination. It is process identity metadata, not a secret, authentication mechanism, or sandbox boundary.

## Receipts and Side Effects

| Path | Meaning |
|---|---|
| `.agent-runtime/tauri-dev.json` | Current launcher identity and checkout path |
| `.agent-runtime/launch.lock` | Short-lived cross-platform mutex preventing concurrent launch races |
| `.agent-runtime/tauri-dev.log` | Append-only local build/runtime output |
| `.agent-runtime/last-launch.json` | Last accepted launch steps and declared effects |
| `.agent-runtime/audit-before.json` | Explicit pre-launch environment/artifact receipt |
| `.agent-runtime/audit-after.json` | Explicit post-launch receipt and comparison |

Declared repository-local effects are `node_modules/`, `src-tauri/gen/injected/`, `src-tauri/target/`, and `.agent-runtime/`. pnpm and Cargo may also populate their existing user caches. Once the Tauri app runs, it can create normal local settings and provider WebView profiles.

Audits record declared checks, repository artifact metadata, and contract-declared evidence-file metadata (dependency marker, generated bundles, development binary, and runtime receipts). They are not a recursive file hash, full operating-system inventory, or proof that unrelated host state never changed. Logs and receipts remain local and may contain usernames, local paths, or compiler diagnostics; inspect them before sharing.

## Cross-Platform Evidence

`pnpm agent:verify` checks the manifest/schema, entrypoints, package-script alignment, Skill-body parity, explicit invocation policy, source-change boundary, JSON command shape, dry-run non-mutation, current-run READY segmentation, and PID identity matching.

CI runs these tests on Windows, macOS, and Linux alongside real Tauri/Rust compilation. This proves contract portability and compilation, not that a GUI was manually observed on every OS. Real-device launch evidence belongs in [`docs/COMPATIBILITY.md`](./COMPATIBILITY.md).

## Why There Is No Docker Lane

This product intentionally embeds native WebViews, opens a host desktop window, and uses local provider profiles. A container would still require host display forwarding, native WebView integration, and profile bridging while adding a misleading second environment. Docker is therefore a non-goal for this source release; it would not make the intended local GUI path simpler or safer.

## Reusable Release Checklist

Projects adopting an “agent-ready source release” pattern should provide all of the following:

1. One versioned machine-readable manifest and a strict schema.
2. Explicit-only Skill invocation; opening a repo performs no work.
3. Honest disclosure of checked-out code, lifecycle-script, build-script, cache, and app-data effects.
4. A permission matrix separating project-local actions from host changes.
5. Stable commands, JSON output, and documented exit codes.
6. A dry-run that is tested not to mutate lifecycle state.
7. Separate “process accepted,” “building,” and application-level “ready” evidence, bound to one launch identity.
8. A launch mutex plus identity-checked stop behavior that re-verifies and refuses stale or foreign PIDs.
9. Local before/after receipts with no automatic upload or host rollback.
10. Cross-platform tests that prevent manifest, script, package, and Skill drift.
11. A clear distinction between automated CI evidence and real-device GUI evidence.
12. Explicit non-goals that keep the source lane from becoming a package manager, daemon, or hidden control plane.

## 繁體中文操作摘要

1. 一般使用者請下載正式 Release；Agent Skill 是需要本機開發環境的原始碼通道。
2. 打開 repo 不會自動執行。只有使用者明確呼叫 `$launch-multi-ai-chat` 或 `/launch-multi-ai-chat` 才能開始。
3. Skill 會先寫入 before audit、執行 doctor、啟動並等待 React control pane 的 READY 訊號，再寫 after audit。
4. `accepted`／`building` 不等於 ready；舊 log 的 READY 也不能算新一次啟動成功。
5. Skill 可以安裝此 repo 的 locked JavaScript dependencies，但不會安裝／移除系統工具、全域套件、PATH 或安全設定。
6. 若缺少 Node、Rust、MSVC、Xcode tools 或 Linux 套件，Skill 只會精確報告並停止；任何 host 安裝都必須是另一個獨立、明確同意的工作。
7. Lifecycle script 永遠不讀 provider credential/profile、不自動上傳 log、不自動 rollback host，也不會停止無法驗證身分的 process。
8. `pnpm agent:verify` 會在三個 OS 的 CI 防止 manifest、script 與兩套 Skill 漂移。
9. Audit 是可檢查的 repo-level receipt，不是 sandbox 或完整作業系統鑑識。
10. 不提供 Docker，因為這是需要本機圖形 session、native WebView 與 local provider profile 的桌面程式。
