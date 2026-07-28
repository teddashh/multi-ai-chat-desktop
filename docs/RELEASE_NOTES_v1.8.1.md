# v1.8.1 — Accurate Grok challenge status and four-provider defaults

## Stable maintenance release / 正式維護版本

Multi-AI Chat Desktop `v1.8.1` is a focused provider-compatibility and source-security maintenance release. It reports title-preserving Grok Cloudflare/Turnstile challenges accurately, restores all four providers to every built-in four-role or four-seat setup, protects snapshot/replay compatibility, and clears actionable JavaScript development-dependency advisories.

Multi-AI Chat Desktop `v1.8.1` 是聚焦於 provider 相容性與原始碼安全的維護版本。本版可正確回報保留原頁面標題的 Grok Cloudflare／Turnstile 驗證、讓所有內建四角色或四席配置重新完整使用四家 provider、保護 snapshot／replay 相容性，並清除可處理的 JavaScript 開發依賴警示。

## Accurate Grok challenge reporting / 正確回報 Grok 安全驗證

- A Grok-only, bounded, read-only host probe detects known embedded Turnstile markers even when the top-level page title remains `Grok`.
- Grok 專用、有界且唯讀的 host probe，即使頂層頁面標題仍為 `Grok`，也能辨識已知的內嵌 Turnstile 標記。
- Detection runs only while the automation bridge is absent, does not mutate the provider document, and rejects stale probe results before reporting the provider as blocked.
- 偵測只會在 automation bridge 尚未存在時執行，不會修改 provider document，且會拒絕過期的 probe 結果，再把 provider 回報為 blocked。
- This resolves the actionable status-reporting portion of [#53](https://github.com/teddashh/multi-ai-chat-desktop/issues/53). It does not bypass Turnstile or make a system-browser login authenticate the app's isolated WebView profile.
- 這解決了 [#53](https://github.com/teddashh/multi-ai-chat-desktop/issues/53) 中可處理的狀態回報問題；它不會繞過 Turnstile，也不會讓系統瀏覽器登入替 app 內隔離的 WebView profile 完成驗證。

## Restored four-provider defaults / 恢復四家 provider 預設

- Debate, Consult, Coding, Roundtable, and Brainstorm now assign ChatGPT, Claude, Gemini, and Grok once each in their built-in four-role or four-seat configurations.
- 四方辯證、多方諮詢、Coding、道理辯證與腦力激盪的內建四角色／四席配置，現在都會讓 ChatGPT、Claude、Gemini、Grok 各擔任一次。
- Exact v1.7–v1.8 three-provider defaults are upgraded once through the versioned settings migration. User-customized role maps remain unchanged.
- 完全符合 v1.7–v1.8 三家 provider 舊預設的設定，會透過有版本的 settings migration 遷移一次；使用者自訂的角色配置保持不變。
- If Grok or another provider is unavailable, structured workflows stop at preflight and identify the unavailable provider. Users can complete login inside the app WebView or reassign the affected role.
- 若 Grok 或其他 provider 無法使用，結構化 workflow 會在 preflight 停止並指出無法使用的 provider；使用者可在 app WebView 內完成登入，或重新指定受影響的角色。
- Workflow graph versions were increased wherever default provider routing changed, preserving explicit snapshot/replay mismatch handling.
- 所有預設 provider routing 有變更的 workflow graph 都提高了版本，讓 snapshot／replay 的不相容情況維持明確失敗。

## Source-toolchain security / 原始碼工具鏈安全

- ESLint, React Hooks linting, PostCSS, and their locked transitive dependency graph were updated, clearing the actionable `brace-expansion`, `fast-uri`, and `postcss` advisories.
- ESLint、React Hooks linting、PostCSS 與鎖定的 transitive dependency graph 已更新，清除可處理的 `brace-expansion`、`fast-uri` 與 `postcss` advisories。
- The existing lint policy remains in force; the dependency refresh does not silently enable optional React Compiler rules or change packaged application behavior.
- 現有 lint policy 保持不變；這次依賴更新不會暗中啟用可選的 React Compiler rules，也不會改變封裝後 app 的行為。
- The Agent-ready source contract and Skills move to v2.0.0 and require Node.js `^22.13.0 || >=24.0.0`, matching the supported intersection of the locked source toolchain. Packaged users are unaffected.
- Agent-ready source contract 與 Skills 升級到 v2.0.0，並要求 Node.js `^22.13.0 || >=24.0.0`，與鎖定工具鏈實際支援的交集一致；封裝版使用者不受影響。

## Validation / 驗證

- The release candidate passes 448 frontend tests across 52 files, 22 Agent contract tests, TypeScript type-checking, ESLint, adapter schema/seed checks, production injected-script builds, and the production frontend build.
- Release candidate 通過 52 個檔案共 448 個 frontend tests、22 個 Agent contract tests、TypeScript type-check、ESLint、adapter schema／seed checks、production injected-script build 與 production frontend build。
- `pnpm audit --audit-level=low` reports no known JavaScript dependency vulnerabilities.
- `pnpm audit --audit-level=low` 未發現已知的 JavaScript dependency 漏洞。
- It also passes 63 Rust tests, `cargo fmt --check`, warnings-denied Clippy, and pull-request checks on Windows, macOS, and Linux.
- 同時通過 63 個 Rust tests、`cargo fmt --check`、warnings-denied Clippy，以及 Windows、macOS、Linux 的 pull-request checks。
- The immutable `v1.8.1` tag rebuilds the Windows installer and portable zip, Apple Silicon DMG, and Linux AppImage before the draft release is reviewed.
- Immutable `v1.8.1` tag 會重新建置 Windows installer／portable zip、Apple Silicon DMG 與 Linux AppImage，完成後再檢查 Draft Release。

## Downloads / 下載

- Windows x64 installer and portable zip
- Apple Silicon macOS DMG
- Linux x86_64 AppImage

## Release gate and known limits / 發布門檻與已知限制

- Automated tests verify challenge detection policy; they do not execute or prove completion of a live third-party Turnstile challenge.
- 自動化測試可驗證 challenge detection policy，但不會實際完成第三方 Turnstile，也不能證明 live challenge 可通過。
- Stable publication still requires a Windows artifact smoke test and, on Apple Silicon, first launch plus login checks for all four providers—especially confirmation that Grok leaves Cloudflare verification. Artifact creation or CI packaging alone is not that evidence.
- 正式發布仍需完成 Windows artifact smoke test；Apple Silicon 則需驗證首次啟動與四家 provider 登入，尤其必須確認 Grok 能離開 Cloudflare 驗證頁。只有產生 artifact 或通過 CI 封裝不算這項證據。
- Windows artifacts remain unsigned and may trigger SmartScreen.
- Windows 產物仍未簽章，可能觸發 SmartScreen。
- The macOS package is ad-hoc signed and signature-verified in CI, but is not Apple-notarized.
- macOS package 使用 ad-hoc 簽章並由 CI 驗證，但尚未 Apple notarize。
- Linux remains CI-packaged without a new maintainer-owned real-device launch report.
- Linux 仍由 CI 封裝，沒有 maintainer 自有實機的最新啟動回報。
- The current Tauri/Wry Linux GTK3 dependency graph retains the documented medium-severity `glib::VariantStrIter` advisory. The app does not directly call the affected API, and this release does not represent that upstream risk as fixed.
- 目前 Tauri／Wry 的 Linux GTK3 dependency graph 仍保留已記錄的 medium-severity `glib::VariantStrIter` advisory；本 app 未直接呼叫受影響 API，本版也不會把這項上游風險宣稱為已修復。

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.8.0...v1.8.1
