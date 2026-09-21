# 交接紀錄：Codex v1.9.0 → Grok v1.9.1–v1.9.3 → Claude

日期：2026-09-21。給下一個 Claude session。這份是交接，不是新規格；行為契約仍以 `docs/SPEC.md` 與目前 `main` 為準。

## 現在停在哪

- 分支：`main` @ `d8351a8`（`docs: point Latest downloads at v1.9.3 (#103)`）。
- 正式版：**v1.9.3 Latest**  
  https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.9.3
- 官網已部署，首頁下載連結是 v1.9.3：  
  https://teddashh.github.io/multi-ai-chat-desktop/  
  部署：https://github.com/teddashh/multi-ai-chat-desktop/actions/runs/35647668574
- GitHub 上沒有 open issue、沒有 open PR。
- 使用者 Windows 已裝過 **v1.9.2**，之後升到 **v1.9.3**。v1.9.3 的實機結果見下方〈五〉。
- 本機工作樹在 `docs/v1.9.3`，相對 `main` 只多了這份交接。另有兩份**未追蹤** debug bundle，不要 commit：
  - `multi-ai-chat-debug-2026-09-21-16-53-10.txt`（v1.9.0，Facebook 被擋）
  - `multi-ai-chat-debug-2026-09-21-19-12-56.txt`（v1.9.2，登入成功但狀態仍 `logged_out`）

未發布、不要裝、不要當 Latest：

| Tag | 狀態 | 原因 |
|---|---|---|
| v1.9.1 | Draft | 只有 Grok timer 文件；Meta 登入修正還沒進這個 tag。v1.9.2／v1.9.3 已涵蓋它的程式。 |
| v1.8.8 | Draft | 更早的 live-validation 草稿，維持不公開。 |

## 產品現況（Claude 不要改回去）

- Feature-frozen。五家可選、同時恰好四家。預設 ChatGPT、Claude、Gemini、Grok。Meta AI 是實驗性可選 standby。
- Meta `adapterVersion` **3**。App surface 仍只有 `www.meta.ai/*`、`meta.ai/*`。引擎不注入 Facebook／Instagram。
- Meta SSO（v1.9.2 起，`#100`）包含：`auth.meta.com`、`auth.meta.ai`、`www.facebook.com`、`m.facebook.com`、`facebook.com`、`www.instagram.com`、`instagram.com`。只允許 HTTPS、無帳密、無非預設 port。
- 登入判定（v1.9.3 起，`#102`）：可見、可編輯、非 inert 的 composer **優先**判 `logged_in`。沒有可用 composer 時，inert 欄位或 `[data-testid="login-button"]` 仍是 `logged_out`。停用、唯讀、inert 的欄位不能單靠「看得到」變成已登入。
- 輸入選擇器另含 hydration 後的 `textarea[aria-label="Ask Meta AI"]`、`[contenteditable="true"][aria-label="Ask Meta AI"]`、`[contenteditable="true"][role="textbox"]`。
- 沒有繞過登入、沒有把 Facebook 放進共用 SSO allowlist、沒有把 Facebook 放進 `app_hosts`。

## 一、Codex session 做了什麼

主要收尾 session：

- 工具：Codex VS Code，`gpt-6-astra`
- session：`01a0bdf2-3e25-7d21-8be0-1b2457d183fe`
- 檔案：`~/.codex/sessions/2026/09/20/rollout-2026-09-20T04-32-44-01a0bdf2-3e25-7d21-8be0-1b2457d183fe.jsonl`
- 時間：2026-09-20 08:33Z 到 2026-09-21 12:58Z
- 分支：`feat/meta-ai-optional`
- 讀者略過 111 筆 foreign instruction／reasoning。下面依該 session 的使用者要求、助手收尾句、`docs/HANDOFF-PR96.md` 與 git 紀錄，不是逐字重播。

同一條線上較早的 Codex seat（同一天、同一分支，舊 seat 已被標成 void）：

