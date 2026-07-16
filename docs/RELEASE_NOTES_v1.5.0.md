# v1.5.0 — Reliable sends and calmer session navigation

## Stable maintenance release / 正式維護版本

Multi-AI Chat Desktop `v1.5.0` hardens ChatGPT sending and provider response capture, adds direct navigation from connection chips to transcript answers, and makes conversation history calmer and more predictable. It deliberately preserves the clean-provider-session boundary when switching history so unrelated remote conversations cannot contaminate a continued local session.

Multi-AI Chat Desktop `v1.5.0` 強化 ChatGPT 送出與 provider 回答擷取，加入從 AI 連線 chip 直接跳到逐字稿回答的導覽，也讓對話歷史更穩定、更符合預期。切換歷史時仍刻意維持乾淨的 provider session 邊界，避免其他遠端對話污染要延續的本機 session。

## Highlights / 更新重點

- A cancelable Enter event consumed by ChatGPT is accepted as a successful send instead of being misreported as an input-injection failure.
- ChatGPT 已接收並攔截 Enter 時會視為成功送出，不再誤報 input injection failed。
- Provider prompt echoes and leaked response-language policy text are rejected; when multiple answer candidates appear, the latest real response wins.
- 會排除 provider 的 prompt 回音與外洩的 response-language policy；同時出現多個回答候選時，以最新的真實回答為準。
- Selecting a provider connection chip scrolls to that provider's latest transcript message and briefly highlights it; repeated selections restart the full highlight duration.
- 點選 provider 連線 chip 會跳到該 provider 最新一則逐字稿並短暫醒目標示；重複點選會重新計算完整標示時間。
- The conversation sidebar remembers its collapsed state across restarts without placing storage side effects inside React state updates.
- 對話側邊欄會跨重啟記住收合狀態，且儲存副作用不再放在 React state updater 內。
- Unchanged conversations keep their original history date, using field-level message comparison rather than serialization order; saved author labels are preserved on restore.
- 未變更的對話會保留原本歷史日期，改用逐欄位訊息比較而非依賴序列化順序；作者標籤也會在還原時保留。
- History switching continues to prepare a clean provider session before bounded same-session replay. Keeping an arbitrary live provider tab would risk mixing unrelated remote context into the next workflow.
- 切換歷史後仍會先準備乾淨的 provider session，再有限度重播同一 session。若直接保留任意真實頁面，可能把不相關的遠端上下文混入下一個 workflow。

## Contributors / 貢獻者

Special thanks to [Dave Tseng (`@DaveTseng2019`)](https://github.com/DaveTseng2019) for the connection-chip transcript navigation in [#20](https://github.com/teddashh/multi-ai-chat-desktop/pull/20), persisted sidebar preference in [#21](https://github.com/teddashh/multi-ai-chat-desktop/pull/21), stable history dates in [#22](https://github.com/teddashh/multi-ai-chat-desktop/pull/22), and the thoughtful session-continuity discussion in [#23](https://github.com/teddashh/multi-ai-chat-desktop/pull/23).

特別感謝 [Dave Tseng（`@DaveTseng2019`）](https://github.com/DaveTseng2019)：他在 [#20](https://github.com/teddashh/multi-ai-chat-desktop/pull/20) 貢獻連線 chip 的逐字稿導覽、在 [#21](https://github.com/teddashh/multi-ai-chat-desktop/pull/21) 保存側邊欄偏好、在 [#22](https://github.com/teddashh/multi-ai-chat-desktop/pull/22) 穩定歷史日期，也在 [#23](https://github.com/teddashh/multi-ai-chat-desktop/pull/23) 提出值得深入檢視的 session 延續方案。

Thank you as well to the users who supplied sanitized roundtable transcripts, debug bundles, and precise ChatGPT prompt-loss reproductions.

也感謝提供已清理 roundtable 對話、debug bundle 與精確 ChatGPT prompt 消失重現步驟的使用者。

## Validation / 驗證

- Local release gates pass: 384 frontend tests, 20 Agent contract tests, adapter schema checks, TypeScript type-checking, ESLint, production build, 52 Rust tests, `cargo fmt --check`, and Clippy with warnings denied.
- 本機發布閘門全數通過：384 個前端測試、20 個 Agent contract 測試、adapter schema 檢查、TypeScript type-check、ESLint、production build、52 個 Rust 測試、`cargo fmt --check`，以及 warnings denied 的 Clippy。
- The tag-driven release workflow rebuilds and verifies Windows installer/portable, Apple Silicon DMG, and Linux AppImage artifacts from the immutable `v1.5.0` tag.
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

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.4.0...v1.5.0
