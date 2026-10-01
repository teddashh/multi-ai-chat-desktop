# 交接紀錄：GitHub #115（ChatGPT Chat/Work 版面）與 #116（Grok 未登入），v1.9.6

日期：2026-09-30。給下一個 session。這份是交接，不是新規格。行為契約仍以 `docs/SPEC.md` 與目前的 `main` 為準。
前一份是 `docs/HANDOFF-2026-09-24-CLAUDE.md`（v1.9.4 → v1.9.5），本份接續它。

## 現在停在哪

- `main` @ `da21f4f`（`docs: point Latest downloads at v1.9.6 (#121)`），之後只有這份交接（#119）。
- **v1.9.6 是 Latest**（2026-09-30 發布），tag 指向 `ef82ca4`。產物驗證見〈五〉。
- #118 已合併為 `be6d878`：引擎修正、ChatGPT adapter v9、Grok adapter v8，以及 SPEC §5.1 修訂（`0a3b06b`，擁有者已同意）。合併當下 adapter 熱更新就上線，raw.githubusercontent 的 `main` 回傳 chatgpt `9`、grok `8`。
- #120（v1.9.6 發版說明）合併為 `ef82ca4`；#121（四語 README 與官網指向 v1.9.6，發版說明補上產物驗證與 Published 連結）合併為 `da21f4f`。
- #115、#116 都已回覆並關閉。**#115 是 #118 合併時被自動關掉的**：PR 描述原本寫了一句「這裡刻意不寫 Fixes」，但字面是 `"Fixes": #115`，GitHub 照樣當成關閉關鍵字。回覆是在 v1.9.6 發布後才貼的，所以結果一致。之後 PR 描述裡不要讓關閉關鍵字緊貼 `#編號`。
- #117 已關閉，被 #118 取代，理由見〈三〉。
- 本機分支只剩 `main`，暫存 worktree 都已移除。

## 一、#116 Grok：回報者根本沒登入

digest 裡是送出後的畫面：使用者泡泡加上 `[data-testid="anon-paywall-sign-up-card"]`，沒有輸入框。沒有任何 selector 壞掉。真正的 bug 是 app 在送出前就以為 Grok 已登入。

原因：匿名的 `grok.com` 上，Sign in／Sign up（zh-TW 為 `登入`／`註冊`）是 **`<a>` 連結，不是 button**。v7 的 `loggedOutDetectors` 全是 button 文字偵測，所以一個都沒命中；接著 `loginDetectors` 的 `[data-testid="chat-submit"]` 在匿名首頁是可見的，`reportStatus()` 就回報 `logged_in`。

修法（只改 adapter，v1.9.5 也吃得到）：Grok adapter v7 → v8，在既有的 button 文字偵測後面加上三個：
`[data-testid="anon-paywall-sign-up-card"]`、`a[href^="/sign-in"]`、`a[href^="/sign-up"]`。

- 實測的 href 是 `/sign-in?return_to=%2F`，所以精確的 `a[href="/sign-in"]` 什麼都比不到，必須用前綴。
- 刻意**不用** `*=`：`a[href*="sign-in"]` 會讓回覆內容裡的 `https://example.com/sign-in` 把已登入的頁面判成未登入。有測試鎖住這點。
- 證據：2026-09-30 用乾淨、未登入的 Chromium 對 `https://grok.com/` 做唯讀探測（en-US 與 zh-TW，不登入、不送出）。兩個語系都是八個 `<a>`，Sign in／Sign up 兩個連結都帶 `data-slot="button"`，`chat-submit` 可見。

**已登入會不會被誤判：用正式站程式碼查過，但沒有實機擷取。** 2026-09-30 抓下 grok.com 首頁引用的 35 個正式版 JS chunk：

- `/sign-in?return_to=` 與 `/sign-up?return_to=` 這兩個 `<a>` 只由一個元件產生，只用在 `AnonSettings`。`AvatarDropdownMenu` 的寫法是 `useSession().user ? 頭像選單（含 Sign Out） : <AnonSettings/>`，所以有登入就不會畫出這兩個連結。
- 付費牆卡片是 `SignUpInlineCard`（文案鍵 `anon-paywall.sign-up-card.*`，預設位置 `blocked-submission`），是匿名註冊卡。
- 其他 `/sign-in` 都是 401 或 session 遺失時的 `window.location` 導向，不是連結；其餘命中是翻譯字串或 toast。
- 獨立旁證：jackwener/OpenCLI 的 `clis/grok/utils.js` 把「輸入框旁邊有可見的 Sign in／Log in」當成未登入。

