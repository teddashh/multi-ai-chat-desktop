# Multi-AI Chat Desktop

[English](./README.md) · **繁體中文** · [日本語](./README.ja.md) · [Deutsch](./README.de.md)

問一個問題，讓你已登入的 **ChatGPT、Claude、Gemini 與 Grok** 互相回答、審查、質疑，再把結果收斂。Multi-AI Chat Desktop 是 Tauri 2 多 AI workflow 中樞，不只是把四個聊天視窗並排。

**目前版本：[下載最新穩定版](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest)** · MIT · 不需 API Key · 無分析追蹤

> 本專案會自動操作你原本就在使用的 provider 網頁。第三方頁面改版可能暫時使 adapter 失效；自動化使用也可能受各服務條款約束。請只使用你有權使用的帳號與內容。

> **專案狀態：** 功能開發已完成，最後一套可選的 AI-Sister 四角色同框紀念 Theme 與 12 輪「腦力激盪」預設已加入；之後僅維護 provider 相容性、安全問題與 build 失敗。腦力激盪的每一輪都由四家各回答一次，共 48 次發言，並輪換發言順序、保留同一 session 的完整前文；現有 snapshot／replay 會原樣保留且不再擴充。

## v1.6.1 更新重點

- **Workflow 進度完整在地化。** 模式狀態、輪次／階段、角色名稱、流程追蹤與 Replay 都會跟隨 English、繁體中文、日本語或 Deutsch，不再於英文介面混入「第一輪」等中文標籤。
- **可驗證的對話邊界。** 開啟本機歷史記錄時會保留 provider 頁面連線；第一次追問前才建立乾淨的遠端 thread，並確認 WebView 已切到新的 boot，才送入同一 session 的上下文。Reset 失敗時不會送出任何內容，草稿也會保留供重試。
- **可預期的新對話。** 連按「新對話」會沿用目前的空白 session，不再製造重複項目；模式、preset、逐字稿狀態與下一次遠端送出仍會完整重設。
- **Consult 容錯改善。** 兩個首輪 AI 都只回傳錯誤或略過時，流程會直接停止，不再要求第三家審查無效文字；只要仍有一份可用回答，就會照常進入審查與總結。
- **完整整合貢獻者修正。** Dave Tseng 的 PR #23、#31、#32 均保留原作者 commit，並由 maintainer 補上 boot gate、graph version、語系與 regression coverage。

完整驗證、貢獻者致謝、已記錄的 GTK 上游風險與平台限制，請見雙語版 [`v1.6.1 發布說明`](./docs/RELEASE_NOTES_v1.6.1.md)。

## 選擇適合的版本

