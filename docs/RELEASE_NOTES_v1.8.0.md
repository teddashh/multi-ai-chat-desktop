# v1.8.0 — Focused transcript reading and safer provider views

## Stable release / 正式版本

Multi-AI Chat Desktop `v1.8.0` makes long multi-provider conversations easier to read without weakening the native WebView lifecycle. The transcript can fill the window, provider chips follow the answer at the reading line, and every route into a provider login page now restores the provider workspace before showing the native page.

Multi-AI Chat Desktop `v1.8.0` 讓長篇多 provider 對話更容易閱讀，同時強化原生 WebView 的生命週期管理。逐字稿可填滿整個視窗，provider chip 會跟隨閱讀線目前所在的回答，而所有進入 provider 登入頁的路徑都會先還原 provider 工作區，再顯示原生頁面。

## Full-width focused reading / 全寬專注閱讀

- A new header control maximizes and restores the conversation workspace without interrupting the running workflow.
- 標題列新增對話工作區放大／還原控制，不會中斷執行中的 workflow。
- Maximized mode fully hides and isolates the provider sidebar and resizer, preventing invisible controls from intercepting pointer or keyboard input.
- 放大模式會完整隱藏並隔離 provider 側欄與 resizer，避免不可見控制項攔截滑鼠或鍵盤操作。
- The transcript and composer use the available window width, while restoring returns to the previous provider-focused layout.
- 逐字稿與輸入區會使用可用的完整視窗寬度；還原後則回到原本的 provider 專注版面。

## Scroll-linked provider context / 隨捲動更新的 provider 脈絡

- Provider chips now identify whose response is at the transcript reading line.
- Provider chip 現在會標示逐字稿閱讀線目前所在的回答者。
- A resize observer recalculates the active answer after window resizing, panel resizing, font changes, or text reflow.
- 視窗、panel、字型或文字重排變動後，resize observer 會重新計算目前回答。
- The lookup uses a bounded binary search and does not preselect a provider before the first provider response reaches the reading line.
- 查找使用有界 binary search；第一則 provider 回答到達閱讀線前，不會預先錯誤標示 provider。
- Current-reading labels are available to assistive technology in English, Traditional Chinese, Japanese, and German.
- 目前閱讀中的標籤已為 English、繁體中文、日本語與 Deutsch 補上輔助科技可讀文字。

## Safer native provider transitions / 更安全的原生 provider 切換

- Login actions from normal use, preflight, and replay now share one routed callback that exits transcript-maximized mode and restores the provider workspace before showing the WebView.
- 一般操作、preflight 與 replay 的登入動作現在共用同一個 routed callback；顯示 WebView 前會先離開逐字稿放大模式並還原 provider 工作區。
- Overlay restoration reconciles the latest selected provider instead of reopening a stale provider captured before automatic focus changes.
- Overlay 還原會依最新選取的 provider 重新對齊，不再開啟自動切換焦點前記錄的舊 provider。
- These guards prevent a native provider surface from unexpectedly covering the transcript after login, replay, or focus changes.
- 這些 guard 可避免登入、replay 或焦點切換後，原生 provider surface 意外蓋住逐字稿。

## Contributors / 貢獻者

- Thank you to [Dave Tseng (`@DaveTseng2019`)](https://github.com/DaveTseng2019) for proposing and implementing the transcript maximize control and scroll-linked provider focus in [#51](https://github.com/teddashh/multi-ai-chat-desktop/pull/51), then collaborating on the lifecycle, accessibility, and performance hardening included in this release.
- 感謝 [Dave Tseng（`@DaveTseng2019`）](https://github.com/DaveTseng2019) 在 [#51](https://github.com/teddashh/multi-ai-chat-desktop/pull/51) 提案並實作逐字稿放大控制與隨捲動更新的 provider 焦點，也一起完成本版所需的生命週期、可及性與效能強化。

## Validation / 驗證

- The release candidate passes 444 frontend tests across 52 files, 21 Agent contract tests, TypeScript type-checking, ESLint, adapter schema/seed checks, and production injected-script builds.
- Release candidate 通過 52 個檔案共 444 個 frontend tests、21 個 Agent contract tests、TypeScript type-check、ESLint、adapter schema／seed checks 與 production injected-script build。
- It also passes 60 Rust tests, `cargo fmt --check`, warnings-denied Clippy, and pull-request CI on Windows, macOS, and Linux.
- 同時通過 60 個 Rust tests、`cargo fmt --check`、warnings-denied Clippy，以及 Windows、macOS、Linux 的 pull-request CI。
- The immutable `v1.8.0` tag rebuilds the Windows installer and portable zip, Apple Silicon DMG, and Linux AppImage before the draft release is reviewed.
- Immutable `v1.8.0` tag 會重新建置 Windows installer／portable zip、Apple Silicon DMG 與 Linux AppImage，完成後再檢查 Draft Release。

## Downloads / 下載

- Windows x64 installer and portable zip
- Apple Silicon macOS DMG
- Linux x86_64 AppImage

## Notes / 注意事項

- Windows artifacts remain unsigned and may trigger SmartScreen.
- Windows 產物仍未簽章，可能觸發 SmartScreen。
- The macOS package is ad-hoc signed and signature-verified in CI, but is not Apple-notarized; follow the README first-launch steps if Gatekeeper blocks it.
- macOS package 使用 ad-hoc 簽章並由 CI 驗證，但尚未 Apple notarize；若 Gatekeeper 阻擋，請依 README 的首次啟動步驟操作。
- Provider pages, login flows, and security challenges are third-party behavior and can change without notice. Grok is optional in the safe defaults because successful embedded challenge completion cannot be guaranteed.
- Provider 網頁、登入流程與安全驗證屬第三方行為，可能隨時變動；由於無法保證嵌入式 Grok 驗證一定完成，安全預設將 Grok 保留為選用。
- The current Tauri/Wry Linux GTK3 dependency graph retains the documented medium-severity `glib::VariantStrIter` advisory. The app does not directly call the affected API, and the compatible upstream graph does not yet provide the newer `glib` line.
- 目前 Tauri／Wry 的 Linux GTK3 dependency graph 仍有已記錄的 medium-severity `glib::VariantStrIter` advisory；本 app 未直接呼叫受影響 API，而相容的上游 graph 尚未提供新版 `glib` line。
- Linux remains CI-packaged without a new maintainer-owned real-device launch report.
- Linux 仍由 CI 封裝，沒有 maintainer 自有實機的最新啟動回報。

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.7.0...v1.8.0