- `01a0bde6-8e07-78d2-bacb-68ef0f814a8d`（約到 2026-09-20 16:40Z）
- `01a0bde5-5923-7a82-abe4-7e01321006db`
- `01a0bde3-04b4-7d83-b9ba-3b2ea5ee3b82`（從 `e3a9f9d` 接著做）
- `01a0bdbf-e346-7001-b707-f7340fe71df9`（先讀 repo）

Codex 接到的範圍是 PR **#96**：Meta AI optional standby。使用者後來明確說：不要再部署、沒有 VM、把能用自動化做完的做完、UI 不要長文、然後當正式版發布。Meta 維持 optional experimental。真實登入與送收留給之後的使用者回報。

從接手基準 `e3a9f9d` 到發布點 `d4572e1`，這段 commit 包含：

- Meta 登入提示改走 email／手機，並寫明當時 **Facebook／Instagram 不內嵌**（`2542a19`）。v1.9.2 已改掉這條產品行為，不要照這句舊說明做。
- 診斷篩選、portrait、AI-Sister 相關測試（`88fbc0a` 一帶）。
- Focus／Replay／Preflight／Report／Diagnostics／Settings 的 host rejection：顯示錯誤、可重試、in-flight 與 stale click 保護（`a4c3626` 到 `1fe55e8`、`4a8b8d1`、`4f385f6`、`80efec1`、`2276e41`）。
- Workflow／replay 以**目前啟用的四家**做 preflight，不讓殘留 Ready 的 standby 混過去；無效 snapshot provider 要拒絕（`75f4f74`）。
- UI 文案縮短。Settings autosave 與 Close／Save 交錯保護。
- 交接 `docs/HANDOFF-PR96.md`（`6b46865`）與 v1.9.0 收斂（`d4572e1`）。

驗證（Codex 收尾，Grok 沒有重跑這一批當下的數字）：

- 本機前端 **724** 項、agent **22** 項。
- PR #96 CI：frontend、三平台各 **91** 項 Rust、Clippy、CodeQL 通過。
- 四個安裝包 SHA 與 portable ZIP CRC 由 Codex 核過後公開。
- 沒有 VM、沒有真實 Meta 登入／送收 E2E。

發布動作：

- 分支保護先擋合併（要求 review）。使用者說自己就是那個 reviewer、repo 沒有另設 reviewer，授權用管理者權限合併。
- **#96** 合併為 `25029bc`。Tag `v1.9.0` 指在 `d4572e1`，已公開，當時是 Latest。
- 交接原文：https://github.com/teddashh/multi-ai-chat-desktop/blob/main/docs/HANDOFF-PR96.md

Codex 停下來時故意留下的限制：

- 沒有新的 Meta 真實登入、guest、送收、完成、Stop、新 session、Debate 實站。
- 當時 Windows QC：Log in 轉去 Facebook，而 Facebook 不在 allowlist。
- ChatGPT Astra ↔ Grok Heavy 慢速交接、macOS Grok challenge、登入後 profile 持久性，都沒有新的實機證據。

## 二、這個 Grok session 做了什麼

Grok 從使用者貼上的 v1.9.0 收尾句開始。這台機器沒有圖形桌面、沒有 WebKitGTK，不能跑 Tauri GUI，也不能做真實帳號 smoke。`scripts/agent/doctor.mjs` 是 `missing_prerequisites`。

### 1. 收 v1.9.0 的 PR／issue

- **#96** 當時已經 merged。補了發布說明：https://github.com/teddashh/multi-ai-chat-desktop/pull/96#issuecomment-5761298225
- **#95**（增加模型）關成 completed。Meta 五選四已出貨。
- 使用者接著說 #92／#97 若不能跑實機就關掉。Grok **先把 #97 未合併就關閉**，這是錯的。使用者指出不該留未合併尾巴。

### 2. 把 #97 的 Grok timer 真正合併

