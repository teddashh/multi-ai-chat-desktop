# v1.9.0 — Optional experimental Meta AI standby

## Stable release / 正式版本

Multi-AI Chat Desktop `v1.9.0` ships five provider choices with **exactly four active**. ChatGPT, Claude, Gemini, and Grok remain the default. Meta AI is an experimental optional standby in Settings.

Multi-AI Chat Desktop `v1.9.0` 提供五家可選、**同時只啟用四家**。ChatGPT、Claude、Gemini、Grok 仍是預設；Meta AI 是 Settings 裡實驗性的可選備用。

## Optional Meta AI / 實驗性 Meta AI

- Settings can swap Meta AI with exactly one default provider. Local profiles stay; roles and free-mode targets repair to the active four. No workflow grows a fifth seat.
- Settings 可用 Meta AI 替換恰好一家預設 provider。本機 profile 會保留；角色與自由分送 targets 會修到目前啟用的四家。Workflow 不會變成五席。
- Meta AI has its own portrait. Event log and debug bundle label it **Meta AI** without storing prompts or replies.
- Meta AI 有獨立 portrait。Event log 與 debug bundle 會標成 **Meta AI**，不儲存 prompt 或回覆。
- Guest or email/mobile access depends on what Meta's site currently offers. Facebook and Instagram sign-in are not embedded.
- 訪客或 Email／手機登入取決於 Meta 網站目前提供的方式。Facebook 與 Instagram 登入不支援內嵌。

## Recovery and preflight / 恢復與預檢

- Login, reload, report, and replay errors can be retried. Duplicate and stale clicks are ignored.
- Login、reload、report、replay 失敗可以重試；重複或過期點擊會被忽略。
- Workflows preflight the current four even if a standby still looks Ready. Debate seats cover Meta when it is active.
- 即使備用仍顯示 Ready，workflow 也只檢查目前四家。Meta 啟用時 Debate 席位會涵蓋它。
- Standby errors lead to Settings. Saving a lineup is protected from overlapping autosave or Close actions; malformed replay providers are rejected instead of replaced.
- 備用狀態提供「設定」入口；切換儲存不受 autosave／關閉交錯覆寫，無效的 replay provider 會明確拒絕。
- Meta readiness and submission require a visible, editable composer, including a fresh check before sending.
- Meta 就緒與送出前都會確認輸入框可見且可編輯。

## Verification / 驗證

- Local `pnpm verify`: 724 Vitest tests across 62 files, 22 agent tests, TypeScript, ESLint, injected build, and adapter validation passed. Frontend production build passed.
- 本機 `pnpm verify` 通過：62 個檔案／724 項 Vitest、22 項 agent tests、型別／lint／injected build／adapter 驗證；前端正式建置通過。
- Automated coverage includes Meta replacing each default provider in Debate, Consult, Coding, Roundtable, and Brainstorm, plus snapshot/replay and standby recovery.
- 自動測試涵蓋 Meta 替換原四家各席位的 Debate、Consult、Coding、Roundtable、Brainstorm，以及 snapshot／replay 與備用狀態恢復。
- **No new authenticated Meta or VM smoke was run for v1.9.0.**
- **v1.9.0 沒有新增已登入的 Meta 或 VM smoke。**
- Prior evidence is unchanged: Windows packaged launch; an earlier Apple Silicon report that opened the app and logged into ChatGPT, Claude, and Gemini while Grok remained on Cloudflare; Linux CI-only packaging. Earlier no-login standby checks exist; they are not authenticated Meta send/receive.
- 先前證據不變：Windows packaged launch；較早的 Apple Silicon 回報能開啟 app 並登入 ChatGPT、Claude、Gemini，但 Grok 卡在 Cloudflare；Linux 僅 CI packaging。先前有未登入的 standby 檢查，那不是已登入的 Meta 送收。

## Downloads / 下載

- Windows x64 installer and portable zip
- Apple Silicon macOS DMG
- Linux x86_64 AppImage

## Notes / 注意事項

- Windows artifacts remain unsigned and may trigger SmartScreen. macOS is ad-hoc signed, not notarized. Linux remains CI-packaged without a new maintainer real-device launch report.
- Windows 產物仍未簽章，可能觸發 SmartScreen。macOS 為 ad-hoc 簽章、未 notarize。Linux 仍由 CI 封裝，沒有新的 maintainer 實機啟動回報。
- A real-account ChatGPT↔Grok slow handoff, the Grok Cloudflare challenge path, and a new Apple Silicon launch/provider-login smoke were not manually repeated.
- 真實帳號的 ChatGPT↔Grok 慢速接力、Grok Cloudflare challenge，以及新的 Apple Silicon 啟動與 provider 登入 smoke 都沒有人工重做。
- Meta AI does not bypass login, regional availability, rate limits, or later provider-side gates.
- Meta AI 不會繞過登入、區域、用量或後續 provider 端限制。

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.8.9...v1.9.0
