# v1.6.0 — Brainstorm and accessibility

## Stable feature release / 正式功能版本

Multi-AI Chat Desktop `v1.6.0` completes the feature-frozen product with a dedicated Brainstorm preset and a focused large-text layout fix. Brainstorm is a sixth guided preset built on the proven Free fan-out graph, not a sixth workflow engine. The five stable engines and the local-first privacy model remain unchanged.

Multi-AI Chat Desktop `v1.6.0` 以專用腦力激盪預設與聚焦的大字體版面修正，完成 feature-frozen 產品。Brainstorm 是建立在既有自由分送 fan-out graph 上的第六個引導預設，不是第六套 workflow 引擎；五套穩定引擎與 local-first 隱私模型皆維持不變。

## Brainstorm preset / 腦力激盪預設

- ChatGPT, Claude, Gemini, and Grok receive complementary creative lenses so parallel answers explore distinct directions instead of repeating the same generic prompt.
- ChatGPT、Claude、Gemini 與 Grok 會收到互補的創意視角，讓平行回答探索不同方向，而不是重複同一份通用 prompt。
- All four providers are selected by default; providers that are unavailable or not ready are still filtered by the existing sendability rules.
- 預設選取四家 provider；無法使用或尚未就緒者仍會依既有 sendability 規則排除。
- The preset identity and provider-specific instructions survive local session restore, snapshots, replay, and Markdown export.
- 本機 session 還原、snapshot、replay 與 Markdown 匯出都會保留 preset 身分及 provider 專屬指示。
- Existing Free-mode behavior remains unchanged because Brainstorm compiles to the same stable parallel graph with different prompt metadata.
- 既有自由模式行為不變；Brainstorm 只是以不同 prompt metadata 編譯到同一套穩定平行 graph。

## Accessibility and layout / 無障礙與版面

- The provider connection strip remains reachable when users choose very large text or run the app in a short window.
- 使用者採用超大字體或較矮視窗時，仍可捲動到 provider 連線區。
- Native provider WebView bounds now follow scroll changes through a `requestAnimationFrame`-throttled update, preserving alignment without flooding native reposition calls.
- 原生 provider WebView 的邊界會透過 `requestAnimationFrame` 節流更新跟隨捲動，保持對齊且不會大量觸發 native reposition。
- Regression coverage protects both the reachable connection strip and the focused-WebView alignment behavior.
- Regression tests 同時保護連線區可達性與聚焦 WebView 對齊行為。

## Contributor thanks / 貢獻者致謝

Thanks to Dave Tseng ([`@DaveTseng2019`](https://github.com/DaveTseng2019)) for reporting and implementing the large-font connection-strip fix in [PR #25](https://github.com/teddashh/multi-ai-chat-desktop/pull/25), including the WebView synchronization improvement and regression tests.

感謝 Dave Tseng（[`@DaveTseng2019`](https://github.com/DaveTseng2019)）在 [PR #25](https://github.com/teddashh/multi-ai-chat-desktop/pull/25) 回報並實作大字體連線區修正，也一併改善 WebView 同步並補上 regression tests。

## Validation / 驗證

- The release branch passes 394 frontend tests, 21 Agent contract tests, TypeScript type-checking, ESLint, adapter checks, npm audit, 52 Rust tests, and warnings-denied Clippy.
- Release branch 通過 394 個 frontend tests、21 個 Agent contract tests、TypeScript type-check、ESLint、adapter checks、npm audit、52 個 Rust tests，以及 warnings-denied Clippy。
- Pull-request CI validates warnings-denied Clippy on Windows, macOS, and Linux before the release tag is created.
- 建立 release tag 前，pull-request CI 會在 Windows、macOS 與 Linux 驗證 warnings-denied Clippy。
- The immutable `v1.6.0` tag rebuilds the Windows installer and portable zip, Apple Silicon DMG, and Linux AppImage before the release is published.
- Immutable `v1.6.0` tag 會重新建置 Windows installer／portable zip、Apple Silicon DMG 與 Linux AppImage；全部產物完成後才發布正式版本。

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

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.5.1...v1.6.0
