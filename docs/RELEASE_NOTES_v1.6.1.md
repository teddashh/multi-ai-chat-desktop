# v1.6.1 — Localized workflows and safer conversations

## Stable maintenance release / 正式維護版本

Multi-AI Chat Desktop `v1.6.1` closes three conversation and workflow edge cases while completing runtime UI localization. It does not expand the frozen product scope: the same six presets, five workflow engines, local-first data model, and optional AI-Sister commemorative theme remain in place.

Multi-AI Chat Desktop `v1.6.1` 修正三項對話與 workflow 邊界狀況，並完成執行中 UI 的在地化。此版本沒有擴張已凍結的產品範圍：仍維持六個預設、五套 workflow 引擎、local-first 資料模型，以及可選的 AI-Sister 紀念 Theme。

## Complete workflow localization / Workflow 完整在地化

- Mode status, round and phase text, role labels, process traces, and Replay now follow the selected English, Traditional Chinese, Japanese, or German UI locale.
- 模式狀態、輪次與階段、角色名稱、流程追蹤及 Replay 現在都會跟隨 English、繁體中文、日本語或 Deutsch UI 語系。
- English and other non-Chinese interfaces no longer expose hard-coded labels such as `第一輪` or `開場立論`.
- 英文及其他非中文介面不再混入 `第一輪`、`開場立論` 等硬編碼中文標籤。

## Safer conversation boundaries / 更安全的對話邊界

- Switching local history keeps provider WebViews connected and defers remote reset until the next message, avoiding unnecessary reloads while the user is only reading history.
- 切換本機歷史記錄時會維持 provider WebView 連線，並將遠端 reset 延後到下一次送出；只閱讀歷史時不再造成不必要的重載。
- Before sending a restored follow-up, only participating providers start clean remote threads. Rust waits for a different document boot, a ready bridge, and a matching live WebView boot before the workflow can continue.
- 恢復舊 session 後第一次追問前，只有實際參與本次 workflow 的 provider 會建立乾淨遠端 thread；Rust 會等待不同的 document boot、ready bridge，並確認目前 WebView 的 boot 相符後才放行。
- Reset rejection or timeout blocks the send, retains failed providers for retry, preserves the draft, and records a provider-specific diagnostic event. No same-session replay context is injected into an unverified old thread.
- Reset 被拒或逾時時會阻擋送出、保留失敗 provider 供重試、保留草稿並記錄 provider 專屬診斷；未驗證的舊 thread 不會收到 same-session replay context。

## Session and Consult fixes / Session 與 Consult 修正

- Repeated **New conversation** clicks reuse the active blank session instead of creating duplicate sidebar entries, while still resetting mode, preset, transcript state, and the next remote send.
- 連按 **新對話** 會沿用目前空白 session，不再產生重複側欄項目；模式、preset、逐字稿狀態與下一次遠端送出仍會完整重設。
- Consult stops after the two parallel first answers when both are canonical errors or skips. If either answer is usable, review and summary continue normally.
- Consult 的兩份平行首輪回答若都只是標準錯誤或略過，流程會直接停止；只要其中一份可用，審查與總結仍會照常繼續。
- The Consult graph is now version 3. Existing version-2 snapshots remain preserved and require the existing explicit “use current graph” choice before replay.
- Consult graph 已升為 version 3。既有 version-2 snapshot 仍會保留，Replay 前需使用現有的明確「改用目前 graph」選項。

## Contributor thanks / 貢獻者致謝

Thanks to Dave Tseng ([`@DaveTseng2019`](https://github.com/DaveTseng2019)) for the diagnosis and original implementations in [PR #23](https://github.com/teddashh/multi-ai-chat-desktop/pull/23), [PR #31](https://github.com/teddashh/multi-ai-chat-desktop/pull/31), and [PR #32](https://github.com/teddashh/multi-ai-chat-desktop/pull/32). His commits are preserved with original authorship; the release integration adds the new-boot gate, failure-safe send path, participant-only reset, full blank-session reset, graph version bump, localization, and regression coverage.

感謝 Dave Tseng（[`@DaveTseng2019`](https://github.com/DaveTseng2019)）在 [PR #23](https://github.com/teddashh/multi-ai-chat-desktop/pull/23)、[PR #31](https://github.com/teddashh/multi-ai-chat-desktop/pull/31) 與 [PR #32](https://github.com/teddashh/multi-ai-chat-desktop/pull/32) 提供診斷及原始實作。這些 commit 均保留原作者資訊；release 整合另外補上 new-boot gate、失敗安全的送出路徑、participant-only reset、完整空白 session 重設、graph version bump、語系與 regression coverage。

## Validation / 驗證

- The release branch passes 406 frontend tests across 51 files, 21 Agent contract tests, TypeScript type-checking, ESLint, adapter checks, npm audit, 54 Rust tests, and warnings-denied Clippy.
- Release branch 通過 51 個檔案共 406 個 frontend tests、21 個 Agent contract tests、TypeScript type-check、ESLint、adapter checks、npm audit、54 個 Rust tests，以及 warnings-denied Clippy。
- Pull-request CI validates warnings-denied Clippy on Windows, macOS, and Linux before the release tag is created.
- 建立 release tag 前，pull-request CI 會在 Windows、macOS 與 Linux 驗證 warnings-denied Clippy。
- The immutable `v1.6.1` tag rebuilds the Windows installer and portable zip, Apple Silicon DMG, and Linux AppImage before the release is published.
- Immutable `v1.6.1` tag 會重新建置 Windows installer／portable zip、Apple Silicon DMG 與 Linux AppImage；全部產物完成後才發布正式版本。

## Accepted upstream risk / 已接受的上游風險

- The current Tauri/Wry Linux GTK3 dependency graph retains the previously documented medium-severity `glib::VariantStrIter` advisory.
- 目前 Tauri／Wry 的 Linux GTK3 dependency graph 仍保留先前記錄的 medium-severity `glib::VariantStrIter` advisory。
- This app does not directly call the affected API, and the compatible upstream GTK graph does not yet provide the newer `glib` line. The transitive risk remains documented rather than being represented as fixed.
- 本 app 未直接呼叫受影響 API，而相容的上游 GTK graph 尚未提供新版 `glib`；因此繼續如實記錄此 transitive risk，不會宣稱已修復。

## Downloads / 下載

- Windows x64 installer and portable zip
- Apple Silicon macOS DMG
- Linux x86_64 AppImage

## Notes / 注意事項

- Windows artifacts remain unsigned and may trigger SmartScreen.
- Windows 產物仍未簽章，可能觸發 SmartScreen。
- The macOS package is ad-hoc signed and signature-verified in CI, but is not Apple-notarized; follow the README first-launch steps if Gatekeeper blocks it.
- macOS package 使用 ad-hoc 簽章並由 CI 驗證，但尚未 Apple notarize；若 Gatekeeper 阻擋，請依 README 的首次啟動步驟操作。
- Grok login and Cloudflare verification remain third-party behavior and may vary by network, account, or provider changes.
- Grok 登入與 Cloudflare 驗證屬第三方行為，可能因網路、帳號或 provider 改版而異。
- Linux remains CI-packaged without a new maintainer-owned real-device launch report.
- Linux 仍由 CI 封裝，本版沒有 maintainer 自有實機的最新啟動回報。
- Provider websites can change independently. Attach a sanitized exported debug log when reporting automation failures.
- Provider 網頁可能獨立改版；回報自動化失敗時，請附上已去識別化的匯出 debug log。

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.6.0...v1.6.1
