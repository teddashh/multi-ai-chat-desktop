# v1.6.3 — Lifecycle stability and release hygiene

## Stable maintenance release / 正式維護版本

Multi-AI Chat Desktop `v1.6.3` is a focused stability patch for asynchronous UI, provider WebView, and session-reset lifecycles. It also tightens release supply-chain pinning and restores machine-readable MIT license detection. The frozen product scope is unchanged: no provider, workflow, or product surface was added.

Multi-AI Chat Desktop `v1.6.3` 是針對非同步 UI、provider WebView 與 session reset 生命週期的穩定性修正版，同時強化 release supply-chain pinning，並恢復可由工具辨識的標準 MIT 授權。已凍結的產品範圍完全不變：沒有增加 provider、workflow 或新產品介面。

## UI and WebView lifecycle reliability / UI 與 WebView 生命週期可靠性

- Provider WebView hide/show commands are serialized per provider. A modal opened and closed rapidly can no longer finish an older hide command after the restore command and leave the live page invisible.
- 每個 provider 的 WebView hide/show 命令會依序執行；快速開關 modal 時，較舊的 hide 不會在 restore 之後才完成，避免真實頁面持續隱藏。
- Adapter notice subscriptions now dispose correctly even when an asynchronous listener registration resolves after React StrictMode cleanup.
- 即使非同步 listener 註冊在 React StrictMode cleanup 後才完成，adapter notice subscription 也會正確解除，不會留下重複 listener。
- Settings update checks are bound to one modal session and request sequence, preventing a late result from overwriting a newly reopened Settings view.
- Settings 的版本檢查綁定單一 modal session 與 request sequence，過晚結果不會覆蓋重新開啟後的新狀態。

## Provider focus and session recovery / Provider 焦點與 session 恢復

- Opening an already-existing provider WebView no longer steals keyboard focus during background restoration. Explicit login or focus actions continue to request focus normally.
- 背景恢復已存在的 provider WebView 時不再搶走鍵盤焦點；明確的登入或聚焦操作仍會正常要求 focus。
- A timed-out new-session operation clears its pending boot filter before returning an error. The current document can immediately resume status reporting instead of remaining rejected until another navigation.
- New session 逾時時會先清除 pending boot filter 再回報錯誤，讓目前 document 立即恢復狀態回報，不必再等下一次導覽。

## Supply chain and licensing / Supply chain 與授權

- CI and release workflows pin `dtolnay/rust-toolchain` to an immutable commit rather than a moving `stable` reference.
- CI 與 release workflow 將 `dtolnay/rust-toolchain` 鎖定 immutable commit，不再使用會移動的 `stable` reference。
- The `LICENSE` file now contains the unmodified standard MIT text. Project provenance is preserved in a separate `NOTICE.md`, allowing license scanners to identify the repository correctly without losing attribution.
- `LICENSE` 現在保留未修改的標準 MIT 文字；專案來源資訊移至獨立 `NOTICE.md`，讓 license scanner 能正確辨識，同時保留 attribution。

## Review scope / 審核範圍

- The stability audit found no open pull requests, issues, Dependabot alerts, code-scanning alerts, or secret-scanning alerts at review time. npm audit reported no known package vulnerabilities.
- 穩定性稽核當下沒有未處理的 pull request、issue、Dependabot alert、code-scanning alert 或 secret-scanning alert；npm audit 也沒有已知套件漏洞。
- Major React, Tailwind, Vite, Vitest, ESLint, and TypeScript upgrades remain intentionally deferred. A feature-frozen maintenance patch should not absorb unrelated major-version migration risk.
- React、Tailwind、Vite、Vitest、ESLint 與 TypeScript 的 major upgrade 刻意延後；feature-frozen 維護版不應承擔無關的大版本遷移風險。
- Large structural refactors such as splitting `App.tsx` remain deferred until a concrete defect requires them.
- `App.tsx` 拆分等大型結構重構持續延後，除非未來有具體缺陷需要處理。

## Validation / 驗證

- The release candidate passes 417 frontend tests across 51 files, 21 Agent contract tests, TypeScript type-checking, ESLint, adapter checks, production build, and npm audit.
- Release candidate 通過 51 個檔案共 417 個 frontend tests、21 個 Agent contract tests、TypeScript type-check、ESLint、adapter checks、production build 與 npm audit。
- It also passes 55 Rust tests, `cargo fmt --check`, warnings-denied Clippy, pull-request CI, and CodeQL on Windows, macOS, and Linux.
- 同時通過 55 個 Rust tests、`cargo fmt --check`、warnings-denied Clippy，以及 Windows、macOS、Linux 的 pull-request CI 與 CodeQL。
- The immutable `v1.6.3` tag rebuilds the Windows installer and portable zip, Apple Silicon DMG, and Linux AppImage before the release is published.
- Immutable `v1.6.3` tag 會重新建置 Windows installer／portable zip、Apple Silicon DMG 與 Linux AppImage；全部產物完成後才發布正式版本。

## Accepted upstream risk / 已接受的上游風險

- The current Tauri/Wry Linux GTK3 dependency graph retains the documented medium-severity `glib::VariantStrIter` advisory. The app does not directly call the affected API, and the compatible upstream graph does not yet provide the newer `glib` line.
- 目前 Tauri／Wry 的 Linux GTK3 dependency graph 仍有已記錄的 medium-severity `glib::VariantStrIter` advisory。本 app 未直接呼叫受影響 API，而相容的上游 graph 尚未提供新版 `glib` line。

## Downloads / 下載

- Windows x64 installer and portable zip
- Apple Silicon macOS DMG
- Linux x86_64 AppImage

## Notes / 注意事項

- Windows artifacts remain unsigned and may trigger SmartScreen.
- Windows 產物仍未簽章，可能觸發 SmartScreen。
- The macOS package is ad-hoc signed and signature-verified in CI, but is not Apple-notarized; follow the README first-launch steps if Gatekeeper blocks it.
- macOS package 使用 ad-hoc 簽章並由 CI 驗證，但尚未 Apple notarize；若 Gatekeeper 阻擋，請依 README 的首次啟動步驟操作。
- Grok login and Cloudflare verification remain third-party behavior and may vary by network, account, or provider changes. The app defers rather than bypasses provider security checks.
- Grok 登入與 Cloudflare 驗證屬第三方行為，可能因網路、帳號或 provider 改版而異；本 app 只會延後自動化，不會繞過 provider 安全驗證。
- Linux remains CI-packaged without a new maintainer-owned real-device launch report.
- Linux 仍由 CI 封裝，本版沒有 maintainer 自有實機的最新啟動回報。
- Provider websites can change independently. Attach a sanitized exported debug log when reporting automation failures.
- Provider 網頁可能獨立改版；回報自動化失敗時，請附上已去識別化的匯出 debug log。

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.6.2...v1.6.3
