# Multi-AI Chat Desktop

[English](./README.md) | **繁體中文**

一個 Tauri 2 桌面控制台，用來編排你**已登入**的 ChatGPT、Claude、Gemini、Grok 與 Claude Code 網頁 session —— **不需 API key、不做遙測**。它不只是把幾個聊天視窗並排，而是用一個中央控制台，透過多模型 **workflow**（辯論 debate、圓桌 roundtable、諮詢 consulting、coding、自由模式 free-mode）驅動它們，並把每一家的回覆彙整回中樞。

狀態：**v0.5.1** —— 控制台、五種 workflow 模式、五家網頁 session provider、可重現的執行（snapshots + replay）、人工中繼檢查點（relay checkpoints）、可遠端 hot-update 的 per-provider adapter，以及三平台打包（Windows / macOS / Linux）皆已完成並發佈。v0.5.1 著重於更清楚的首次使用流程、更安全的 workflow 啟動、無障礙操作，以及小視窗穩定性。Portable 優先、MIT 授權，selector adapter 由社群維護。行為契約見 [`docs/SPEC.md`](./docs/SPEC.md)，設計見 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

## v0.5.1 更新重點

- **第一次開啟也不必猜。** 首次使用的 provider 選擇器會說明下一步、顯示即時進度，並在需要時提供重試或登入操作。
- **保留你的輸入。** 執行前會先檢查 workflow 是否就緒；provider 尚未可用時，不再清空 prompt 草稿。
- **鍵盤與螢幕閱讀器更友善。** 對話框焦點鎖定、Esc 關閉、清楚的焦點樣式、鍵盤調整寬度、減少動態效果與更明確的標籤，讓控制台更容易操作。
- **最小視窗也能正常使用。** 在 `960×640` 下，聚焦 provider、workflow 卡片與輸入框仍保持可見，不會產生整頁溢位。

## 特色

- **零 API key。** 一切都跑在你已經登入的網頁 session 上，不儲存、不索取、不傳送任何金鑰。
- **引導式首次使用。** 從清楚的 provider 選擇器開始，直接看到連線與 workflow 就緒狀態；workflow 尚未就緒時也會保留你的草稿。
- **五家 provider，一個中樞。** ChatGPT、Claude、Gemini、Grok，以及 Claude Code（`claude.ai/code`，agentic 層）。每一家各自保有獨立的登入 profile。
- **多模型 workflow。** debate、roundtable、consulting、coding、free-mode 在各 provider 間路由 prompt 並收集回覆，底層由宣告式的 graph engine 驅動，從 preset 卡片目錄一鍵挑選。
- **聚焦視圖 + 狀態列。** 同一時間只有一家 provider 上台；下方精簡狀態列列出全部五家，顯示即時狀態與下一步操作。點一下就切換焦點，也可以讓焦點自動跟隨正在回應的 provider。永遠只渲染聚焦那一家的頁面，其餘保持背景待命、完全隱藏。
- **文字優先 center。** 聚焦的 provider 預設顯示乾淨的 DOM 抽取文字檢視；需要直接操作時再切到真實頁面。登入按鈕只在該 provider 真的需要登入時才出現在 header；重載與「回報損壞」收在 ⋯ 選單裡。
- **可重現的執行。** 可選開的執行 snapshot，附隱私分級（僅 metadata / hash / prompt 文字 / 完整本地）；點歷史圖示開啟 replay 面板，在你目前已登入的 session 上重跑任何一次過往執行。
- **人工中繼檢查點。** 勾選輸入框旁的「每步先問我再送出」（多步驟 preset 才會出現），即可在序列步驟之間暫停，檢視或編輯草稿後再送出 —— 絕不會替你自動送出。
- **本地檔案注入。** 拖放或挑選多個本地檔案附加到 prompt。
- **淺色／深色主題 + i18n。** 極簡淺色為預設，可切深色；提供 English 與繁體中文語言選單。
- **可 hot-update 的 adapter。** per-provider selector adapter 可遠端更新；每個 adapter 能碰什麼，都在 Settings 裡逐家列出。broken-adapter 回報與可選開的去識別化 debug bundle 匯出，是僅有的其他對外路徑。

## 安裝

到[最新 release](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest) 下載對應的檔案。

- **Windows** —— 下載 portable `.zip` 解壓後執行 `.exe`（或用 `x64-setup.exe` 安裝檔）。若 SmartScreen 跳警告，選 *More info → Run anyway*。需要 Microsoft Edge WebView2 Evergreen Runtime。
- **macOS（Apple Silicon）** —— 開啟 `aarch64.dmg` 把 app 拖到 Applications。在尚未加上 notarization 前，若 Gatekeeper 擋首次啟動，用右鍵 → *打開*。（目前不提供 Intel 版。）
- **Linux** —— 下載 `.AppImage`，執行 `chmod +x *.AppImage` 後啟動。

## 開發

```sh
pnpm install
pnpm build:injected
pnpm verify
```

`pnpm tauri dev` 啟動 app；`pnpm tauri build` 產出安裝檔／portable 產物。Windows 上需要 MSVC C++ build tools 與 WebView2 runtime。

## 隱私與信任

不需 API key、不需帳號、無分析追蹤。你的登入狀態保存在本機的 per-provider WebView profile 裡。App 不會把你的對話送到任何地方 —— 唯一的對外行為只有：可選開的 adapter hot-update、可選開的 broken-adapter 回報，以及手動的去識別化 debug bundle 匯出。每個 adapter 的存取範圍都能在 Settings 裡查看。確切的傳輸與權限契約見 [`docs/SPEC.md`](./docs/SPEC.md)。

## 授權

MIT。
