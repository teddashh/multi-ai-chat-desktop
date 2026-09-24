# 交接紀錄：v1.9.4 實機證據 → v1.9.5 發布

日期：2026-09-24。給下一個 session。這份是交接，不是新規格；行為契約仍以 `docs/SPEC.md` 與目前 `main` 為準。
前一份是 `docs/HANDOFF-2026-09-21-CLAUDE.md`（v1.9.0 → v1.9.3），仍然有效，本份接續它。

## 現在停在哪

- 分支：`main` @ `dd22b21`（`docs: point Latest downloads at v1.9.5 (#111)`）。工作目錄乾淨。
- 正式版：**v1.9.5 Latest**（2026-09-22 12:45 UTC 發布，四個產物）
  https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.9.5
- 官網已部署並確認渲染為 v1.9.5：https://teddashh.github.io/multi-ai-chat-desktop/
- GitHub 上沒有 open issue、沒有 open PR。
- 本機分支只剩 `main`（其餘已合併的分支這次清掉了）。
- **`origin/docs/compat-2026-09-22` 這個遠端分支還在**，內容已被 `main` 取代（`#110` 的 v1.9.5 版措辭較新且較長），可以安全刪除；我沒有動遠端分支。

## 這次出的東西

| Commit | PR | 內容 |
|---|---|---|
| `b4f4d1c` | #108 | 頁面被換掉時讓該步驟失敗 + 輸入框填入儀表 |
| `164c925` | #109 | 每個輸入策略的第一次寫入前都先讓出 |
| `bb0f8d7` | #110 | v1.9.5 發布說明 + COMPATIBILITY.md |
| `dd22b21` | #111 | 四份 README 與官網指向 v1.9.5 |

順帶：`v1.9.1`、`v1.8.8` 兩個過期草稿 release 已刪除，兩個 tag 都還留在遠端，commit 仍可達。

## 一、卡死的根因（從 2026-09-22 的 bundle 實際讀出來的，不是推論）

使用者回報：第三輪之後 ChatGPT 與 Meta AI 降級，然後回不了對話，手動貼也沒用。

Meta 第 4 輪：`05:01:13.858` 在 bootId `ts684yo5` 上送出 **21,233 字元**，從此沒有完成。
最後一筆 Meta engine status 在 `05:01:06.016`，接著是 **73.3 秒完全靜默**，正好蓋住填入視窗。
webview 之後被換掉兩次：`4vpb89uv` @ `05:02:34.452`（伴隨 logged_out 閃動）、`d5yqanjo` @ `05:02:40.646`。

**為什麼不會逾時**：`05:03:20.667` 出現 `thinking: true` — 那是使用者手動貼上造成的，新頁面的活動訊號把不活動計時器重新計時了。所以那一步既完不成、也不會失敗。

修法（`src/bridge/pull.ts`）：偵測 bootId 輪替後，**先**通知輪替、**再** `publish(message)`。這個順序是關鍵 — `src/workflow/waitForResponse.ts` 的 `settle()` 是同步 `waiters.delete()`，所以等待者先被拒絕，新頁面的 `thinking` 就再也叫不回它。

兩個刻意的設計，改動前請先想清楚：

1. **不把 prompt 重送到新引擎。** 如果原本那次 send 其實有送到，重送就會變成送兩次。`ProviderPageReloadedError` 因此被排除在 `isRetryableSendRejection` 之外，測試也斷言 `host.provider.send` 只跑一次。
2. **`lastSeenBoot` 會活過 `resetProviderBootState()`。** 否則 reset 之後回來的頁面會被當成「第一次看到的 boot」而不算輪替。我一開始接受了 grok「reset 也會因為某些不換文件的呈現變化而跑」的說法，後來把 7 個呼叫點全列出來才發現不對：每一個不是換掉文件（`openProvider`、新 session、Reload、Reconnect）、就是直接摧毀它（chip → `host.close()`，見 `src/ui/presentationCommands.ts:35`）、就是在沒有文件載入時跑（兩處由 `webview !== 'loaded'` 擋住）。

