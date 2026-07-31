# v1.8.4 — Complete responses and bounded Grok login recovery

## Provider-compatibility maintenance / Provider 相容性維護

Multi-AI Chat Desktop `v1.8.4` is a focused provider-compatibility and release-correctness update. It preserves complete final answers, safely recovers a blocked Grok pane after an in-app authentication popup closes, keeps challenge guidance provider-specific, and corrects the portable update instructions.

Multi-AI Chat Desktop `v1.8.4` 是聚焦於 provider 相容性與 release 正確性的維護更新。本版會保留完整最終回答、在 app 內驗證 popup 關閉後安全恢復 blocked 的 Grok pane、依 provider 顯示正確的 challenge 指引，並修正 portable 版本的更新說明。

## Complete final answers / 完整最終回答

- The finish-time DOM read is authoritative even when a provider revises or shortens its streamed draft. The streamed cache is used only if the final response node is absent.
- 即使 provider 在串流結束時修改或縮短草稿，完成當下重新讀取的 DOM 仍是最終依據；只有最終 response node 已消失時才回退到串流 cache。
- Code-block restoration uses a replacement function, so literal JavaScript replacement patterns such as `$&`, ``$` ``, and `$'` remain unchanged.
- Code block 還原改用 replacement function，因此 `$&`、``$` ``、`$'` 等 JavaScript replacement pattern 會保持原樣。
- ChatGPT waits for the last turn's positive copy-action marker. Missing upstream completion markup can no longer turn a partial answer into a successful result: text changes and active thinking extend the wait, while ten minutes without completion activity ends with an explicit error.
- ChatGPT 會等待最後一個 turn 的正向 copy-action marker。上游 completion markup 缺失時，不會再把殘缺內容當成成功結果；文字更新與持續 thinking 會延長等待，十分鐘沒有 completion activity 才以明確錯誤結束。

## Bounded Grok authentication recovery / 有界的 Grok 驗證恢復

- When an allowlisted Grok authentication popup closes, the host waits briefly for profile/session storage to settle, then considers one native reload only if the same Grok document is still loaded and blocked.
- 允許的 Grok 驗證 popup 關閉後，host 會短暫等待 profile／session storage 寫入，再只於同一份 Grok document 仍為 loaded／blocked 時考慮一次原生 reload。
- Cloudflare challenge popups are excluded. Recovery does not evaluate JavaScript in the blocked document, install the bridge early, relax URL scopes, or bypass the provider's challenge.
- Cloudflare challenge popup 不在此恢復路徑內；blocked document 不會執行 JavaScript、不會提早安裝 bridge、不會放寬 URL scope，也不會繞過 provider challenge。
- Popup recovery, manual reload, new-session navigation, page-load start, and close share single-owner epoch coordination. Manual lifecycle actions may supersede an unclaimed recovery; a claimed recovery blocks duplicates.
- Popup recovery、手動 reload、new-session navigation、page-load start 與 close 共用單一 owner 的 epoch 協調。手動 lifecycle action 可接管尚未 claim 的 recovery；已 claim 的 recovery 則會擋下重複操作。
- A bounded navigation-start lease rolls back the exact owner/epoch if Tauri accepts a reload request but WebView2 never reports page-load start. Stale timers cannot cancel a newer document.
- 若 Tauri 接受 reload request、但 WebView2 始終沒有回報 page-load start，有界的 navigation-start lease 會 rollback 完全相符的 owner／epoch；舊 timer 不會取消較新的 document。