原始筆記在本機 `/home/ted-h/tmp-scratch/mac-0930/probe/grok-signed-in-evidence.md`。有機會時仍請在已登入的 grok.com DevTools 跑一次：
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

1. **引擎（隨 v1.9.6 出貨）**：`[data-user-message-bubble]` 當送出錨點；`[data-turn-key]` 就算包住錨點也算是這次的完成 turn（取最外層）；完成控制項必須在回覆之後，而且不能在使用者訊息裡；送出前的「還在產生嗎」檢查不會再被使用者那排按鈕騙成「已結束」。
2. **ChatGPT adapter v8 → v9**：response selector 加一條 `[data-markdown-text-style="assistant-message"]:not([data-markdown-text-tone="tertiary"])`。**單靠 v9，v1.9.5 在新版面上仍然確認不了完成**，要 v1.9.6。這一條只是附加，舊版面原本的 selector 都沒變。

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

- ChatGPT v9、Grok v8 與 v1.9.6 的引擎修正**完全沒有實機檢查**，只有自動測試。
- 已登入的 Grok 在 v8 偵測下仍是 Ready：只有正式站程式碼的證據（〈一〉），沒有實機擷取。
- Chat/Work 版面上「Pro thinking」這類狀態文字實際放在哪個元素：沒有擷取。測試把它放成 turn 的直接子 `p`，那是 fake DOM 的限制，不是證據。
- v1.9.6 的產物沒有實際啟動過。`docs/RELEASE.md` 要求的 Windows 與 Apple Silicon 煙霧測試沒做（v1.9.5 也沒做）。

## 五、v1.9.6 發版與產物驗證

流程：#118 合併 → #120（發版說明）合併 → 在 `ef82ca4` 打 annotated tag `v1.9.6` → Release workflow 約 10 分鐘，三平台全過 → 驗證產物 → 發布為 Latest → #121。

產物驗證（方法照 `docs/HANDOFF-2026-09-24-CLAUDE.md`〈四〉，細節在 `docs/RELEASE_NOTES_v1.9.6.md` 的最後一條）：

- 四個產物的 SHA-256 與 GitHub 記錄的 digest 相同；portable zip `unzip -t` 通過，`PORTABLE` 標記在。
- 這次比計數更嚴：本機從 `ef82ca4` 建出的 `engine.js`（97,107 位元組）與 `bootstrap.js`，**整份原封不動**出現在四個二進位裡。五個 adapter JSON 也整份出現（`src-tauri/src/adapters.rs` 的 `include_str!`）；**Windows 二進位裡是 CRLF 換行**，比對時要先把 `\n` 換成 `\r\n`。
- 前端：四個二進位都嵌 `/assets/index-BlEOEqEe.js` 與 `/assets/index-DZ7I9tS3.css`，本機重建相同。**這次前端原始碼沒改，JS 內容和 v1.9.5 的 `index-BRFj9pkS.js` 逐位元組相同，檔名卻變了**：Tailwind 的 `content` 是 `./src/**/*.{ts,tsx}`，連測試檔也掃，新測試 fixture 裡的 `opacity-0` 讓 CSS 多一條規則，CSS 雜湊變了，入口 chunk 的檔名跟著變。無害；若想避免，可以把 `src/__tests__` 排除在 Tailwind `content` 之外（沒做，需要時再說）。
- 版本：兩個 Windows exe 的 PE `FileVersion`／`ProductVersion` 都是 1.9.6，`Info.plist` 兩個 key 都是 1.9.6，三個 bundler 檔名都是 1.9.6；Linux 二進位照例沒有版本字串。安裝版與 portable exe 照例差 3 個位元組。

## 六、還開著的決定（從前一份交接帶過來）