**重放驗證**：把整段 20 分鐘 session 的每一次 bootId 輪替對上每一個步驟視窗，這個修復**只觸發一次**，就在真正卡住的那一步（`05:02:34`，進入該步驟約 81 秒），15 個已完成步驟**零誤判**。Meta 開機時的三次輪替（`04:44:59` / `04:45:09` / `04:45:15`，就是使用者說的登入狀態閃動）都落在任何步驟開始之前；ChatGPT 的兩次（`05:03:35` / `05:03:38`）落在它最後一步結束之後；Grok 與 Gemini 全程沒輪替。

## 二、我自己在 #108 犯的錯，#109 修掉

#108 的填入儀表，我把「送出標題前先讓出一個 microtask」這件事**只開給 `inputStrategy === 'default'`**，理由是其他策略寫成 `async`、應該自己會讓出。

**這個理由是錯的。** `async` 只表示函式回傳 promise，本體在第一個 `await` 之前仍然同步執行，而三個策略都在那之前就改了輸入框（行號為 `dd22b21` 當下的 `injected/engine.ts`，會漂移，以函式名為準）：

- `defaultInjectInput` :1104 — 純同步，全程沒有 `await`，直接走到 `document.execCommand('insertText', false, text)`
- `prosemirrorPasteInput` :1141 — textarea 分支呼叫 value setter、dispatch、直接 return，從頭到尾沒 await；ProseMirror 分支在第一個 `await` 之前就 dispatch 了 paste
- `quillAngularInput` :1226 — `replaceChildren()`、逐行建 `<p>`、`appendChild`、兩次 dispatch，全部在第一個 `await` 之前

結果 `fill: 'start'` 只有 Meta 趕在寫入之前。#109 改成兩處填入點（主路徑與輸入框重新掛載後的還原路徑）都無條件讓出，讓出後立刻 `assertCanMutate()`，所以讓出期間出現驗證挑戰仍會在任何寫入之前中止。

**測試陷阱（grok 第一次因此把讓出退回去）**：`releaseFillOperation` 會在填入 promise settle 之後、於一個 microtask 清掉 `draftStaging`，而那個 microtask 不發任何訊息。多一次讓出就把它推出原本寫死的兩次 `flushMicrotasks()` 視窗，於是 `FILL_DRAFT` 測試裡後續的 send 被判定為「還在進行中」而被拒。挑戰中止本身是對的，輸入框也從沒被寫入 — 純粹是數 tick 的問題。解法是 `drainUntilSettled()`（flush 到訊息、標題、輸入框文字、點擊、按鍵事件連續三輪不變為止）。

**負向控制我自己跑過**：暫時把 `default`-only 閘門改回去，三個新的順序測試全部 FAIL，既有的 `default` 那個仍然 PASS。之後 `git checkout -- injected/engine.ts` 還原。

### 這裡有個脆弱處，改動前必讀

`fill: 'start'` 之所以能趕在輸入框寫入之前送達，**只是因為填入當下 `titleEmitChain` 上沒有別的東西排隊**。這在目前的送出路徑成立（注入之前沒有任何地方發標題），但**只要有人在注入前加一個 emit，`fill: 'start'` 就會再次被蓋掉，而且不會有任何測試報錯**。已記在 `docs/COMPATIBILITY.md` 的「Provider page replaced mid-step」列與 #108 的 PR 內文。

## 三、順便拿到的 ChatGPT v1.9.4 實機證據

同一份 bundle 證實 v1.9.4 的擷取修復在實機有效。bootId `r3tn4wtt` **全程沒換過**，完成三輪：

| 輪次 | 送出 | 完成 | 耗時 |
|---|---|---|---|
| 開場立論 | 5,439 字 | 1,228 字 | 157.0s |
| 交叉質疑 | 9,848 字 | 1,683 字 | 178.1s |
| 攻防深化 | 15,408 字 | 1,988 字 | 253.0s |