- 原 PR **#97** 落後 `main`，CI 沒跑完，遠端分支還在。GitHub 不允許 reopen 同一個 PR。
- 兩個 commit cherry-pick 到當時的 `main`：取消 Grok 在 stop 恢復、中間文字不變時的過期 response／finish timer，並等生成真正結束。含兩次 resume 的回歸。
- 本機 verify：injected build、typecheck、lint、**730** Vitest、22 agent、adapter check。
- 後繼 PR **#98** 合併為 `449b6bc`。CI：frontend、三平台 Clippy、CodeQL。
- **#92** 維持關閉。v1.8.9 已有 Heavy／Astra 終端交接修正；這次只落地 timer residual。**沒有**新的真實帳號 Heavy ↔ Astra smoke。

### 3. v1.9.1 文件與草稿

- **#99** 合併 `e36e1a2`，四語 README／官網改指向 v1.9.1，新增 `docs/RELEASE_NOTES_v1.9.1.md`。
- Tag `v1.9.1` 的 Release workflow 成功，產物留在 **Draft**。後來 Meta 登入 bug 進來，所以 **沒有**把 v1.9.1 設成 Latest。不要補公開這個 draft。

### 4. v1.9.2：Facebook 登入被丟到系統瀏覽器

使用者給 `multi-ai-chat-debug-2026-09-21-16-53-10.txt`（app **v1.9.0**，Windows）：

- Meta `logged_out` / `dom ready`。
- 約 6 秒後 `nav-blocked` host `www.facebook.com`。
- 之後仍 `logged_out`。重開也沒用。

原因：不在 allowlist 的 HTTPS 會被拒，並用系統瀏覽器打開。系統瀏覽器的 cookie 進不了 Meta webview 的隔離 profile。

修正 **#100**，合併 `764d8fa`：

- Facebook／Instagram HTTPS 收進 **Meta SSO only**，`adapterVersion` 2。
- 登入改留在 app 視窗或 in-app popup。
- 四語提示改成：要在這個視窗登入；別的瀏覽器登入回不來。
- `docs/SPEC.md` §5.2 與 `scripts/check-adapters.mjs` 同步。§5.1 四家種子沒有放寬。

Tag **v1.9.2** 已公開（曾是 Latest）。四個安裝包 SHA-256 與 portable ZIP（含 `PORTABLE`）核對過。Release run：https://github.com/teddashh/multi-ai-chat-desktop/actions/runs/35630953968

官網一度仍寫 v1.9.1。**#101** 合併 `f575990` 後才改到 v1.9.2。

### 5. v1.9.3：登入成功但 app 仍顯示登出

使用者回報 v1.9.2 已能登入，系統不知道。Debug：`multi-ai-chat-debug-2026-09-21-19-12-56.txt`（app **v1.9.2**，Windows，語系 zh-TW）：

- ChatGPT／Claude／Gemini：`logged_in`。Grok：`unknown`（這份 bundle 裡五家都列得出來；Grok 不是這次的故障點）。
- Meta：bridge ok、adapter ok、`dom ready`，但多次 reload（bootId `rsxf8ku7`、`zwscxfgu`、`n4l8pd5p`、`6hiua8l4`）都是 `login logged_out`。
- Bundle 沒有 DOM，所以不知道是 login button 還在、inert placeholder 還在，還是 hydration 後的 composer 換了標籤。

修正 **#102**，合併 `3b51d63`：

- `injected/engine.ts`：Meta 先看 `queryInput()`。可用 composer 就 `logged_in`，即使旁邊還有 login control 或 inert 欄位。
- 沒有可用 composer 時維持 `logged_out`，**不**掉進通用 `loginDetectors`。第一版 CI 的 frontend job 因此失敗過：disabled／readonly／aria-disabled／inert 被通用偵測器誤判成已登入。`afeb315` 補上後，engine-input **121** 項通過，整份 frontend **731** 項通過。
- `adapterVersion` 3，補 hydrated textarea 與 contenteditable textbox。
- SPEC §5.2 的優先順序句子已改成「可用 composer 優先」。不要把 v1.9.0 交接裡「登入控制仍優先」當成現行行為。