- Meta 要不要換掉 `inputStrategy: "default"`：**下次 Meta 卡住要一份 debug bundle**。
- `buildReportDigest()` 的 "matched" 與引擎的 "usable"：SPEC §10.2，需要 owner 拍板。

## 七、刻意關掉的，不要重開

- `chatGptUserTurnMatchesPrompt()` 的 160 字前綴問題（理由見前一份交接〈七〉）。這次也沒有動它。

## 八、環境與規矩（新增的坑）

- **Orca IDE 的 CLI 是 `/opt/Orca/resources/bin/orca-ide`**。`/usr/bin/orca` 是 GNOME 螢幕閱讀器，**不要執行**。關閉一個 session：`orca-ide terminal close --worktree path:<abs> --all --json`，再 `orca-ide worktree rm --worktree path:<abs> --json`。另一個 session 正在刪 worktree 時，runtime 可能暫時連不上；等 `orca-ide status` 回報 `reachable: true` 再重試。
- **grok 長任務**：`grok --prompt-file <絕對路徑> --cwd <worktree> -m grok-4.7 --reasoning-effort xhigh --permission-mode bypassPermissions --output-format plain --max-turns N`，放背景跑。`--prompt-file` 用相對路徑時是相對 `--cwd` 解析，會找不到檔案，所以要給絕對路徑。
- **測試用 fake DOM 現在有小型 CSS matcher**（`src/__tests__/engine-input.test.ts`）：支援 tag、class、`=`／`^=`／`$=`／`*=`、`:not([attr="value"])`、後代選擇器、逗號，`closest` 也用它。**不支援** `>` 子代選擇器。`compareDocumentPosition` 在同一棵樹時照樹的順序，沒有 parent 的節點照建立順序。`detectorElements` 裡登記過的 selector（即使是空陣列）優先於 CSS 比對。解析結果有快取（`1a8d256`）。
- **fake DOM 的另一個限制**：`querySelectorAll('p')` 仍然只回傳直接子元素，所以測試裡的 `Pro thinking` 段落都掛在 turn 底下當直接子 `p`。
- **本機暫存**：探測原始資料、給 grok 的 brief、grok 的報告、產物與解包結果都在 `/home/ted-h/tmp-scratch/mac-0930/`（本機，不在 repo）。
- 這次的程式碼全部由 grok 4.7 寫（三輪），SPEC 修訂、發版說明、README／官網也由 grok 起稿。Claude review、修改措辭、自己重跑 `pnpm verify`，也自己做了負向控制與產物驗證。
- **CI 比本機慢約 3 倍**：#118 第一次跑 CI 時，本機 `pnpm verify` 全過，CI 卻失敗。三個 Chat/Work 測試超過 vitest 預設的 5 秒：本機每個 1.6 到 1.8 秒，runner 上整個檔案跑了 25 秒。原因是等待一直沒結束，fake DOM 在每次 10 ms 輪詢時對每個元素重新解析 selector。`1a8d256` 讓 fake DOM 快取解析過的 selector 之後，整個檔案從 8.0 秒降到 0.8 秒，CI 全綠。以後推完 PR 要用 `gh pr checks <n> --watch` 看完才算數。單一測試在本機超過約 1 秒，就要當成 CI 逾時風險：去修成本，不要調高 timeout。
- **PR 描述裡的關閉關鍵字**：見〈現在停在哪〉的 #115。`"Fixes": #115` 這種寫法也會觸發。
- 其餘（git 身分、PATH、`--admin` 合併、debug txt 不要 commit、委派規則）同前一份交接〈八〉。

## 九、建議下一步

1. 等回報者（Eskasia）用 v1.9.6 重測 #115。若仍失敗，拿新的 debug 紀錄看 Chat/Work 的實際 DOM，尤其是「Pro thinking」狀態文字放在哪個元素（〈四〉）。
2. 有已登入的 Grok 帳號時，跑〈一〉的 DevTools 檢查。
3. 有 Windows 或 Apple Silicon 機器時，補 v1.9.6 的煙霧測試（`docs/COMPATIBILITY.md` 的 Release smoke checklist），並只把實際看到的結果寫進 `docs/COMPATIBILITY.md`。
4. 〈六〉的兩個決定。
