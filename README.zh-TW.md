# Multi-AI Chat Desktop

[English](./README.md) | **繁體中文**

一個 Tauri 2 桌面控制台，用來編排你**已登入**的 ChatGPT、Claude、Gemini、Grok 與 Claude Code 網頁 session —— **不需 API key、不做遙測**。它不只是把幾個聊天視窗並排，而是用一個中央控制台，透過多模型 **workflow**（辯論 debate、圓桌 roundtable、諮詢 consulting、coding、自由模式 free-mode）驅動它們，並把每一家的回覆彙整回中樞。

狀態：**v0.4.0** —— 控制台、五種 workflow 模式、五家網頁 session provider、可重現的執行（snapshots + replay）、人工中繼檢查點（relay checkpoints）、可遠端 hot-update 的 per-provider adapter，以及三平台打包（Windows / macOS / Linux）皆已完成並發佈。Portable 優先、MIT 授權，selector adapter 由社群維護。行為契約見 [`docs/SPEC.md`](./docs/SPEC.md)，設計見 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

## 特色

- **零 API key。** 一切都跑在你已經登入的網頁 session 上，不儲存、不索取、不傳送任何金鑰。
- **五家 provider，一個中樞。** ChatGPT、Claude、Gemini、Grok，以及 Claude Code（`claude.ai/code`，agentic 層）。每一家各自保有獨立的登入 profile。
- **多模型 workflow。** debate、roundtable、consulting、coding、free-mode 在各 provider 間路由 prompt 並收集回覆，底層由宣告式的 graph engine 驅動。
- **一大三小 focus 版面。** 所有 webview 都在左側：一個放大聚焦的視窗 + 幾個小縮圖；焦點會自動跟隨當前正在回應的 provider，也可以手動鎖定。
- **文字優先 center（v0.4.0）。** 聚焦的 provider 預設顯示乾淨的 DOM 抽取文字檢視；需要直接操作時再切到真實頁面。模型思考時會顯示「思考中…」指示。
- **可重現的執行。** 可選開的執行 snapshot，附隱私分級（僅 metadata / hash / prompt 文字 / 完整本地）；可在你目前已登入的 session 上 replay 任何一次過往執行。
- **人工中繼檢查點。** 在序列步驟之間暫停，讓你檢視或編輯草稿後再送出 —— 絕不會替你自動送出。
- **本地檔案注入。** 拖放或挑選多個本地檔案附加到 prompt。
- **淺色／深色主題 + i18n。** 極簡淺色為預設，可切深色；提供 English 與繁體中文語言選單。
- **可 hot-update 的 adapter + 診斷。** per-provider selector adapter 可遠端更新；broken-adapter 回報、診斷面板、以及可選開的去識別化 debug bundle 匯出，是唯一的對外路徑。

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

不需 API key、不需帳號、無分析追蹤。你的登入狀態保存在本機的 per-provider WebView profile 裡。App 不會把你的對話送到任何地方 —— 唯一的對外行為只有：可選開的 adapter hot-update、可選開的 broken-adapter 回報，以及手動的去識別化 debug bundle 匯出。確切的傳輸與權限契約見 [`docs/SPEC.md`](./docs/SPEC.md)。

## 授權

MIT。
