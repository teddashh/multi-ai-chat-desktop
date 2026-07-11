# Multi-AI Chat Desktop

[English](./README.md) | **繁體中文**

一個 Tauri 2 桌面控制台，用來編排你**已登入**的 ChatGPT、Claude、Gemini 與 Grok 網頁 session —— **不需 API key、不做遙測**。它不只是把幾個聊天視窗並排，而是用一個中央控制台，透過多模型 **workflow**（辯論 debate、圓桌 roundtable、諮詢 consulting、coding、自由模式 free-mode）驅動它們，並把每一家的回覆彙整回中樞。

狀態：**目前原始碼（v0.5.2 之後）** —— 控制台、五種 workflow 模式、四家網頁 session provider、可重現的執行（snapshots + replay）、可遠端 hot-update 的 per-provider adapter，以及三平台打包（Windows / macOS / Linux）皆已完成。下一個 release 發佈前，最新的安裝版仍是 v0.5.2。Portable 優先、MIT 授權，selector adapter 由社群維護。行為契約見 [`docs/SPEC.md`](./docs/SPEC.md)，設計見 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

## v0.5.2 之後的原始碼更新

- **聚焦四家 provider。** 移除未完成的第五家網頁 provider／orchestrator；web 版專注在 ChatGPT、Claude、Gemini 與 Grok。
- **桌面 agent 啟動。** Repo 內建 Codex 與 Claude Code Skill，可檢查環境並直接開啟 Tauri 原始碼版本，不需安裝程式或另外安裝 agent CLI。
- **以對話為主的版面。** 輸入框固定在右側控制台底部；五種模式卡片縮小；真正有用的一行式流程追蹤移到 provider 畫面旁，不再佔掉主要對話空間。
- **本機對話紀錄。** 可收合的側欄會保留最近 30 個本機 transcript，並提供「新對話」按鈕，同時重設四家 provider 頁面。
- **更好閱讀的結果。** 彙整回覆會安全渲染 Markdown；流程追蹤中的每段回答也能點開完整內容。
- **修復圖片回覆卡住。** ChatGPT 只產生圖片、沒有 Markdown 文字時，現在仍能正確判定完成，畫圖 prompt 不會再無限等待。
- **更久、更乾淨的診斷紀錄。** 記憶體 log 提高到 2,000 個有意義事件，並自動合併沒有變化的 provider heartbeat。
- **四種介面語言。** 設定中可選 English、繁體中文、日本語與 Deutsch。

## v0.5.2 更新重點

- **不必切到真實頁面。** ChatGPT、Claude、Gemini 與 Grok 在離屏狀態仍保持運作，workflow 可直接送出 prompt，不必逐家開啟真實頁面。
- **驗證真正送出。** 引擎會確認輸入框已清空、開始思考或出現新回覆；點擊未被接受時會重試 Enter，仍失敗則立即回報，不再卡住等待。
- **Claude prompt 不再重複。** ProseMirror 注入不會把同一段 prompt 貼上兩次。
- **輸入區更單純。** 移除用途不明的「每步先問我再送出」開關；內建 workflow 啟動後會自動執行。

## 特色

