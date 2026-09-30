# 交接紀錄：GitHub #115（ChatGPT Chat/Work 版面）與 #116（Grok 未登入）

日期：2026-09-30。給下一個 session。這份是交接，不是新規格。行為契約仍以 `docs/SPEC.md` 與目前的 `main` 為準。
前一份是 `docs/HANDOFF-2026-09-24-CLAUDE.md`（v1.9.4 → v1.9.5），本份接續它。

## 現在停在哪

- `main` @ `0f0d044`（`fix(adapter): recognize ChatGPT ProseMirror composer (#114)`）。ChatGPT adapter v8 已經在 `main` 上，透過 adapter 熱更新送到所有安裝。
- 正式版仍是 **v1.9.5 Latest**（2026-09-22）。
- **PR #118 開著、沒合併**（`fix/issues-115-116-provider-dom`，head `1a8d256`），CI 全綠，要等使用者決定，見〈五〉。分支保護要求 review，所以合併要 `--admin`。
- #117 已關閉，被 #118 取代，理由見〈三〉。它的分支 `teddashh/continue-task2` 本機與遠端都已刪除；需要時可以從 #117 頁面還原。產生它的 Orca 工作區 `continue-task2` 的終端機與 worktree 也已關閉。
- #115、#116 仍 open。回覆草稿在〈五〉之3，**還沒貼**。

## 一、#116 Grok：回報者根本沒登入

digest 裡是送出後的畫面：使用者泡泡加上 `[data-testid="anon-paywall-sign-up-card"]`，沒有輸入框。沒有任何 selector 壞掉。真正的 bug 是 app 在送出前就以為 Grok 已登入。

原因：匿名的 `grok.com` 上，Sign in／Sign up（zh-TW 為 `登入`／`註冊`）是 **`<a>` 連結，不是 button**。v7 的 `loggedOutDetectors` 全是 button 文字偵測，所以一個都沒命中；接著 `loginDetectors` 的 `[data-testid="chat-submit"]` 在匿名首頁是可見的，`reportStatus()` 就回報 `logged_in`。

修法（只改 adapter，合併後 v1.9.5 就吃得到）：Grok adapter v7 → v8，在既有的 button 文字偵測後面加上三個：
`[data-testid="anon-paywall-sign-up-card"]`、`a[href^="/sign-in"]`、`a[href^="/sign-up"]`。

- 實測的 href 是 `/sign-in?return_to=%2F`，所以精確的 `a[href="/sign-in"]` 什麼都比不到，必須用前綴。
- 刻意**不用** `*=`：`a[href*="sign-in"]` 會讓回覆內容裡的 `https://example.com/sign-in` 把已登入的頁面判成未登入。有測試鎖住這點。
- 證據：2026-09-30 用乾淨、未登入的 Chromium 對 `https://grok.com/` 做唯讀探測（en-US 與 zh-TW，不登入、不送出）。兩個語系都是八個 `<a>`，Sign in／Sign up 兩個連結都帶 `data-slot="button"`，`chat-submit` 可見。

**風險，沒驗證**：如果已登入的 Grok 頁面上有一個**可見**的 `a[href^="/sign-in"]` 或 `/sign-up` 連結，已登入的使用者會被判成 Sign in。沒看過這種情況，但我們沒有已登入的擷取。合併前在已登入的 grok.com DevTools 跑一次：
`document.querySelectorAll('a[href^="/sign-in"],a[href^="/sign-up"],[data-testid="anon-paywall-sign-up-card"]').length` 應為 `0`。

## 二、#115 ChatGPT：新的「Chat / Work」版面

回報者的帳號拿到了 ChatGPT 的新版面（約 2026-09-25..28 依帳號逐步推出）。`data-message-author-role`、`article`、`[data-testid^="conversation-turn-"]` 全部消失，所以 v1.9.5 在這個版面上：確認不了送出、找不到回覆、也確認不了完成。

新版面的結構（真實擷取見下方證據）：

- 一個 `[data-turn-key]` 就是一整輪，**同時包住使用者訊息與回覆**。它裡面還有一層 `[data-content-search-turn-key]`。
- 使用者：`[data-content-search-unit-key$=":user"]` 與 `[data-chatgpt-search-unit-key$=":user"]` 單元，內含 `[data-user-message-bubble="true"]`（提示原文）。
- 回覆：`:assistant` 單元裡的 `[data-markdown-text-style="assistant-message"]`。狀態列（例如 "Searched 51 websites"）也是同一個屬性，但多了 `data-markdown-text-tone="tertiary"`，**不是**回覆。
- sr-only 的 `h4` "ChatGPT said:" 帶著 `data-conversation-role="assistant"`，**不能**拿來當 response selector。
- 完成：回覆之後、在單元外面的 `.turn-action-controls`（Copy／Share／Read aloud／Regenerate／More）。
- **陷阱**：使用者訊息**自己也有一排** `.turn-action-controls`（Copy message／Share prompt／Edit message）。它在一個 `opacity-0` 的祖先底下，但引擎的 `isElementVisible` 只看元素自己的樣式，所以會當成可見。第一版修正漏了這點，第二輪補上：使用者訊息裡的控制項永遠不算完成，使用者訊息裡的文字也永遠不算「思考中」標籤。

