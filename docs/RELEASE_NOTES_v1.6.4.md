# v1.6.4 — Provider recovery and expanded real-page focus

## Stable maintenance release / 正式維護版本

Multi-AI Chat Desktop `v1.6.4` repairs provider connection-state detection and security-challenge recovery, while making the focused real provider page easier to inspect. It is a maintenance release within the frozen product scope: no provider, workflow, persistence format, or background service was added.

Multi-AI Chat Desktop `v1.6.4` 修正 provider 連線狀態與安全驗證頁的恢復流程，並讓目前聚焦的真實 provider 頁面更容易閱讀。這是凍結產品範圍內的維護版本：沒有新增 provider、workflow、持久化格式或背景服務。

## Accurate provider state / 正確的 provider 狀態

- Logged-out ChatGPT and Grok pages can retain a visible composer. Logged-out detectors now take precedence, so these pages no longer appear connected or accept workflow work that cannot complete.
- ChatGPT 與 Grok 登出頁可能仍保留 composer；現在登出 detector 具有優先權，不再誤顯示已連線，也不會接下無法完成的 workflow 工作。
- Grok's text-based sign-in detection covers common English, Traditional and Simplified Chinese, Japanese, and German labels.
- Grok 的文字登入偵測涵蓋常見英文、繁體與簡體中文、日文及德文標籤。
- Adapter schema v2 adds typed object-form logged-out detectors while preserving schema v1 string adapters. Unknown fields, empty selectors or filters, and unsupported schema versions fail closed.
- Adapter schema v2 新增強型別物件式登出 detector，同時保留 schema v1 字串 adapter；未知欄位、空 selector／filter 與不支援的 schema 版本都會 fail closed。

## Passive challenge recovery / 被動恢復安全驗證

- Gemini may redirect an embedded session to Google's `https://www.google.com/sorry/index?...` anti-bot page. The app now permits only Gemini's HTTPS `www.google.com/sorry` path family, reports it as blocked instead of indefinitely checking, and allows the user to complete the provider-controlled page.
- Gemini 的嵌入式 session 可能被導向 Google `https://www.google.com/sorry/index?...` 防機器人頁面；app 現在只允許 Gemini 使用 HTTPS `www.google.com/sorry` 路徑範圍，會顯示阻擋而非無限檢查，並讓使用者處理 provider 控制的頁面。
- The automation bridge and permission shim remain passive on that Google page. Sibling paths, lookalike hosts, non-HTTPS URLs, and cross-provider use stay denied.
- 該 Google 頁面不會啟動 automation bridge 或 permission shim；相鄰路徑、仿冒 host、非 HTTPS 與跨 provider 使用仍會拒絕。
- Grok Cloudflare and hCaptcha pages likewise keep the bridge deferred. Known challenge titles are surfaced through Tauri's native title observer, providing a clear blocked state without attempting to bypass the challenge.
- Grok 的 Cloudflare／hCaptcha 頁面同樣會延後 bridge；已知驗證標題由 Tauri 原生 title observer 顯示清楚的阻擋狀態，但不嘗試繞過驗證。

## Expanded real-page focus / 放大真實頁面

- A temporary Expand/Restore control lets the focused provider WebView reclaim the workflow shelf, process trace, and connection-strip space for easier reading.
- 新增暫時性的「放大／還原」，讓聚焦中的 provider WebView 可使用 workflow shelf、流程追蹤與連線區原本占用的空間。
- Expansion is deliberately not persisted. Checkpoint cards and timeout decisions automatically restore the controls, so an actionable prompt cannot remain hidden.
- 放大狀態刻意不保存；checkpoint 卡片或逾時決策出現時會自動恢復控制區，避免需要操作的提示被隱藏。

## Contributors / 貢獻者

