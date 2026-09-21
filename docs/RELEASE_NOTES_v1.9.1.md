# v1.9.1 — Grok Heavy resume timers

## Provider-compatibility patch / Provider 相容性補丁

Multi-AI Chat Desktop `v1.9.1` is a focused provider-compatibility patch on the v1.9.0 line. It cancels stale Grok quiet timers when Heavy restores its stop control and continues generating without changing the intermediate answer.

Multi-AI Chat Desktop `v1.9.1` 是 v1.9.0 線上的 provider 相容性補丁。當 Heavy 恢復 stop 控制並繼續生成、但中間答案文字沒變時，會取消過期的 Grok 靜默計時器。

## Grok resume / Grok 恢復生成

- If Grok's live stop control reappears after a quiet stretch and the intermediate text is unchanged, both the text-stability timer and the post-generation timer are cancelled. The app waits for generation to stop again before emitting `RESPONSE_DONE`.
- 若 Grok 的即時 stop 控制在靜默一段後再出現、且中間文字沒變，文字穩定計時器與生成結束計時器都會取消。App 會再等生成真正停止，才送出 `RESPONSE_DONE`。
- Automated regressions cover backup-poll and MutationObserver paths, including two resume cycles with unchanged text.
- 自動回歸涵蓋 backup poll 與 MutationObserver 兩條路徑，包括文字不變時連續兩次恢復生成。

This lands the leftover from [#97](https://github.com/teddashh/multi-ai-chat-desktop/pull/97) via [#98](https://github.com/teddashh/multi-ai-chat-desktop/pull/98). It does not replace the v1.8.9 Heavy/Astra terminal-handoff work.

這透過 [#98](https://github.com/teddashh/multi-ai-chat-desktop/pull/98) 收合 [#97](https://github.com/teddashh/multi-ai-chat-desktop/pull/97) 留下的修正。它不取代 v1.8.9 的 Heavy／Astra 終端交接工作。

## Also in this line / 本線仍包含

- Optional experimental Meta AI standby from [v1.9.0](RELEASE_NOTES_v1.9.0.md): five catalog choices, exactly four active.
- v1.9.0 的實驗性可選 Meta AI 備用：五家可選、同時只啟用四家。詳見 [v1.9.0 發布說明](RELEASE_NOTES_v1.9.0.md)。

## Verification / 驗證

- Local `pnpm verify` on the rebased engine fix: 730 Vitest tests across 62 files, 22 agent tests, TypeScript, ESLint, injected build, and adapter validation passed.
- 本機 `pnpm verify` 通過：62 個檔案／730 項 Vitest、22 項 agent tests、型別／lint／injected build／adapter 驗證。
- GitHub CI on [#98](https://github.com/teddashh/multi-ai-chat-desktop/pull/98) and the following `main` push: frontend, three-platform Clippy, and CodeQL passed.
- [#98](https://github.com/teddashh/multi-ai-chat-desktop/pull/98) 與後續 `main` CI：frontend、三平台 Clippy、CodeQL 通過。
- **No new authenticated Meta, Grok Heavy ↔ ChatGPT Astra, or VM smoke was run for v1.9.1.**
- **v1.9.1 沒有新增已登入的 Meta、Grok Heavy ↔ ChatGPT Astra，或 VM smoke。**

## Downloads / 下載

- Windows x64 installer and portable zip
- Apple Silicon macOS DMG
- Linux x86_64 AppImage

## Notes / 注意事項

- Windows artifacts remain unsigned and may trigger SmartScreen. macOS is ad-hoc signed, not notarized. Linux remains CI-packaged without a new maintainer real-device launch report.
- Windows 產物仍未簽章，可能觸發 SmartScreen。macOS 為 ad-hoc 簽章、未 notarize。Linux 仍由 CI 封裝，沒有新的 maintainer 實機啟動回報。
- A real-account ChatGPT↔Grok slow handoff, the Grok Cloudflare challenge path, and a new Apple Silicon launch/provider-login smoke were not manually repeated.
- 真實帳號的 ChatGPT↔Grok 慢速接力、Grok Cloudflare challenge，以及新的 Apple Silicon 啟動與 provider 登入 smoke 都沒有人工重做。

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.9.0...v1.9.1
