# v1.9.2 — Meta Facebook/Instagram login stays in-pane

## Provider-compatibility patch / Provider 相容性補丁

Multi-AI Chat Desktop `v1.9.2` keeps Meta Log in on Facebook or Instagram **inside the app**. A login in the system browser cannot return to the isolated Meta profile.

Multi-AI Chat Desktop `v1.9.2` 讓 Meta 的 Facebook／Instagram 登入留在 **app 視窗內**。在系統瀏覽器登入無法回到隔離的 Meta profile。

A Windows `v1.9.0` debug bundle showed `nav-blocked` `www.facebook.com`, after which Meta stayed `logged_out` through restart. Bundled Meta SSO now includes Facebook and Instagram HTTPS hosts (`adapterVersion` 2). Those hosts stay out of the Meta app surface, so the engine is not injected on identity pages.

Windows `v1.9.0` debug bundle 顯示 `nav-blocked` `www.facebook.com`，之後 Meta 一直是 `logged_out`，重開也一樣。本版把 Facebook／Instagram HTTPS 登入網域收進 Meta SSO（`adapterVersion` 2）。這些網域不屬於 Meta app surface，引擎不會打進身份頁。

Also includes the v1.9.1 Grok Heavy resume-timer patch.

本版同時包含 v1.9.1 的 Grok Heavy 恢復生成計時器修正。

## How to sign in / 如何登入

- Complete Facebook or Instagram sign-in **in the Meta pane or the in-app login window**.
- 請在 **Meta 窗格或 app 內登入視窗** 完成 Facebook／Instagram 登入。
- Do not use the system browser that previously jumped out; that session cannot come back.
- 不要用先前跳出的系統瀏覽器登入；那個 session 回不來。

## Verification / 驗證

- CI on [#100](https://github.com/teddashh/multi-ai-chat-desktop/pull/100): adapters, frontend, three-platform Clippy, and CodeQL passed.
- [#100](https://github.com/teddashh/multi-ai-chat-desktop/pull/100) CI：adapters、frontend、三平台 Clippy、CodeQL 通過。
- Release workflow for tag `v1.9.2` built Windows installer + portable zip, Apple Silicon DMG, and Linux AppImage. SHA-256 matched the published assets, and the portable zip CRC-tested clean with a `PORTABLE` marker.
- `v1.9.2` Release workflow 產出 Windows 安裝版與 portable zip、Apple Silicon DMG、Linux AppImage。SHA-256 與已發布檔案相符，portable zip CRC 通過且含 `PORTABLE` 標記。
- **Authenticated Meta send/receive was not re-run for this tag.** Confirm login reaches `logged_in` and survives restart on a real Windows build.
- **本 tag 沒有重做已登入的 Meta 送收。** 請用 Windows 實機確認登入後為 `logged_in`，且重開仍在。

## Downloads / 下載

Published: https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.9.2

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.9.1...v1.9.2