- Thank you to [Dave Tseng (`@DaveTseng2019`)](https://github.com/DaveTseng2019) for the original Grok challenge-state repair in [#39](https://github.com/teddashh/multi-ai-chat-desktop/pull/39) and the expanded focus-stage proposal and implementation in [#40](https://github.com/teddashh/multi-ai-chat-desktop/pull/40).
- 感謝 [Dave Tseng（`@DaveTseng2019`）](https://github.com/DaveTseng2019) 透過 [#39](https://github.com/teddashh/multi-ai-chat-desktop/pull/39) 提出 Grok 驗證狀態修正，並在 [#40](https://github.com/teddashh/multi-ai-chat-desktop/pull/40) 提案與實作放大 focus stage。
- Thank you to [CE Lin (`@ChingEnLin`)](https://github.com/ChingEnLin) for the reproducible provider-status report in [#41](https://github.com/teddashh/multi-ai-chat-desktop/issues/41) and the ChatGPT, Gemini, and Grok repair contributed through [#42](https://github.com/teddashh/multi-ai-chat-desktop/pull/42).
- 感謝 [CE Lin（`@ChingEnLin`）](https://github.com/ChingEnLin) 在 [#41](https://github.com/teddashh/multi-ai-chat-desktop/issues/41) 提供可重現的 provider 狀態回報，並透過 [#42](https://github.com/teddashh/multi-ai-chat-desktop/pull/42) 貢獻 ChatGPT、Gemini 與 Grok 修正。

## Validation / 驗證

- The release candidate passes 425 frontend tests across 51 files, 21 Agent contract tests, TypeScript type-checking, ESLint, adapter schema/seed checks, and production injected-script builds.
- Release candidate 通過 51 個檔案共 425 個 frontend tests、21 個 Agent contract tests、TypeScript type-check、ESLint、adapter schema／seed checks 與 production injected-script build。
- It also passes 60 Rust tests, `cargo fmt --check`, warnings-denied Clippy, and pull-request CI on Windows, macOS, and Linux.
- 同時通過 60 個 Rust tests、`cargo fmt --check`、warnings-denied Clippy，以及 Windows、macOS、Linux 的 pull-request CI。
- The immutable `v1.6.4` tag rebuilds the Windows installer and portable zip, Apple Silicon DMG, and Linux AppImage before the draft release is reviewed.
- Immutable `v1.6.4` tag 會重新建置 Windows installer／portable zip、Apple Silicon DMG 與 Linux AppImage，完成後再檢查 Draft Release。

## Downloads / 下載

- Windows x64 installer and portable zip
- Apple Silicon macOS DMG
- Linux x86_64 AppImage

## Notes / 注意事項

- Windows artifacts remain unsigned and may trigger SmartScreen.
- Windows 產物仍未簽章，可能觸發 SmartScreen。
- The macOS package is ad-hoc signed and signature-verified in CI, but is not Apple-notarized; follow the README first-launch steps if Gatekeeper blocks it.
- macOS package 使用 ad-hoc 簽章並由 CI 驗證，但尚未 Apple notarize；若 Gatekeeper 阻擋，請依 README 的首次啟動步驟操作。
- Provider security challenges remain third-party behavior. The app surfaces and defers them; it does not bypass login, challenge, age, subscription, or provider policy requirements.
- Provider 安全驗證仍屬第三方行為；app 只會顯示並延後自動化，不會繞過登入、驗證、年齡、訂閱或 provider 政策要求。
- The current Tauri/Wry Linux GTK3 dependency graph retains the documented medium-severity `glib::VariantStrIter` advisory. The app does not directly call the affected API, and the compatible upstream graph does not yet provide the newer `glib` line.
- 目前 Tauri／Wry 的 Linux GTK3 dependency graph 仍有已記錄的 medium-severity `glib::VariantStrIter` advisory；本 app 未直接呼叫受影響 API，而相容的上游 graph 尚未提供新版 `glib` line。
- Linux remains CI-packaged without a new maintainer-owned real-device launch report. Live completion of Gemini and Grok challenge pages also remains dependent on provider, account, network, and platform behavior.
- Linux 仍由 CI 封裝，沒有 maintainer 自有實機的最新啟動回報；Gemini 與 Grok 驗證頁能否完成，也仍取決於 provider、帳號、網路與平台行為。

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.6.3...v1.6.4