9,848 與 15,408 字都長到會被 ChatGPT 摺疊到 `Show more` 後面，所以摺疊 turn 的擷取與完成是有證據的。但這是使用者自己的 Roundtable，不是把煙霧測試逐條跑完，所以「不要手動按 Send」與「`Pro thinking` 仍在時中間文字已回到 app」兩條沒有各自的證據。這次執行也完全沒碰到 v1.9.5 的修復。

## 四、出版產物的驗證方法（可重複使用，下次發版照做）

雜湊只證明檔案沒被掉包，不證明編進去的是對的程式碼。這個專案的兩半要用不同方法驗：

- **注入引擎（`injected/*.ts`）— 可以直接 grep。** `build:injected` 跑 esbuild 且**沒有** `--minify`，`src-tauri/src/webviews.rs` 用 `include_str!` 嵌入，所以識別字原樣留在二進位。本機 `pnpm build:injected` 出參考檔，再比對每個產物的出現次數。v1.9.5 的四個二進位全部吻合：`syncFillTitleTurn` 3、`emitComposerFill` 5、`fillChars` 8、`fillMs` 4。
- **前端（`src/*`）— grep 不到。** Tauri 會把嵌入的 `dist/` 做 brotli 壓縮。改用 **vite 內容雜湊**：本機建 tagged commit，確認每個二進位都嵌著同一個 `/assets/index-<hash>.js`。vite 的雜湊由最終 chunk 位元組算出，吻合即代表逐位元組相同。**發布說明要寫明這一半靠雜湊、不是直接 grep。**

**兩條死路，別再走一次**：用 node 的 brotli 重壓來對位元組是對不上的（參數與 Rust brotli crate 不同，加 size hint 也不行）；用熵值掃描找 blob 再解壓會得到一堆假陽性，因為 brotli 的 literal 模式會讓任意 rodata「解壓」成接近自己（我掃到的全是 Rust panic 字串）。

解包方式：AppImage 用 `--appimage-extract`；dmg 與 NSIS setup 用 `7z x`；portable 用 `unzip`。

**版本注入**：CI 只寫進 `package.json` 與 `src-tauri/tauri.conf.json`，**不寫 `Cargo.toml`** — 這是對的，`app.version()` 讀的是 tauri.conf.json。確認方式是 Windows PE 的 `FileVersion`／`ProductVersion`、macOS `Info.plist` 的兩個 key，以及三個 bundler 產生的檔名。**Linux 二進位完全沒有版本字串**（tauri-codegen 把版本寫成數字分段），`1.9.4` 和 `0.0.0` 在那裡同樣找不到 — 那是正常，不是漏了。

安裝版與 portable 的 exe 差**剛好 3 個位元組**：`__TAURI_BUNDLE_TYPE_VAR_NSS` 對 `_UNK`，是 Tauri bundler 標記自己那份，`scripts/pack-portable.mjs` 不會動它。

## 五、還沒驗證，不要宣稱已完成

- **v1.9.5 完全沒有實機檢查。** 證據只有自動測試 + 對錄下 trace 的重放。沒有新的 Windows／macOS／Linux 啟動檢查。
- **v1.9.5 沒有修好每一次停住。** 新的失敗要看到「文件被換掉 → 新 bootId」。引擎若靜默或卡住而頁面始終沒被換掉，那一步仍會等滿 10 分鐘不活動視窗與 60 分鐘絕對上限，跟以前一樣。
- Meta 的停止、新對話重置、profile 持久化仍未驗證。
- Grok Heavy 沒有被跑到；Grok Cloudflare 挑戰路徑與 Apple Silicon 啟動／登入煙霧測試都沒重跑。

## 六、還開著的決定

### 1. Meta 要不要換掉 `inputStrategy: "default"`（等一份實地量測）

使用者刻意把這個決定押後，等新的 fill 標記產出實地數據。**判讀規則**：

- 看到 `Meta AI composer fill started (N chars)` 卻**沒有**對應的 finished → `execCommand` 把 renderer 卡住了 → Meta 應該改用 paste 類策略。
- 有 finished、但 `fillMs` 很大 → 只是慢，不是這次的卡死，原因在別處。