This addresses the actionable readiness problem reported in [#59](https://github.com/teddashh/multi-ai-chat-desktop/issues/59). Live Windows verification of popup-close-to-Ready behavior remains a release smoke requirement.

這處理了 [#59](https://github.com/teddashh/multi-ai-chat-desktop/issues/59) 回報的 readiness 問題；popup 關閉後能否在 Windows 實機轉為 Ready，仍是 release smoke 的必要項目。

## Accurate guidance and packaging / 正確指引與封裝

- Grok's blocked banner now explains that its solvable security check should be completed in the provider pane. Gemini keeps separate browser guidance because the bounded Google `/sorry` path cannot be completed in the same way.
- Grok 的 blocked banner 現在會說明可在 provider pane 內完成安全驗證；Gemini 則保留獨立的 browser 指引，因為有界的 Google `/sorry` path 不能用相同方式處理。
- The generated portable README no longer points to update controls that portable mode hides. It links directly to the repository's latest GitHub Release.
- 產生的 portable README 不再指向 portable mode 會隱藏的更新控制，而是直接連到 repo 的最新 GitHub Release。

## Contributors / 貢獻者

- Thanks to [@DaveTseng2019](https://github.com/DaveTseng2019) for [#60](https://github.com/teddashh/multi-ai-chat-desktop/pull/60), [#61](https://github.com/teddashh/multi-ai-chat-desktop/pull/61), and the live findings in [#59](https://github.com/teddashh/multi-ai-chat-desktop/issues/59). The release branch preserves the contributed commits and adds maintainer hardening for provider-specific guidance, final-DOM authority, fail-closed completion, and native lifecycle races.
- 感謝 [@DaveTseng2019](https://github.com/DaveTseng2019) 提交 [#60](https://github.com/teddashh/multi-ai-chat-desktop/pull/60)、[#61](https://github.com/teddashh/multi-ai-chat-desktop/pull/61)，以及在 [#59](https://github.com/teddashh/multi-ai-chat-desktop/issues/59) 提供實機結果。Release branch 保留原始貢獻 commits，並加入 provider 專屬指引、final-DOM authority、fail-closed completion 與原生 lifecycle race 的 maintainer hardening。

## Validation / 驗證

- 473 frontend tests across 54 files, including long-thinking completion, selector drift, final DOM revision, `$` replacement patterns, localized banner routing, and portable instructions.
- 54 個檔案共 473 個 frontend tests，涵蓋長時間 thinking、selector drift、最終 DOM revision、`$` replacement pattern、多語 banner 分流與 portable 說明。
- 22 Agent-ready source-contract tests, TypeScript type-checking, ESLint, adapter schema/seed checks, production injected-script build, production frontend build, and a zero-write launch dry-run.
- 22 個 Agent-ready source-contract tests、TypeScript type-check、ESLint、adapter schema／seed checks、production injected-script build、production frontend build，以及 zero-write launch dry-run。
- 81 Rust tests, `cargo fmt --check`, and warnings-denied Clippy. Tests cover auth-host selection, same-document gating, single-owner reservation, manual supersession, zero-eval gating, reload-failure rollback, close invalidation, and stale navigation leases.
- 81 個 Rust tests、`cargo fmt --check` 與 warnings-denied Clippy；測試涵蓋 auth-host selection、same-document gate、single-owner reservation、manual supersession、zero-eval gate、reload-failure rollback、close invalidation 與 stale navigation lease。
- `pnpm audit --audit-level=low` reports no known JavaScript dependency vulnerabilities.
- `pnpm audit --audit-level=low` 未發現已知的 JavaScript dependency 漏洞。
- The immutable `v1.8.4` tag rebuilds the Windows installer and portable zip, Apple Silicon DMG, and Linux AppImage into a draft GitHub Release for artifact review.
- Immutable `v1.8.4` tag 會把 Windows installer／portable zip、Apple Silicon DMG 與 Linux AppImage 重新建置到 Draft GitHub Release，供 artifact review。

## Downloads / 下載

- Windows x64 installer and portable zip
- Apple Silicon macOS DMG
- Linux x86_64 AppImage

## Release gate and known limits / 發布門檻與已知限制

- Before publication, Windows must verify the packaged artifacts and the live Grok path from authentication-popup close through automatic reload to Ready.
- 正式發布前，Windows 必須驗證 packaged artifacts，以及 Grok 從 authentication popup 關閉、automatic reload 到 Ready 的完整實機路徑。
- Apple Silicon still requires first launch plus login checks for ChatGPT, Claude, Gemini, and Grok, especially confirmation that Grok leaves Cloudflare verification. CI packaging is not end-user launch evidence.
- Apple Silicon 仍需完成首次啟動與 ChatGPT、Claude、Gemini、Grok 登入檢查，尤其要確認 Grok 能離開 Cloudflare 驗證；CI packaging 不等於 end-user launch 證據。
- Windows artifacts remain unsigned and may trigger SmartScreen. The macOS package is ad-hoc signed and signature-verified in CI, but is not notarized. Linux remains CI-only without a new maintainer real-device report.
- Windows artifacts 仍未簽章，可能觸發 SmartScreen。macOS package 使用 ad-hoc 簽章並由 CI 驗證，但尚未 notarize。Linux 仍只有 CI 證據，沒有新的 maintainer 實機報告。
- The GitHub Release remains a draft until these manual gates are satisfied or the maintainer explicitly accepts the remaining risk.
- 在完成這些人工 gate、或 maintainer 明確接受剩餘風險前，GitHub Release 會保持 Draft。

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.8.3...v1.8.4