修法分兩半：

1. **引擎（要等下一版 app 才會送到使用者手上）**：`[data-user-message-bubble]` 當送出錨點；`[data-turn-key]` 就算包住錨點也算是這次的完成 turn（取最外層）；完成控制項必須在回覆之後，而且不能在使用者訊息裡；送出前的「還在產生嗎」檢查不會再被使用者那排按鈕騙成「已結束」。
2. **ChatGPT adapter v8 → v9**：response selector 加一條 `[data-markdown-text-style="assistant-message"]:not([data-markdown-text-tone="tertiary"])`。**單靠 v9，v1.9.5 在新版面上仍然確認不了完成。**這一條只是附加，舊版面原本的 selector 都沒變。

證據：
- [steipete/oracle#517](https://github.com/steipete/oracle/issues/517)（登出與登入後新版面的 DOM 對照）
- oracle 的修正 commit [9851cb3](https://github.com/steipete/oracle/commit/9851cb34d5549b4bcda5a0e2e27e69d709a9e85a)
- [avivsinai/yoetz](https://github.com/avivsinai/yoetz)（2026-09-28 的變更，以及 `h4` 的警告）
- [syamnadhg/dg-research-backend `tests/fixtures/chatgpt_0928`](https://github.com/syamnadhg/dg-research-backend/tree/master/tests/fixtures/chatgpt_0928)：2026-09-29 的真實擷取。`chatgpt-copy-button-capture.json` 就是使用者那排按鈕的證據。

範圍外：我們自己未登入探測時看到的 `/uc/<uuid>`「mobile shell」（atomic class、`[data-assistant-markdown]`）只有未登入才會出現，引擎本來就回報 `logged_out`。沒有為它加 selector。

## 三、為什麼關掉 #117

- 它在 Grok 的 `loginDetectors` 與 `inputSelectors` 加了裸的 `textarea`。匿名首頁的輸入框就是 textarea，所以匿名頁面會繼續回報 Ready，等於把 #116 的 bug 固定下來；button-only 的 `loggedOutDetectors` 也還是比不到連結。
- 它的 ChatGPT selector（`.agent-turn`、`.group/assistant-message`）在任何 Chat/Work 擷取裡都找不到，而且沒有改引擎，送出確認與完成仍會失敗。
- 內文寫 `Fixes #115, Fixes #116`，合併就會把沒修好的 issue 自動關掉。

## 四、還沒驗證，不要宣稱已完成

- ChatGPT v9 與 Grok v8 **完全沒有實機檢查**，只有自動測試。
- 已登入的 Grok 在 v8 偵測下仍是 Ready：沒驗證（〈一〉的風險）。
- Chat/Work 版面上「Pro thinking」這類狀態文字實際放在哪個元素：沒有擷取。測試把它放成 turn 的直接子 `p`，那是 fake DOM 的限制，不是證據。
- `docs/SPEC.md` §5.1 還寫 ChatGPT v8、Grok v7。

## 五、還開著的決定

### 1. 合併 PR #118 = 立刻熱更新所有安裝（ChatGPT v9、Grok v8）

合併前建議先做〈一〉那個已登入 Grok 的 DevTools 檢查。分支保護要 `--admin` 才能合併。

### 2. `docs/SPEC.md` §5.1 修訂（要 owner 同意，PR 裡沒改）

- `adapterVersion`：chatgpt `8` → `9`，grok `7` → `8`
- chatgpt `responseSelectors`：加上 `[data-markdown-text-style="assistant-message"]:not([data-markdown-text-tone="tertiary"])`
- grok `loggedOutDetectors`：在 localized button 文字偵測之後加上 `[data-testid="anon-paywall-sign-up-card"]` · `a[href^="/sign-in"]` · `a[href^="/sign-up"]`
- §5.1 開頭那句只提到 #113 的 v8 更新，要補上 #115／#116。

CI 比對的是 `scripts/check-adapters.mjs` 裡的期望值，這個 PR 已經更新。

### 3. 給回報者 Eskasia 的回覆（草稿，還沒貼）

回報者的介面是 zh-TW。建議等 #118 合併後再貼。

**#116**：

> 謝謝回報。從 digest 看，送出當下 Grok 沒有登入：送出後出現的是 Grok 的匿名註冊卡片，輸入框也被拿掉了。請在 app 的 Grok 窗格裡登入 Grok 再試一次。app 之前把未登入的 Grok 誤判為 Ready，這個偵測已在 #118 修正，合併後會透過 adapter 更新自動送到 v1.9.5，不用重裝。
>
> Thanks for the report. The digest shows Grok was not signed in: after the send Grok showed its sign-up card and removed the composer. Please sign in to Grok in the app's Grok pane and try again. The app wrongly showed signed-out Grok as Ready; #118 fixes that detection and reaches v1.9.5 through the adapter update once merged.

**#115**：

> 謝謝回報。你的 ChatGPT 帳號拿到了新的「Chat / Work」版面，它拿掉了 app 用來辨識對話的標記，所以 v1.9.5 確認不了送出與完成。修正在 #118，其中引擎的部分要等下一版 app 發布。發布後請再試一次，如果還有問題，請附上 debug 紀錄。
>
> Thanks for the report. Your ChatGPT account has the new "Chat / Work" layout, which removed the markers the app used to follow a conversation, so v1.9.5 cannot confirm the send or completion. The fix is in #118; its engine part ships in the next app release. Please retest after that release and attach a debug log if it still fails.

### 4. 下一版 app（#115 的引擎部分）

#118 合併後要出一版（v1.9.6？）才會修好 #115。發版流程與產物驗證照 `docs/HANDOFF-2026-09-24-CLAUDE.md`〈四〉。

### 5. 從前一份交接帶過來、仍未決

- Meta 要不要換掉 `inputStrategy: "default"`：**下次 Meta 卡住要一份 debug bundle**。
- `buildReportDigest()` 的 "matched" 與引擎的 "usable"：SPEC §10.2，需要 owner 拍板。

## 六、刻意關掉的，不要重開

- `chatGptUserTurnMatchesPrompt()` 的 160 字前綴問題（理由見前一份交接〈七〉）。這次也沒有動它。

## 七、環境與規矩（新增的坑）

- **Orca IDE 的 CLI 是 `/opt/Orca/resources/bin/orca-ide`**。`/usr/bin/orca` 是 GNOME 螢幕閱讀器，**不要執行**。關閉一個 session：`orca-ide terminal close --worktree path:<abs> --all --json`，再 `orca-ide worktree rm --worktree path:<abs> --json`。另一個 session 正在刪 worktree 時，runtime 可能暫時連不上；等 `orca-ide status` 回報 `reachable: true` 再重試。
- **grok 長任務**：`grok --prompt-file <f> --cwd <worktree> -m grok-4.7 --reasoning-effort xhigh --permission-mode bypassPermissions --output-format plain --max-turns N`，放背景跑。
- **測試用 fake DOM 現在有小型 CSS matcher**（`src/__tests__/engine-input.test.ts`）：支援 tag、class、`=`／`^=`／`$=`／`*=`、`:not([attr="value"])`、後代選擇器、逗號，`closest` 也用它。**不支援** `>` 子代選擇器。`compareDocumentPosition` 在同一棵樹時照樹的順序，沒有 parent 的節點照建立順序。`detectorElements` 裡登記過的 selector（即使是空陣列）優先於 CSS 比對。
- **fake DOM 的另一個限制**：`querySelectorAll('p')` 仍然只回傳直接子元素，所以測試裡的 `Pro thinking` 段落都掛在 turn 底下當直接子 `p`。
- **本機暫存**：探測原始資料、給 grok 的兩份 brief、grok 的報告都在 `/home/ted-h/tmp-scratch/mac-0930/`（本機，不在 repo）。那裡的 `wt-fix` worktree 已移除；要改 #118 就重新 `git worktree add <dir> fix/issues-115-116-provider-dom`。
- 這次的程式碼全部由 grok 4.7 寫（兩輪）。Claude review，自己重跑 `pnpm verify`，也自己做了負向控制。
- **CI 比本機慢約 3 倍**：#118 第一次跑 CI 時，本機 `pnpm verify` 全過，CI 卻失敗。三個 Chat/Work 測試超過 vitest 預設的 5 秒：本機每個 1.6–1.8 秒，runner 上整個檔案跑了 25 秒。原因是等待一直沒結束，fake DOM 在每次 10 ms 輪詢時對每個元素重新解析 selector。`1a8d256` 讓 fake DOM 快取解析過的 selector 之後，整個檔案從 8.0 秒降到 0.8 秒，CI 全綠。以後推完 PR 要用 `gh pr checks <n> --watch` 看完才算數。單一測試在本機超過約 1 秒，就要當成 CI 逾時風險：去修成本，不要調高 timeout。
- 其餘（git 身分、PATH、`--admin` 合併、debug txt 不要 commit、委派規則）同前一份交接〈八〉。

## 八、建議下一步

1. 使用者做〈一〉的已登入 Grok 檢查，同意〈五〉之1 與之2 → 合併 #118，補上 SPEC §5.1 修訂。
2. 合併後貼〈五〉之3 的兩則回覆。
3. 排下一版 app 發布，把 #115 的引擎部分送出去，然後請回報者重測。
