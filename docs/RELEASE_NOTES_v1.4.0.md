# v1.4.0 — Conversation continuity and answer fidelity

## Stable maintenance release / 正式維護版本

Multi-AI Chat Desktop `v1.4.0` makes restored conversations genuinely continuous, preserves more of each provider's answer structure, stops transcript streaming from moving the whole app, and hardens local session persistence. ChatGPT adapter v5 also repairs stale or mismatched editor drafts before sending.

Multi-AI Chat Desktop `v1.4.0` 讓恢復後的對話能真正延續、保留更多 provider 回答結構、避免串流文字帶動整個 app 捲動，並強化本機 session 儲存。ChatGPT adapter v5 也會在送出前修復殘留或不一致的編輯器草稿。

## Highlights / 更新重點

- Restored sessions replay one bounded, same-session transcript on the first follow-up; new conversations remain isolated.
- 恢復 session 後的第一個追問只會帶入同一 session 的有限歷史；新對話仍完全隔離。
- Stable response identities prevent serial workflows from overwriting restored message bubbles.
- 穩定的 response identity 可避免序列 workflow 覆寫已恢復的訊息。
- Provider DOM is serialized into safe semantic Markdown with paragraphs, nested lists, links, fenced code, and tables; GFM tables render as scrollable tables.
- Provider DOM 會轉成安全的語意化 Markdown，保留段落、巢狀清單、連結、fenced code 與表格；GFM 表格會以可捲動表格顯示。
- Transcript auto-follow scrolls only the transcript container and pauses while the user reads older messages.
- 自動跟隨只捲動 transcript；使用者閱讀舊訊息時不會被拉回底部。
- Session eviction runs only for recognized quota failures, and the UI reflects the sessions that were actually persisted.
- 只有確認為 quota 問題時才淘汰舊 session，UI 也會反映真正保存成功的資料。
- ChatGPT adapter v5 replaces stale or mismatched rich-editor drafts before send and can reach existing installations through adapter hot-update.
- ChatGPT adapter v5 會在送出前替換殘留或不一致的 rich-editor 草稿，並可透過 adapter hot-update 提供給既有安裝版。

## Contributors / 貢獻者

Special thanks to [Dave Tseng (`@DaveTseng2019`)](https://github.com/DaveTseng2019) for the `v1.3.1` overlay reliability fix; the detailed reproductions and original proposals in [#10](https://github.com/teddashh/multi-ai-chat-desktop/pull/10), [#11](https://github.com/teddashh/multi-ai-chat-desktop/pull/11), and [#12](https://github.com/teddashh/multi-ai-chat-desktop/pull/12); and the serializer regression tests merged in [#14](https://github.com/teddashh/multi-ai-chat-desktop/pull/14).

特別感謝 [Dave Tseng（`@DaveTseng2019`）](https://github.com/DaveTseng2019)：他貢獻了 `v1.3.1` overlay 可靠性修正、在 [#10](https://github.com/teddashh/multi-ai-chat-desktop/pull/10)、[#11](https://github.com/teddashh/multi-ai-chat-desktop/pull/11)、[#12](https://github.com/teddashh/multi-ai-chat-desktop/pull/12) 提供詳細重現與原始方案，並在 [#14](https://github.com/teddashh/multi-ai-chat-desktop/pull/14) 補上已合併的 serializer regression tests。

Thank you as well to community testers who shared reproducible Windows and macOS reports and sanitized debug logs.

也感謝提供 Windows、macOS 可重現回報與已清理 debug log 的社群測試者。

## Validation / 驗證

- Local release gates pass: 368 frontend tests, 20 Agent contract tests, adapter schema checks, TypeScript type-checking, ESLint, 52 Rust tests, `cargo fmt --check`, and Clippy with warnings denied.
- 本機發布閘門全數通過：368 個前端測試、20 個 Agent contract 測試、adapter schema 檢查、TypeScript type-check、ESLint、52 個 Rust 測試、`cargo fmt --check`，以及 warnings denied 的 Clippy。
- GitHub CI passes frontend checks plus Clippy on Windows, macOS, and Linux with warnings denied.
- The release workflow rebuilds and verifies Windows installer/portable, Apple Silicon DMG, and Linux AppImage artifacts from the immutable `v1.4.0` tag.
- macOS packaging is ad-hoc signed and signature-checked, but not Apple-notarized.
- Live Grok completion through a macOS Cloudflare challenge remains dependent on third-party behavior and has not been confirmed on a maintainer-owned Apple Silicon device.

## Downloads / 下載

- Windows x64 installer and portable zip
- Apple Silicon macOS DMG
- Linux x86_64 AppImage

## Notes / 注意事項

- No provider API keys are required; prompts go directly to the logged-in provider pages selected by the user.
- Windows artifacts are unsigned and may trigger SmartScreen.
- The macOS package is ad-hoc signed rather than Apple-notarized; follow the README first-launch steps if macOS blocks it.
- Provider websites can change independently. Attach a sanitized exported debug log when reporting automation failures.

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.3.1...v1.4.0