Tag **v1.9.3** 已是 Latest。SHA-256：

```
6242a6ded3a10364698eb3eeb099713eb2b026a65d193a3b76b77ecabcd0ad3b  Multi-AI.Chat.Desktop_1.9.3_x64-setup.exe
916464a6499746576c2b7eacfc6a1bc76c80e639af5688d4064ee019e152dc3b  Multi-AI-Chat-Desktop-1.9.3-windows-portable.zip
eefb2d2c1e3801c38bbcb332d63d569fc526f266e1a9a683ece2d8aec1954b60  Multi-AI.Chat.Desktop_1.9.3_aarch64.dmg
773a312de505c85906b328e0b2979669f0148db2645142d87666f06c364794e9  Multi-AI.Chat.Desktop_1.9.3_amd64.AppImage
```

Release run：https://github.com/teddashh/multi-ai-chat-desktop/actions/runs/35645364473

**#103** 合併 `d8351a8`，README／官網／`docs/RELEASE_NOTES_v1.9.3.md` 改指向 v1.9.3。Pages 部署成功，線上 HTML 已是 `releases/tag/v1.9.3`。

### 6. 這個 session 的 PR 一覽

| PR | 結果 | main SHA | 內容 |
|---|---|---|---|
| #98 | merged | `449b6bc` | Grok resume timer（#97 的後繼） |
| #99 | merged | `e36e1a2` | v1.9.1 文件。tag 只留 draft |
| #100 | merged | `764d8fa` | Meta Facebook／Instagram in-pane SSO |
| #101 | merged | `f575990` | 官網改 v1.9.2 |
| #102 | merged | `3b51d63` | 可用 composer 視為已登入 |
| #103 | merged | `d8351a8` | 官網改 v1.9.3 |

已關閉、不要重開除非使用者帶新證據：#92、#95、#96、#97。

## 三、還沒驗證、Claude 不要宣稱已完成

- ~~v1.9.3 實機登入狀態還沒有使用者回報。~~ 已於 2026-09-21 21:11Z 確認，見〈五〉。
- Meta 的送出、回覆擷取、完成已在 roundtable 實站確認（見〈五〉）。Stop、新 session 仍無實站 E2E。
- 登入後重開 app，profile 是否還在：v1.9.2 使用者說重開沒用，但那是狀態判錯；v1.9.3 的 cookie 是否持久還沒被確認。
- Grok Heavy ↔ ChatGPT Astra 慢速交接、macOS Grok Cloudflare challenge：沒有新的實機。#98 只覆蓋 timer 單元測試。
- 這台 Linux 主機不能啟動 GUI。不要在這裡宣稱 native smoke 通過。
- Windows 安裝檔仍未簽章。macOS 仍是 ad-hoc、未 notarize。Linux 仍是 CI AppImage。

## 四、建議 Claude 接下去的順序

1. 先讀 `main` @ `d8351a8`、`docs/SPEC.md` §5.2、`adapters/meta.json`、`injected/engine.ts` 的 `reportStatus()`。不要用 `docs/HANDOFF-PR96.md` 裡「Facebook 不內嵌／登入控制優先」覆蓋現行程式。
2. 等使用者裝 **v1.9.3**（不要裝 v1.9.1 draft，也不要再拿 v1.9.2 判斷登入狀態）。請他們看 Meta 是否變成已登入，並在重開後再看一次。
3. 若仍是登出：要新的 debug bundle，外加他們畫面上 composer 的標籤（不必貼對話內容）。再改 selector，不要先加更多網域。
4. 若已登入：下一關才是送一句、看回覆與 `RESPONSE_DONE`。失敗再收 bundle。
5. 兩份本機 debug txt 含環境與狀態，不要 commit、不要貼上 cookie／對話。
6. 這份交接目前只在工作樹。若要進 repo，另開一個 docs commit 即可，不必再發版。

