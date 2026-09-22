# v1.9.4 — ChatGPT replies reach the app again

## Provider-compatibility patch / Provider 相容性補丁

Multi-AI Chat Desktop `v1.9.4` recovers ChatGPT response capture when the user-turn anchor detaches in the middle of a turn. A reply that ChatGPT finishes on screen now reaches the app instead of leaving the step silent until the 600-second host timeout.

Multi-AI Chat Desktop `v1.9.4` 會在 ChatGPT 的 user turn 錨點中途離開 DOM 時救回回覆擷取。ChatGPT 畫面上已經回完的內容，不再一路沉默到 600 秒的 host 步驟逾時。

A Windows zh-TW `v1.9.3` Roundtable run showed the failure: Meta finished two speeches, then ChatGPT answered on screen and the app received nothing. `v1.9.3` latched the anchor onto ChatGPT's optimistic user bubble; ChatGPT replaced that bubble with a collapsed `Show more` turn, so the latched node left the document and every live reply failed the follows-the-anchor test. With no chunk, the completion check was never armed, and the turn-completion timeout — which needs captured text before it can fire — stayed disabled.

一份 Windows zh-TW 的 `v1.9.3` Roundtable 紀錄重現了這個失敗：Meta 完成兩輪發言後，ChatGPT 在畫面上回了，app 卻什麼都沒收到。`v1.9.3` 把錨點鎖在 ChatGPT 的樂觀 user 泡泡上；ChatGPT 之後用折疊的 `Show more` turn 取代它，被鎖住的節點離開 DOM，所有實際回覆都過不了「必須排在錨點之後」這道檢查。沒有 chunk 就不會啟動完成判斷，而必須先有已擷取文字才會生效的回合逾時也跟著失效。

`v1.9.4` keeps the adopted anchor latched after its node detaches, treats a disconnected anchor as absent rather than as a hard stop, and permits an anchorless read only once generation has been observed with this wait's pre-send baseline already snapshotted. Assistant turns that existed before the send are still excluded.

`v1.9.4` 在錨點節點脫離後仍保留已採用的錨點，把斷線的錨點當成「沒有錨點」而不是直接停止讀取，並且只有在這次等待已經拍下送出前基準、而且確實觀察到生成之後，才允許無錨點讀取。送出前就存在的 assistant turn 仍然被排除。

## Verification / 驗證

- CI on [#105](https://github.com/teddashh/multi-ai-chat-desktop/pull/105): frontend (734 tests), three-platform Clippy, and CodeQL passed; the adapters job was skipped because no adapter changed.
- [#105](https://github.com/teddashh/multi-ai-chat-desktop/pull/105) CI：frontend（734 項）、三平台 Clippy、CodeQL 通過；本次沒有動 adapter，adapters job 略過。
- Three new regressions cover a reply read after the latched anchor detaches, a completion when no anchor ever resolves, and a negative case that a pre-send assistant message is never emitted through the fallback.
- 新增三項回歸測試：錨點脫離後仍讀到回覆、完全沒有錨點時仍能完成、以及送出前就存在的 assistant 訊息不會經由 fallback 送出。
- Meta AI authenticated send, receive, and completion were confirmed live on Windows zh-TW with `v1.9.3` (two Roundtable speeches, 909 and 1,333 characters). Meta stop, new-session reset, and profile persistence remain unverified.
- Meta AI 已登入狀態的送出、接收與完成，已在 Windows zh-TW 的 `v1.9.3` 實機確認（兩輪 Roundtable 發言，909 與 1,333 字）。Meta 的停止、新對話重置與 profile 持久化仍未驗證。
- **The ChatGPT live retest has not been run on `v1.9.4`.** The fix is covered by focused tests only.
- **ChatGPT 的實機重測尚未在 `v1.9.4` 上執行。** 這個修復目前只有針對性測試覆蓋。
- Known gap: a reply that ends with no thinking detector, no strong activity signal, and no resolvable anchor can still stay silent until the host step timeout. Widening the trigger further would risk emitting pre-send DOM, so it was left narrow.
- 已知缺口：如果一則回覆結束時既沒有思考偵測、也沒有強活動訊號、又無法解析錨點，仍會沉默到 host 步驟逾時。把觸發條件放得更寬，會有把送出前的 DOM 當成回覆送出的風險，因此維持保守。
- Release tag `v1.9.4` artifacts were SHA-256 checked, the portable zip CRC-tested clean with a `PORTABLE` marker, and all four artifacts were unpacked to confirm the shipped binaries contain the fix.
- `v1.9.4` 產物已核對 SHA-256，portable zip CRC 通過且含 `PORTABLE` 標記，四個產物也都解開確認二進位內含此修復。

Published: https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.9.4

**Full changelog:** https://github.com/teddashh/multi-ai-chat-desktop/compare/v1.9.3...v1.9.4
