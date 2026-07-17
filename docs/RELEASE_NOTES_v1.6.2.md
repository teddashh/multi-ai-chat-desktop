# v1.6.2 — Complete Brainstorm and provider resilience

## Stable maintenance release / 正式維護版本

Multi-AI Chat Desktop `v1.6.2` completes the intended 12-round Brainstorm design, makes long provider responses activity-aware, and hardens Claude and Grok entry around current login and challenge pages. It remains within the frozen scope: this release corrects and stabilizes shipped workflows rather than adding a new product surface.

Multi-AI Chat Desktop `v1.6.2` 完成原定的 12 輪腦力激盪設計、讓 provider 長回覆能依活動狀態延長等待，並針對目前 Claude 與 Grok 的登入及安全驗證頁強化進入流程。本版仍遵守 feature-frozen 範圍：修正並穩定既有 workflow，不增加新的產品介面。

## Complete Brainstorm workflow / 完整腦力激盪流程

- Every Brainstorm round now includes Claude, Gemini, Grok, and ChatGPT once. Twelve rounds produce 48 contributions instead of treating 12 as a total turn count.
- 每輪都由 Claude、Gemini、Grok 與 ChatGPT 各回答一次；12 輪共 48 次發言，不再把 12 誤當成總發言數。
- Speaking order rotates between rounds so no provider permanently owns the opening or closing position.
- 每輪輪換發言順序，不讓任何 provider 固定取得開場或收尾位置。
- Five phases guide the session through framing, divergence, cross-pollination, harvesting and selection, then testable concepts. Each turn receives the complete history of the same local conversation.
- 五個階段依序完成問題框定、發散、交叉激發、收整選擇與可測試概念；每次發言都會收到同一本機 session 的完整前文。
- Prompts require direct contributions and synthesis instead of asking the user to choose from follow-up options or offering to continue later.
- Prompt 會要求直接貢獻與整合，不再自行丟出選項要求使用者選擇，也不會只提議稍後繼續。

## Reliable long responses / 可靠的長時間回覆

- Provider thinking state, newly received response chunks, bulk-ready content, completion signals, and a new document boot all count as activity and refresh the inactivity timeout.
- Provider 的思考狀態、新回覆片段、批次就緒內容、完成訊號與新的 document boot 都視為活動，會刷新 inactivity timeout。
- A separate 60-minute absolute cap remains in force even when a stale page keeps reporting `thinking`, preventing an infinite workflow wait.
- 即使過期頁面持續回報 `thinking`，仍受獨立的 60 分鐘絕對上限限制，避免 workflow 永久等待。
- Regression tests cover long thinking, chunk activity, completion activity, new boots, inactivity expiry, and the absolute timeout.
- Regression tests 涵蓋長時間思考、片段活動、完成活動、新 boot、inactivity 到期與 absolute timeout。

## Claude and Grok entry hardening / Claude 與 Grok 進入流程強化

- Claude adapter version 4 recognizes current account login fields and Google SSO entry without attempting to automate credentials.
- Claude adapter version 4 能辨識目前的帳號登入欄位與 Google SSO 入口，不會嘗試自動操作帳號密碼。
- Cloudflare and hCaptcha signals defer bridge startup for every provider until the challenge page clears. The app does not bypass provider security checks.
- 所有 provider 遇到 Cloudflare 或 hCaptcha 訊號時，都會延後 bridge 啟動直到驗證頁結束；本 app 不會繞過 provider 安全驗證。
- Grok pages continue without History API monkey-patching, reducing interference with login and challenge navigation.
- Grok 頁面不再 monkey-patch History API，降低對登入與安全驗證導覽的干擾。

## Contributor thanks / 貢獻者致謝