## 五、2026-09-21 晚間更新（Claude 接手後）

證據：使用者 Windows debug bundle `2026-09-21T21:11:41Z`，app **1.9.3**，語系 `zh-TW`。**不要 commit 該 bundle。**

### v1.9.3 確認修好 Meta

- Meta AI：`bridge ok, adapter ok, login logged_in`。#102 的「可用 composer 優先」在真實 zh-TW 介面上成立。
- Meta 在 roundtable 兩輪都真的送出並收回：第 1 輪 10 個 chunk + `RESPONSE_DONE`（909 字 / 31.8s），第 2 輪 10 個 chunk + `RESPONSE_DONE`（1333 字 / 33.4s）。
- 因此〈三〉裡「Meta 送出／回覆擷取／完成沒有實站 E2E」三項已關閉。Stop、新 session、profile 重開持久性仍未驗證。
- 該次 Grok 是 standby、從未開啟，所以 `login: unknown` 屬正常（`unknown` 是 Rust 初始值，adapter 裝好後 `reportStatus()` 只會吐 `blocked`／`logged_in`／`logged_out`）。

### 新發現：ChatGPT response 擷取會永久靜默

同一份 bundle 暴露一個**既有、與 Meta 無關**的 ChatGPT bug。roundtable 第 2 輪 ChatGPT：

- `21:08:16` send queued（10821 prompt 字元）→ `21:08:45` `thinking yes` → `21:11:15` `thinking no`
- 全程 **沒有任何 `bulk ready`、`RESPONSE_CHUNK`、`RESPONSE_DONE`**。使用者確認頁面上 ChatGPT 確實有回覆。

根因鏈（`injected/engine.ts`）：

1. `:1227` `getLatestResponseCandidate()` 對 chatgpt 設硬閘門 — 解不出 user-turn anchor 就無條件 `return null`。
2. `:1893` `refreshChatGptUserTurnAnchor()` 只在 `matchingTurns.length > matchingChatGptUserTurnBaseline` 時才認新 anchor，否則回傳前一個；而 `:649` 在每次 send 已把它設為 `null`。
3. `:1869` 的比對對 ≥512 字 prompt 走摺疊前綴規則：可見文字 ≥80 字（`CHATGPT_COLLAPSED_PROMPT_MIN_VISIBLE_CHARS`）且前 160 字元相同（`CHATGPT_COLLAPSED_PROMPT_PREFIX_CHARS`）。roundtable prompt 累加到 10821 字必被 ChatGPT 摺疊；又因為前一輪發言共用同樣的 160 字開頭，baseline 已經是 1，新發言若沒同時匹配就是 `1 <= 1` → anchor 永遠 null。
4. 兩條發 chunk 的路徑（`:1770` observer、`:1798` backup poll）都在 `!currentText` 提早 return。
5. `checkIfDone()` 只從那兩條路徑排程 → 從未排程。
6. 逃生口 `failIfTurnCompletionTimedOut()`（`:1637`）要求 `lastResponseText` 非空，它停在 `''` → 也死。

⇒ 引擎完全靜默，只剩 host 端 600 秒 step timeout 能救。

同輪第 1 輪 ChatGPT 是同根因的輕症：只在送出 90 秒後吐出**單一** 994 字 chunk，而 Claude／Gemini／Meta 都是 `backupPollMs: 3000` 節奏的漸進串流。

修正時的陷阱：anchor 機制是為了擋 v1.8.8 的「ChatGPT 在吃掉輸入框前先畫出樂觀的長發言副本」假象（見 `:1877` 與 `sendStarted()` 註解）。不可直接移除 anchor，否則該舊 bug 會回來。