- **零 API key。** 一切都跑在你已經登入的網頁 session 上，不儲存、不索取、不傳送任何金鑰。
- **引導式首次使用。** 從清楚的 provider 選擇器開始，直接看到連線與 workflow 就緒狀態；workflow 尚未就緒時也會保留你的草稿。
- **四家 provider，一個中樞。** ChatGPT、Claude、Gemini 與 Grok。每一家各自保有獨立的登入 profile。
- **多模型 workflow。** debate、roundtable、consulting、coding、free-mode 在各 provider 間路由 prompt 並收集回覆，底層由宣告式的 graph engine 驅動，從 preset 卡片目錄一鍵挑選。
- **聚焦視圖 + 狀態列。** 同一時間只有一家 provider 上台；下方精簡狀態列列出全部四家，顯示即時狀態與下一步操作。點一下就切換焦點，也可以讓焦點自動跟隨正在回應的 provider。只有聚焦中的頁面會顯示，其餘 provider 在離屏位置保持運作，不必逐一開啟真實頁面也能繼續 workflow。
- **文字優先 center。** 聚焦的 provider 預設顯示乾淨的 DOM 抽取文字檢視；需要直接操作時再切到真實頁面。登入按鈕只在該 provider 真的需要登入時才出現在 header；重載與「回報損壞」收在 ⋯ 選單裡。
- **可重現的執行。** 可選開的執行 snapshot，附隱私分級（僅 metadata / hash / prompt 文字 / 完整本地）；點歷史圖示開啟 replay 面板，在你目前已登入的 session 上重跑任何一次過往執行。
- **本地檔案注入。** 拖放或挑選多個本地檔案附加到 prompt。
- **淺色／深色主題 + i18n。** 極簡淺色為預設，可切深色；提供 English、繁體中文、日本語與 Deutsch 語言選單。
- **可 hot-update 的 adapter。** per-provider selector adapter 可遠端更新；每個 adapter 能碰什麼，都在 Settings 裡逐家列出。broken-adapter 回報與可選開的去識別化 debug bundle 匯出，是僅有的其他對外路徑。

## 安裝

到[最新 release](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest) 下載對應的檔案。

- **Windows** —— 下載 portable `.zip` 解壓後執行 `.exe`（或用 `x64-setup.exe` 安裝檔）。若 SmartScreen 跳警告，選 *More info → Run anyway*。需要 Microsoft Edge WebView2 Evergreen Runtime。
- **macOS（Apple Silicon）** —— 開啟 `aarch64.dmg` 把 app 拖到 Applications。在尚未加上 notarization 前，若 Gatekeeper 擋首次啟動，用右鍵 → *打開*。（目前不提供 Intel 版。）
- **Linux** —— 下載 `.AppImage`，執行 `chmod +x *.AppImage` 後啟動。

## 從 Codex 或 Claude Code 啟動（免安裝程式）

Repo 內建本機桌面 Skill，會先檢查環境，再替你開啟 Tauri 原始碼版本：

- **Codex app** —— 在本機環境開啟此 repo，選擇 **Launch Multi-AI Chat**，或輸入 `$launch-multi-ai-chat`。
- **Claude Code Desktop** —— 在 **Code** 分頁選擇 **Local** session、加入此 repo，然後執行 `/launch-multi-ai-chat`。

使用桌面 app 時，不需要另外安裝 Codex 或 Claude Code CLI。基於安全設計，單純開啟 repo 不會自動執行其中的程式，因此仍需明確呼叫一次 Skill。原始碼啟動仍需要 Node.js 20+、pnpm、Rust/Cargo 與該平台的 Tauri 原生相依套件；Skill 會清楚列出缺少項目，且不會偷偷安裝系統 toolchain。Remote／雲端 session 無法在你的電腦上彈出 GUI。

## 開發

```sh
pnpm install
pnpm build:injected
pnpm verify
```

`pnpm tauri dev` 啟動 app；`pnpm tauri build` 產出安裝檔／portable 產物。Windows 上需要 MSVC C++ build tools 與 WebView2 runtime。

## 隱私與信任

不需 API key、不需專案帳號、無分析追蹤。你的登入狀態保存在本機的 per-provider WebView profile 裡；prompt 只會直接送到你選擇的 provider 頁面，Multi-AI Chat 沒有另外的對話後端。其他對外行為只有可選的 adapter hot-update，以及使用者主動開啟的 broken-adapter／issue 連結。Debug bundle 在本機產生，只有你手動要求時才會存檔。每個 adapter 的存取範圍都能在 Settings 裡查看。確切的傳輸與權限契約見 [`docs/SPEC.md`](./docs/SPEC.md)。

## 專案資訊

Sponsored by [AI-Sister.com](https://ai-sister.com)。作者 Ted Huang（[TED@TED-H.com](mailto:TED@TED-H.com)、[ted-h.com](https://ted-h.com)）。

## 授權

MIT。
