# v1.9.3 — Meta login is recognized

## Provider-compatibility patch / Provider 相容性補丁

Multi-AI Chat Desktop `v1.9.3` reports Meta as logged in when its composer is visible, editable, and not inert. A leftover login button or inert prehydration field no longer hides a usable editor.

Multi-AI Chat Desktop `v1.9.3` 會在 Meta 輸入框可見、可編輯、且不是 inert 時，把狀態標成已登入。殘留的登入按鈕或 inert 預載欄位不再蓋過可用的編輯器。

A Windows `v1.9.2` debug bundle showed Facebook/Instagram login returning to the pane while Meta stayed `logged_out`. The hydrated composer is also recognized as a textarea or contenteditable textbox (`adapterVersion` 3). A disabled, readonly, or inert composer still stays logged out.

Windows `v1.9.2` debug bundle 顯示 Facebook／Instagram 登入已回到窗格，但 Meta 仍是 `logged_out`。本版也認得 hydration 後的 textarea 與 contenteditable 文字框（`adapterVersion` 3）。停用、唯讀或 inert 的輸入框仍是登出。

## Verification / 驗證

- CI on [#102](https://github.com/teddashh/multi-ai-chat-desktop/pull/102): adapters, frontend (731 tests), three-platform Clippy, and CodeQL passed.
- [#102](https://github.com/teddashh/multi-ai-chat-desktop/pull/102) CI：adapters、frontend（731 項）、三平台 Clippy、CodeQL 通過。
- Release tag `v1.9.3` artifacts were SHA-256 checked, and the portable zip CRC-tested clean with a `PORTABLE` marker.
- `v1.9.3` 產物已核對 SHA-256，portable zip CRC 通過且含 `PORTABLE` 標記。
- **Authenticated Meta send/receive was not re-run.**
- **沒有重做已登入的 Meta 送收。**

Published: https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.9.3

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.9.2...v1.9.3
