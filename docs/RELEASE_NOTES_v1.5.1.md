# v1.5.1 — Security and release hardening

## Stable maintenance release / 正式維護版本

Multi-AI Chat Desktop `v1.5.1` is a focused security and maintenance release. It hardens Windows source-agent command execution, tightens Gemini hostname validation, replaces insecure identifier fallbacks, clears actionable development-dependency advisories, and upgrades the repository's release automation to Node 24-compatible actions. It adds no new product features and preserves the feature-frozen scope.

Multi-AI Chat Desktop `v1.5.1` 是聚焦於安全與維護的版本。它強化 Windows source agent 的命令執行、收緊 Gemini hostname 驗證、替換不安全的識別碼備援、清除可處理的開發依賴警示，並把 release automation 升級到 Node 24 相容 Actions。本版不新增產品功能，維持 feature-frozen 範圍。

## Runtime fixes / Runtime 修補

- Windows Agent-Ready Source Release commands now pass through a strict allowlist of the fixed tokens required for `pnpm` or Corepack launch. Whitespace and shell metacharacters are rejected instead of being incompletely escaped.
- Windows Agent-Ready Source Release 命令現在只允許 `pnpm`／Corepack 啟動真正需要的固定 token；空白與 shell 特殊字元會被拒絕，不再使用不完整的 escaping。
- Gemini's blocked-state fallback requires the exact `gemini.google.com` hostname rather than accepting an arbitrary URL substring.
- Gemini 的 blocked-state 備援改為精確比對 `gemini.google.com`，不再接受任意 URL substring。
- Conversation and message identities use `crypto.randomUUID()` or `crypto.getRandomValues()` when available, with a process-local monotonic fallback rather than `Math.random()`.
- 對話與訊息識別碼會優先使用 `crypto.randomUUID()`／`crypto.getRandomValues()`，並以 process-local 單調序列取代 `Math.random()` 備援。

## Repository security / Repo 安全

- Vitest is upgraded to `3.2.7` and esbuild to `0.25.12`, removing the six actionable npm Dependabot alerts discovered when repository scanning was enabled.
- Vitest 升級到 `3.2.7`、esbuild 升級到 `0.25.12`，排除啟用掃描後找到的六筆可處理 npm Dependabot 警示。
- GitHub Actions use Node 24-compatible releases pinned to immutable commits, checkout credentials are not persisted, and workflow permissions follow least privilege.
- GitHub Actions 改用 Node 24 相容版本並固定 immutable commit；checkout 不保留 credentials，workflow 權限採 least privilege。
- Dependabot security updates, monthly GitHub Actions update checks, weekly CodeQL analysis, and protected `main` status checks are enabled for future maintenance.
- 已啟用 Dependabot security updates、每月 GitHub Actions 更新檢查、每週 CodeQL，以及受保護的 `main` status checks。

## Accepted upstream risk / 已接受的上游風險

- The Linux GTK3 dependency graph from the current Tauri `2.11.5` / Wry `0.55.1` stack still resolves to `glib 0.18.5`, which has a medium-severity advisory for `glib::VariantStrIter`.
- 目前 Tauri `2.11.5`／Wry `0.55.1` 的 Linux GTK3 依賴仍會解析到 `glib 0.18.5`；其 `glib::VariantStrIter` 有一筆 medium advisory。
- This application does not directly call that API, and `glib >=0.20` is not compatible with the upstream `gtk 0.18` graph. The alert is documented as a tolerable transitive risk until Tauri/Wry migrates upstream; it is not represented as fixed.
- 本 app 未直接呼叫該 API，而 `glib >=0.20` 與上游 `gtk 0.18` dependency graph 不相容。此警示會以可接受的 transitive risk 留存，等待 Tauri/Wry 上游遷移，不會被宣稱為已修復。

## Validation / 驗證

- The release branch passed 384 frontend tests, 21 Agent contract tests, TypeScript type-checking, ESLint, adapter checks, npm audit, Rust tests, and warnings-denied Clippy on Windows, macOS, and Linux.
- Release branch 通過 384 個前端測試、21 個 Agent contract 測試、TypeScript type-check、ESLint、adapter checks、npm audit、Rust tests，以及 Windows／macOS／Linux 的 warnings-denied Clippy。
- CodeQL analysis passed for GitHub Actions, JavaScript/TypeScript, and Rust with no open code-scanning alerts on `main`.
- CodeQL 的 GitHub Actions、JavaScript/TypeScript 與 Rust 分析全部通過，`main` 沒有 open code-scanning alert。
- The immutable `v1.5.1` tag rebuilds the Windows installer and portable zip, Apple Silicon DMG, and Linux AppImage before this draft is published.
- Immutable `v1.5.1` tag 會重新建置 Windows installer／portable zip、Apple Silicon DMG 與 Linux AppImage；draft 只有在這些產物成功後才會發布。

## Downloads / 下載

- Windows x64 installer and portable zip
- Apple Silicon macOS DMG
- Linux x86_64 AppImage

## Notes / 注意事項

- Windows artifacts remain unsigned and may trigger SmartScreen.
- The macOS package is ad-hoc signed and signature-verified in CI, but is not Apple-notarized; follow the README first-launch steps if Gatekeeper blocks it.
- Live macOS provider compatibility, especially Grok through Cloudflare verification, still depends on third-party behavior and has not been re-confirmed on a maintainer-owned Apple Silicon device for this patch.
- Linux remains CI-packaged without a new real-device launch report.
- Provider websites can change independently. Attach a sanitized exported debug log when reporting automation failures.

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.5.0...v1.5.1