Thanks to Dave Tseng ([`@DaveTseng2019`](https://github.com/DaveTseng2019)) for identifying the fixed-timeout root cause and proposing the core keepalive implementation in [PR #34](https://github.com/teddashh/multi-ai-chat-desktop/pull/34). Commit `1d7ebb3` preserves his co-authorship; the release integration extends the fix to every response activity signal, adds the absolute safety cap, and supplies regression coverage.

感謝 Dave Tseng（[`@DaveTseng2019`](https://github.com/DaveTseng2019)）在 [PR #34](https://github.com/teddashh/multi-ai-chat-desktop/pull/34) 找出固定逾時的 root cause，並提出 keepalive 核心實作。Commit `1d7ebb3` 保留其共同作者資訊；release 整合再補齊所有回覆活動訊號、absolute safety cap 與 regression coverage。

## Validation / 驗證

- The release branch passes 416 frontend tests across 51 files, 21 Agent contract tests, TypeScript type-checking, ESLint, adapter checks, production build, npm audit, 54 Rust tests, `cargo fmt --check`, and warnings-denied Clippy.
- Release branch 通過 51 個檔案共 416 個 frontend tests、21 個 Agent contract tests、TypeScript type-check、ESLint、adapter checks、production build、npm audit、54 個 Rust tests、`cargo fmt --check` 與 warnings-denied Clippy。
- Pull-request CI and CodeQL pass, including warnings-denied Clippy on Windows, macOS, and Linux.
- Pull-request CI 與 CodeQL 全數通過，包含 Windows、macOS、Linux 的 warnings-denied Clippy。
- The immutable `v1.6.2` tag rebuilds the Windows installer and portable zip, Apple Silicon DMG, and Linux AppImage before the release is published.
- Immutable `v1.6.2` tag 會重新建置 Windows installer／portable zip、Apple Silicon DMG 與 Linux AppImage；全部產物完成後才發布正式版本。

## Accepted upstream risk / 已接受的上游風險

- The current Tauri/Wry Linux GTK3 dependency graph retains the documented medium-severity `glib::VariantStrIter` advisory. The app does not directly call the affected API, and the compatible upstream graph does not yet provide the newer `glib` line.
- 目前 Tauri／Wry 的 Linux GTK3 dependency graph 仍有已記錄的 medium-severity `glib::VariantStrIter` advisory。本 app 未直接呼叫受影響 API，而相容的上游 graph 尚未提供新版 `glib`。

## Downloads / 下載

- Windows x64 installer and portable zip
- Apple Silicon macOS DMG
- Linux x86_64 AppImage

## Notes / 注意事項

- Windows artifacts remain unsigned and may trigger SmartScreen.
- Windows 產物仍未簽章，可能觸發 SmartScreen。
- The macOS package is ad-hoc signed and signature-verified in CI, but is not Apple-notarized; follow the README first-launch steps if Gatekeeper blocks it.
- macOS package 使用 ad-hoc 簽章並由 CI 驗證，但尚未 Apple notarize；若 Gatekeeper 阻擋，請依 README 的首次啟動步驟操作。
- Grok login and Cloudflare verification remain third-party behavior and may vary by network, account, or provider changes. CI verifies packaging and challenge deferral but does not claim a real-account login result.
- Grok 登入與 Cloudflare 驗證屬第三方行為，可能因網路、帳號或 provider 改版而異；CI 會驗證封裝與 challenge deferral，但不宣稱已完成真實帳號登入測試。
- A full 48-contribution live Brainstorm run requires four authenticated provider accounts and is not represented as an automated end-user smoke result.
- 完整 48 次發言的 live Brainstorm 需要四個已登入 provider 帳號，不會被描述為自動化 end-user smoke 結果。
- Linux remains CI-packaged without a new maintainer-owned real-device launch report.
- Linux 仍由 CI 封裝，本版沒有 maintainer 自有實機的最新啟動回報。
- Provider websites can change independently. Attach a sanitized exported debug log when reporting automation failures.
- Provider 網頁可能獨立改版；回報自動化失敗時，請附上已去識別化的匯出 debug log。

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.6.1...v1.6.2