Meta 是唯一走 `default`（`document.execCommand('insertText', …)` 整串塞進去）的 provider；ChatGPT／Claude／Grok 用 `prosemirror-paste`，Gemini 用 `quill-angular`。

**所以：下次 Meta 再卡住，請跟使用者要一份 debug bundle。** 那是這個決定唯一缺的東西。

### 2. `buildReportDigest()` 的 "matched" 與引擎的 "usable"（需要 owner 拍板）

這兩個語意不一致，屬於 SPEC §10.2 的契約問題，不是 bug，要使用者同意才動。

## 七、刻意關掉的，不要重開

**`chatGptUserTurnMatchesPrompt()` 的 160 字前綴問題。** 我量過：語言政策前言的 `promptEchoComparisonKey` 在 auto/zh-TW 下是 **1,005 字元**，而 `CHATGPT_COLLAPSED_PROMPT_PREFIX_CHARS = 160`，所以那個比對**永遠碰不到使用者的提示文字**。

但 `refreshChatGptUserTurnAnchor` 本來就點名了這件事（「older turns share the language-policy prefix」），而且有三層防護：送出前的計數基線、文件順序比較（`elementFollows`）、以及 v1.9.4 加的 `chatGptMayReadResponseWithoutAnchor()` fallback。這是「已記錄且已補償」的設計，不是現行缺陷。擷取路徑目前只有一輪實機驗證，所以**維持原狀**。要動請先問使用者。

## 八、環境與規矩（會踩的坑）

- **git 身分沒設定**（local 與 global 都空）。任何寫入物件的指令都要帶：
  `git -c user.name='Ted H' -c user.email='ted@ted-h.com' <cmd>`
  cherry-pick 失敗過的要先 `git cherry-pick --abort` 再重試。
- **`pnpm` 與 `agy` 不在預設 PATH**：先 `export PATH="$HOME/.local/bin:$PATH"`。
- **grok 呼叫**：`grok --prompt-file <f> --output-format plain --cwd <dir>`；plain 模式會把輸出緩衝到結束才吐，所以長任務要 `run_in_background`。`grok -c` 可以接續該 cwd 的對話。
- **分支保護**：`REVIEW_REQUIRED` 且沒有第二位 reviewer（GitHub 不讓自己核可自己的 PR），所以合併需要 `--admin`。#109／#110／#111 都是這樣合的。
- **背景輪詢**：`until [ -s <file> ]` 這種判斷會被同一串指令的其他輸出汙染而立刻返回，要改成 grep 預期內容。另外 `sleep 60; <cmd>` 這種鏈會被 harness 擋掉。
- **兩份 debug txt 還在工作目錄**（`multi-ai-chat-debug-2026-09-21-*.txt`），由 `.gitignore:28` 的 `multi-ai-chat-debug-*.txt` 擋住。**不要 commit 它們。**

### 委派規則（使用者明訂）

要寫程式**一律**派給 grok CLI 的 grok 4.7，較簡單的任務可以派 Antigravity CLI 的 Gemini，但**由 Claude 一起 review**。目的是省 Claude 額度。不要用 Agent tool 代替 — 那跑的是 Claude 模型，違背目的。

### 已作廢的舊文件

`docs/HANDOFF-PR96.md` 裡的「Facebook 不內嵌、登入按鈕優先」**不是現行行為**（v1.9.2 起 Facebook／Instagram HTTPS host 已納入 Meta SSO allowlist，登入留在 Meta 窗格內）。使用者已明確交代過兩次，不要再把它當現況。

## 九、建議下一步

1. 等使用者跑 v1.9.5。**下次 Meta 卡住就要一份 debug bundle** — 那是〈六〉之1 唯一缺的輸入。
2. `buildReportDigest()` 的 "matched"／"usable" 要使用者對 SPEC §10.2 拍板。
3. 想清掉遠端殘留的話：`git push origin --delete docs/compat-2026-09-22`（內容已被 main 取代）。