| 版本 | 適合情境 | 執行方式 |
|---|---|---|
| **Desktop（本 repo）** | 完整 workflow、聚焦真實頁面、replay、snapshot、本機檔案 | Tauri app 與獨立的本機 provider profile |
| [瀏覽器外掛](https://github.com/teddashh/multi-ai-chat) | 在 Chrome 裡輕量使用 | Side Panel 控制你既有的 provider 分頁 |

## 桌面版包含什麼

- **可靠的離屏自動化。** 不必逐家點進「真實頁面」；送出未被接受時會重試，真的失敗就明確回報，不再無限等待。
- **以對話為主的版面。** 模式卡片、說明與等待狀態移到左側 provider WebView 上方；右側保留更大的逐字稿與輸入區。
- **六個引導預設、五種穩定模式。** 自由分送、四方辯證、多方諮詢、Coding、五輪道理辯證，以及 12 輪 × 4 家、共 48 次發言的多視角腦力激盪。
- **本機 session。** 可新增對話，或開啟最多 30 個只保存在這台電腦的近期 transcript；恢復後的追問只帶入同一 session 的有限上下文。
- **Markdown 結果。** 安全顯示標題、巢狀清單、連結、引用、fenced code 與可橫向捲動的表格。
- **圖片完成判定。** ChatGPT 只產生圖片、沒有文字時也能結束流程。
- **可重現執行。** 可選 snapshot、隱私分級、replay、provider 診斷與 2,000 筆去重 log。
- **四種 UI 語言。** English、繁體中文、日本語、Deutsch。
- **依問題判斷回覆語言。** 自動模式會依序採用明確指定、問題語言、對話語言，最後才以 UI 語言作為備援；也可以另外固定回覆語言。
- **AI-Sister 紀念版。** 唯一一套四角色紀念 Theme，把角色加入 provider 卡片、發言狀態、流程列與 app shell，但不修改第三方網頁本身。
- **Repo Skills。** Codex 與 Claude Code 可檢查環境並從原始碼開啟 app，不需安裝檔。
- **較安全的 macOS 封裝。** Apple Silicon DMG 使用 ad-hoc 簽章，release CI 會在上傳前驗證裡面的 app 簽章。

## 六個 workflow 預設

| 預設 | 流程 | 適合用途 |
|---|---|---|
| **自由分送** | 勾選的 AI 平行回答 | 快速比較、畫圖 prompt |
| **四方辯證** | 正方 → 反方 → 判官 → 綜合 | 檢驗決策或論點 |
| **多方諮詢** | 兩份獨立回答 → 審查 → 最終答案 | 研究與第二意見 |
| **Coding** | 規格 → 審查 → v1 → 測試 → v2 → 驗收 → 最終版 | 結構化軟體規劃與 review |
| **道理辯證** | 5 輪 × 4 家 = 20 次發言 | 對困難題目慢慢攻防、收斂 |
| **腦力激盪** | 12 輪 × 4 家 = 48 次發言；輪換順序，依序完成問題框定 → 發散 → 交叉激發 → 分群選擇 → 概念驗證 | 帶完整前文的點子深化、平衡方案組合與首輪實驗 |

腦力激盪刻意設計成最重的預設：請先登入四家網頁 session，並預留約 45–90 分鐘。Claude 目前的消費者網站要求帳號登入；本 app 只會辨識並引導官方登入流程，不會繞過 provider 的登入或安全驗證。

流程結束後可直接在右下輸入框繼續同一段對話；需要乾淨上下文時再按「新對話」。

## 安裝正式版本

到 [Releases](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest) 下載：

- **Windows x64：** portable `.zip` 或 `x64-setup.exe`。Windows 10/11 通常已內建 WebView2，缺少時安裝檔可下載補上。
- **macOS Apple Silicon：** `aarch64.dmg`。`v1.0.1` 起使用 ad-hoc 簽章，但尚未經 Apple notarization。目前沒有 Intel 版。
- **Linux x64：** `.AppImage`，先執行 `chmod +x Multi-AI*.AppImage`。建議 Ubuntu 22.04／Debian 12 或更新版本。

第一次開啟時，逐家開啟 provider 並登入一次。密碼只進入 provider 自己的頁面與本機 WebView profile，本 app 不會索取密碼。

### macOS 第一次開啟

1. 刪除舊的 `v1.0.0`，下載 `v1.0.1` 或更新版本；打開 DMG，把 app 拖進 **Applications**。
2. 先嘗試開啟 app 一次。
3. 約一小時內前往 **系統設定 → 隱私權與安全性**，捲到「安全性」，按 **仍要打開（Open Anyway）** 並確認。

ad-hoc 簽章可避免錯誤的「app 已損毀」bundle 完整性判定，但只有 Apple Developer ID 簽章加 notarization 才能完全移除第一次啟動的安全例外流程。公司或學校管理的 Mac 可能禁止使用者自行允許。

## 用 Codex 或 Claude Code 從原始碼啟動

Repo 內建兩個必須明確呼叫的本機 Skill：

- Codex： [`.agents/skills/launch-multi-ai-chat/SKILL.md`](./.agents/skills/launch-multi-ai-chat/SKILL.md)
- Claude Code： [`.claude/skills/launch-multi-ai-chat/SKILL.md`](./.claude/skills/launch-multi-ai-chat/SKILL.md)

目錄格式遵循官方 [Codex Agent Skills](https://developers.openai.com/codex/skills) 與 [Claude Code Skills](https://docs.anthropic.com/en/docs/claude-code/skills) 規格。

機器可讀的唯一真相來源是 [`agent-release.json`](./agent-release.json)，並由 [`agent-release.schema.json`](./agent-release.schema.json) 驗證。完整的信任、權限、副作用、READY 與 audit 模型見雙語版 [`Agent-Ready Source Release 契約`](./docs/AGENT-READY-SOURCE-RELEASE.md)。

單純打開 repo 絕不會自動執行。原始碼啟動會執行目前 checkout、JavaScript dependency lifecycle code，以及 Rust build script／procedural macro，因此請先審查並信任 repo。明確呼叫 Skill 後，它只可安裝此專案的 locked dependencies、建置 generated code 並啟動 `tauri dev`；不會安裝或移除 host toolchain／全域套件、不改 `PATH` 或安全設定、不產生安裝檔，也不讀 provider credential。任何 host 安裝都是另一項工作，必須另行明確同意。

### Codex app、CLI 或 IDE

1. 下載／clone repo，並在 Codex 用**本機** project／task 開啟資料夾。
2. 輸入 `$launch-multi-ai-chat`，或從 `/skills` 選 **Launch Multi-AI Chat**。
3. 若 Codex 安全設定要求，允許執行本機指令。
4. 第一次 Rust 編譯完成後，Tauri 視窗會自動出現。

Repo Skill 可在 Codex app、CLI 與 IDE 使用。雲端／remote task 可以改程式，但不能把 GUI 顯示在你的電腦上。

### Claude Code desktop、CLI 或 IDE

1. 用具有「你這台圖形電腦上的本機 shell」的 Claude Code surface 開啟 repo。
2. 執行 `/launch-multi-ai-chat`。
3. 開發版執行期間不要移動或刪除 repo 資料夾。

若 Claude desktop／browser session 是 remote，請改用本機 Claude Code session；或在此資料夾的 terminal 執行 `claude`，再呼叫 `/launch-multi-ai-chat`。

### 各平台原始碼前置環境

共同需求：**Node.js 20+**、pnpm（或 Corepack）與 stable Rust toolchain。以下是人工安裝前置環境的範例；Skill 本身只會指出缺少項目並停止。

**Windows 10/11**

1. 安裝 Node.js LTS。
2. 執行 `winget install --id Rustlang.Rustup`，使用 MSVC toolchain。
3. 安裝 **Visual Studio Build Tools → Desktop development with C++**。
4. 只有系統真的缺少時，才安裝 Microsoft Edge WebView2 Evergreen Runtime。

**macOS 10.15+**

1. 執行 `xcode-select --install`；只開發桌面版不必安裝完整 Xcode。
2. 安裝 Node.js LTS 與 Rust stable。
3. 從本機圖形登入 session 啟動 Skill，不要用 SSH。

**Ubuntu／Debian**

```sh
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

接著安裝 Node.js 20+、Rust stable，並在 X11／Wayland 圖形 session 執行 Skill。其他 distribution 請參考 [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)。

### Skill 生命週期指令

```sh
node scripts/agent/audit.mjs --phase before --write --json
node scripts/agent/doctor.mjs --json
node scripts/agent/launch.mjs --dry-run --json
node scripts/agent/launch.mjs --wait --timeout-ms 600000 --json
node scripts/agent/status.mjs --json --lines 80
node scripts/agent/audit.mjs --phase after --write --json
node scripts/agent/stop.mjs --json
pnpm agent:verify
```

第一次 Rust build 可能要幾分鐘。`accepted`／`building` 都不代表就緒；只有本次啟動出現 `[MAC_AGENT] READY control-pane` 才會回報 `state: "ready"`。Log、process identity 與 before／after audit receipt 都只留在 gitignored `.agent-runtime/`，不會自動上傳。這條本機 GUI／WebView 通道刻意不提供 Docker 版本。

## 開發

```sh
corepack enable        # 系統還沒有 pnpm 時才需要
pnpm install --frozen-lockfile
pnpm build:injected
pnpm verify
pnpm tauri dev
```

`pnpm tauri build` 產生各平台套件。詳細契約見 [`docs/SPEC.md`](./docs/SPEC.md)、[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)、[`docs/RELEASE.md`](./docs/RELEASE.md)，實際驗證狀態見 [`相容性矩陣`](./docs/COMPATIBILITY.md)。

## 隱私與網路行為

- 不需 API Key、專案帳號、telemetry 或額外對話後端。
- Prompt 直接送往使用者勾選的 provider 頁面。
- Provider cookie 與 profile 留在本機 app data。
- Adapter 更新是可選、純資料格式，會驗證 schema，而且不能擴大 app 內建的 URL 範圍。
- Debug bundle 只有使用者要求時才在本機建立。
- 匯出／分享只有在明確按下功能後才執行。

## 專案資訊

安全漏洞請依 [`SECURITY.md`](./SECURITY.md) 私下回報。Provider 自動化失效時，請先檢查 app 產生的診斷預覽，再使用 GitHub 的 **Adapter broken** 表單。

### 貢獻者與致謝

特別感謝 [Dave Tseng（`@DaveTseng2019`）](https://github.com/DaveTseng2019)：他貢獻了 `v1.3.1` 的 overlay 可靠性修正，在 [#10](https://github.com/teddashh/multi-ai-chat-desktop/pull/10)、[#11](https://github.com/teddashh/multi-ai-chat-desktop/pull/11)、[#12](https://github.com/teddashh/multi-ai-chat-desktop/pull/12) 提供仔細的重現與原始修法，並在 [#14](https://github.com/teddashh/multi-ai-chat-desktop/pull/14) 補上已合併的 serializer regression tests。

也感謝提供可重現回報與已清理 debug log 的 Windows、macOS 使用者；這些資料直接改善了第一次啟動封裝、provider 自動化、session 延續與 release 驗證。

Sponsored by [AI-Sister.com](https://ai-sister.com)。作者 Ted Huang（[TED@TED-H.com](mailto:TED@TED-H.com)、[ted-h.com](https://ted-h.com)）。

MIT License。
