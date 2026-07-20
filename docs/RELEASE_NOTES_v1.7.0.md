# v1.7.0 — Configurable collaboration roles and resilient workflows

## Stable release / 正式版本

Multi-AI Chat Desktop `v1.7.0` makes structured collaboration easier to start and safer to finish. Users can assign providers to workflow roles, consecutive sends recover from provider-page timing races, and unrecoverable provider errors stop cleanly instead of contaminating later prompts.

Multi-AI Chat Desktop `v1.7.0` 讓結構化協作更容易開始，也更安全地結束。使用者可以指定 workflow 角色的 provider；連續送出會處理 provider 網頁的 timing race；無法恢復的 provider 錯誤會乾淨停止，不再污染後續 prompt。

## Configurable collaboration roles / 可自訂協作角色

- Settings now exposes the role assignment for Debate, Consult, Coding, Roundtable, and Brainstorm. The selected roles drive readiness badges, preflight, execution, snapshots, replay, and transcript labels consistently.
- 「設定」現在可調整四方辯證、多方諮詢、Coding、道理辯證與腦力激盪的角色配置；選定角色會一致套用於就緒狀態、preflight、執行、snapshot、replay 與逐字稿標籤。
- Serial roles may reuse one provider. Roles that execute in parallel still reject a collision before turn one.
- 依序執行的角色可以重複使用同一家 provider；同時執行的角色若重複，仍會在第一步前拒絕啟動。

## Resilient provider handoff / 穩定的 provider 交接

- After a provider session resets, the workflow now waits for that provider to become sendable again instead of treating reset completion as composer readiness.
- Provider session 重設後，workflow 會等待該 provider 真正恢復可送出，不再把 reset 完成誤認為 composer 已就緒。
- If a provider rejects the first send immediately after a previous response, the workflow waits briefly and retries once. The retry remains bounded and cancellation-aware.
- 若 provider 在前一則回答剛完成時拒絕下一次送出，workflow 會短暫等待並只重試一次；重試有明確上限，也能被取消。
- Remaining engine errors terminate the structured run, stop unfinished parallel siblings, and never become untrusted “answers” in downstream prompts.
- 其餘引擎錯誤會終止結構化流程、停止尚未完成的平行工作，也不會成為後續 prompt 裡的不可信「回答」。

## Grok-safe defaults and honest guidance / 避開 Grok 阻擋的預設與誠實指引

- Grok security challenges can block embedded login on some platforms and networks. Default structured roles therefore use ChatGPT, Claude, and Gemini so every guided workflow can start with three working logins.
- Grok 的安全驗證在部分平台或網路可能阻擋嵌入式登入；因此結構化角色預設使用 ChatGPT、Claude、Gemini，讓所有引導流程可由三個可用登入直接開始。
- Grok remains available in the provider dock, Free mode, and manual role assignment. The app does not bypass login or provider-controlled security challenges.
- Grok 仍保留在 provider dock、自由模式與手動角色配置中；app 不會繞過登入或 provider 控制的安全驗證。
- Roundtable and Brainstorm retain four seats. Brainstorm gives the four seats distinct creative lenses even when one provider fills two seats, preserving 48 contributions across 12 rounds.
- 道理辯證與腦力激盪仍保留四個席位；即使同一 provider 擔任兩席，腦力激盪的四席仍使用不同創作視角，維持 12 輪共 48 次發言。
- External-browser fallback copy now states that it cannot authenticate the app's isolated WebView session.
- 外部瀏覽器備援文案現在明確說明：它無法替 app 內隔離的 WebView session 完成登入。

## Contributors / 貢獻者

- Thank you to [Dave Tseng (`@DaveTseng2019`)](https://github.com/DaveTseng2019) for the session-reset readiness repair in [#44](https://github.com/teddashh/multi-ai-chat-desktop/pull/44), the clearer blocked-login guidance in [#48](https://github.com/teddashh/multi-ai-chat-desktop/pull/48), and the Grok-safe default role proposal and implementation in [#49](https://github.com/teddashh/multi-ai-chat-desktop/pull/49).
- 感謝 [Dave Tseng（`@DaveTseng2019`）](https://github.com/DaveTseng2019) 透過 [#44](https://github.com/teddashh/multi-ai-chat-desktop/pull/44) 修正 session reset 後的就緒判斷、透過 [#48](https://github.com/teddashh/multi-ai-chat-desktop/pull/48) 改善登入阻擋說明，並在 [#49](https://github.com/teddashh/multi-ai-chat-desktop/pull/49) 提案與實作避開 Grok 阻擋的預設角色。
- Thank you to [CE Lin (`@ChingEnLin`)](https://github.com/ChingEnLin) for designing and implementing configurable structured-mode role assignments in [#46](https://github.com/teddashh/multi-ai-chat-desktop/pull/46).
- 感謝 [CE Lin（`@ChingEnLin`）](https://github.com/ChingEnLin) 透過 [#46](https://github.com/teddashh/multi-ai-chat-desktop/pull/46) 設計並實作結構化模式的可自訂角色配置。

## Validation / 驗證

- The release candidate passes 439 frontend tests across 52 files, 21 Agent contract tests, TypeScript type-checking, ESLint, adapter schema/seed checks, and production injected-script builds.
- Release candidate 通過 52 個檔案共 439 個 frontend tests、21 個 Agent contract tests、TypeScript type-check、ESLint、adapter schema／seed checks 與 production injected-script build。
- It also passes 60 Rust tests, `cargo fmt --check`, warnings-denied Clippy, and pull-request CI on Windows, macOS, and Linux.
- 同時通過 60 個 Rust tests、`cargo fmt --check`、warnings-denied Clippy，以及 Windows、macOS、Linux 的 pull-request CI。
- The immutable `v1.7.0` tag rebuilds the Windows installer and portable zip, Apple Silicon DMG, and Linux AppImage before the draft release is reviewed.
- Immutable `v1.7.0` tag 會重新建置 Windows installer／portable zip、Apple Silicon DMG 與 Linux AppImage，完成後再檢查 Draft Release。

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

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.6.4...v1.7.0
