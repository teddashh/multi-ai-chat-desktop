# Multi-AI Chat Desktop

[English](./README.md) · **繁體中文** · [日本語](./README.ja.md) · [Deutsch](./README.de.md)

只問一次，讓你已登入的 **ChatGPT、Claude、Gemini 與 Grok** 網頁 session 互相回答、審查、質疑，再一起收斂結果。Multi-AI Chat Desktop 是以 Tauri 2 打造的多 AI workflow 中樞，不只是把四個聊天視窗並排。

[**前往官方網站 →**](https://teddashh.github.io/multi-ai-chat-desktop/?lang=zh-TW) · [下載 v1.8.6](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.8.6) · [所有版本](https://github.com/teddashh/multi-ai-chat-desktop/releases) · MIT · 不需 API Key · 無分析追蹤

> 本 app 會自動操作你原本就在使用的 provider 網頁。第三方介面改版可能暫時使 adapter 失效，自動化使用也可能受各服務條款約束。請只使用你有權使用的帳號與內容；本 app 不會繞過登入、訂閱、年齡、用量或安全驗證。

> **專案狀態：** 此 web-session 桌面版已停止新增功能。四家 provider、六個預設、底層五種 workflow mode、snapshot／replay，以及可選的 AI-Sister 四角色紀念版都已完成。後續只處理 provider 相容性、安全、資料遺失／crash、無障礙、封裝與 build 問題。

## 先安裝

請從 [**v1.8.6 下載頁**](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.8.6) 取得目前的穩定版。

| 平台 | 下載檔 | 第一次啟動須知 |
|---|---|---|
| **Windows 10/11 x64** | `x64-setup.exe` 或 portable `.zip` | 產物尚未簽章，SmartScreen 可能警告。系統通常已有 WebView2；缺少時安裝程式可下載。 |
| **macOS Apple Silicon** | `aarch64.dmg` | 已做 ad-hoc 簽章，但未經 Apple notarize。目前沒有 Intel 版；第一次啟動請依下方步驟操作。 |
| **Linux x86_64** | `.AppImage` | 先執行 `chmod +x Multi-AI*.AppImage`。建議 Ubuntu 22.04／Debian 12 或更新版本。 |

第一次使用時，請逐一打開 provider pane，直接在 provider 的真實頁面登入。憑證與 cookie 只留在該 provider 的獨立本機 WebView profile；Multi-AI Chat Desktop 不會向你索取密碼。

### macOS 第一次啟動

1. 移除任何舊的 `v1.0.0`，打開目前的 DMG，把 app 拖到「**應用程式**」。
2. 先嘗試開啟一次。
3. 約一小時內打開「**系統設定 → 隱私權與安全性**」，捲到「安全性」，選擇「**仍要打開**」並確認。

Ad-hoc 簽章可保護 bundle 完整性，也避免 `v1.0.0` 曾出現的錯誤「app 已損毀」訊息；只有 Apple Developer ID 簽章加 notarization 才能完全移除這個例外。受管理的 Mac 可能不允許使用者放行。

Windows portable 版不顯示 app 內更新控制，請自行到 [GitHub Releases](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest) 更新。安裝版可以檢查新版本並打開下載頁，但 app 不會自行下載或安裝更新。

## v1.8.6 更新重點

- **腦力激盪可從用量與錯誤中恢復。** 遇到用量限制、bridge degraded／逾時或結構化 provider 錯誤時，流程會暫停並提供「**重試／略過／取消**」。略過會記錄安全佔位內容後繼續，且不會把原始錯誤文字傳給後續 prompt。
- **Brainstorm graph v4。** 舊版 v3 snapshot 不會靜默套用新的恢復語意；重試後取消的保留 turn 清理也更完整。
- **ChatGPT adapter v7。** 內建 adapter 可辨識新版 `/auth/login` 表單，且沒有擴大 URL 或權限範圍。
- **開發依賴安全更新。** 已修補的 `fast-uri` 解決全部四筆 High Dependabot alerts；發布當下的 production 與完整 dependency audit 都回報零已知漏洞。

完整內容與誠實的驗證證據請見[雙語版發布說明](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.8.6)。感謝 [@Rumi-3653](https://github.com/Rumi-3653) 在 [#78](https://github.com/teddashh/multi-ai-chat-desktop/pull/78) 貢獻 ChatGPT adapter 修正，也感謝 [@ufgeorge](https://github.com/ufgeorge) 在 [#80](https://github.com/teddashh/multi-ai-chat-desktop/issues/80) 回報腦力激盪中斷問題。

## 桌面版還是瀏覽器外掛？

| | **Desktop（本 repo）** | [**瀏覽器外掛**](https://teddashh.github.io/multi-ai-chat/?lang=zh-TW) |
|---|---|---|
| 最適合 | 完整引導 workflow、聚焦真實 provider、local session、snapshot／replay 與本機文字檔 | 在 Chrome 與既有 provider 分頁中輕量使用 |
| 執行方式 | Tauri app，每家 provider 各有一份獨立本機 profile | Chrome Side Panel 加一般瀏覽器分頁 |
| 安裝 | Windows、Apple Silicon macOS 或 Linux release | 安裝／載入 Chrome extension |
| 共同核心 | 不需 API Key、使用真實登入頁面、多 provider 協作 | 不需 API Key、使用真實登入頁面、多 provider 協作 |

想要獨立工作區與完整本機 workflow 工具時選桌面版；希望所有操作都留在 Chrome 裡時選外掛版。

## 桌面版包含什麼

- **一個問題，協調多份回答。** 可讓勾選的 provider 平行作答，也能用結構化 workflow 在指定角色間接力。
- **可靠的背景自動化。** Provider pane 沒有 focus 時仍能運作；連續送出被拒會重試一次，永久失敗則明確顯示。
- **以對話為主的工作區。** Transcript 可放大到整個視窗，provider chip 讓真實頁面與目前閱讀位置都容易辨識。
- **六個預設、五種穩定模式。** 自由分送、四方辯證、多方諮詢、Coding、道理辯證，以及建立在凍結 runtime 上的額外腦力激盪預設。
- **可自訂角色。** 四角色預設會讓 ChatGPT、Claude、Gemini、Grok 各擔任一次；依序執行的角色可重複使用同一家，同時執行的角色必須分開。
- **本機 session 延續。** 可開始乾淨對話，或打開最多 30 份只存在本機的 transcript。恢復後的追問只會取得同一 session 的有限上下文。
- **可讀且忠實的輸出。** 安全的 semantic Markdown 支援標題、巢狀清單、連結、引用、fenced code 與可橫向捲動表格，並保留數學式原始內容；ChatGPT 只產生圖片時也能正常完成。
- **可重現工作。** 可選的 snapshot 與固定隱私分級、replay、checkpoint、Markdown 匯出、provider 診斷，以及 2,000 筆去重的記憶體 log 都會保留。
- **介面與回覆語言分離。** UI 支援 English、繁體中文、日本語、Deutsch。自動回覆語言會優先採用明確指示，其次是本題與對話語言，最後才用 UI 語言備援。
- **AI-Sister 四角色紀念版。** 可選 Theme 只裝飾 app 自己的介面，絕不重新 styling 第三方 provider 頁面。
- **Agent-ready 原始碼啟動。** 明確呼叫的 Codex 與 Claude Code repo Skills 可以檢查環境並開啟本機 source app，不需先 build 安裝檔。

## Workflows

| 預設 | 流程 | 適合用途 |
|---|---|---|
| **自由分送** | 勾選的 AI 平行回答 | 快速比較與畫圖 prompt |
| **四方辯證** | 正方 → 反方 → 判官 → 綜合 | 檢驗決策或論點 |
| **多方諮詢** | 兩份獨立回答 → 審查 → 最終答案 | 研究與第二意見 |
| **Coding** | 規格 → Reviews → v1 → Tests → v2 → 驗收 → 最終版 | 結構化軟體規劃與 review |
| **道理辯證** | 5 輪 × 4 席 = 20 次發言 | 對困難問題進行緩慢、對抗式收斂 |
| **腦力激盪** | 12 輪 × 4 個輪換席位 = 48 次發言，分五個階段 | 帶完整前文的發想、平衡提案組合與具體實驗 |

結構化 workflow 會先檢查所有必要角色。如果 provider 不可用，app 會指出是哪一家，讓你開啟／登入、重新指派角色或改選其他模式，不會偷偷替換 provider。一般結構化 workflow 遇到持續錯誤會停止；腦力激盪則暫停，等待你明確選擇重試、略過或取消。

腦力激盪刻意設計成最重的預設：請讓四個預設 provider session 都保持登入，並預留約 **45–90 分鐘**。完整 48 次發言的 live 恢復路徑已有自動測試，但 v1.8.6 尚未完成人工實跑驗證。

Workflow 完成後，可從底部 composer 繼續同一個 app conversation；要乾淨的 session context 時請選「**新增對話**」。

## 隱私與安全

- 不需 API Key，沒有 Multi-AI Chat 帳號、telemetry、analytics 或對話 backend。
- Prompt 直接送到你選取的 provider 頁面；provider 仍會依各自政策接收與處理內容。
- 各 provider 的 cookie 與 browser profile 保存在本機 app data，絕不複製進 snapshot 或診斷資料。
- 遠端 provider webview 一律視為不受信任，取得的 **Tauri 權限為零**；只有 bundled 本機 control pane 能呼叫 app command。
- 可選 adapter update 只是 JSON data，會經過 schema 驗證，也無法擴大 app 內建的 provider／login／SSO URL 範圍。
- Snapshot 必須選擇啟用且只存本機，保留既有的 `metadata-only`、`hashes`、`prompt-text`、`full-local` 四種隱私層級；沒有自動上傳完整對話或分享 channel。
- Debug bundle、Markdown 匯出與 share／publish 都只會在使用者明確操作後執行。Adapter 診斷會排除頁面文字、輸入值、cookie、storage、URL query 與 fragment。

安全漏洞請依 [SECURITY.md](./SECURITY.md) 私下回報；不要在公開 Issue 放入 cookie、token、帳號資料、對話、provider HTML 或本機 profile。Provider 自動化 regression 可在檢查 app 內診斷 preview 後使用 **Adapter broken** issue form。

## 已知限制與驗證狀態

- Provider 網站可能隨時改版。DOM 或登入流程變動時，自動輸入、送出或完成偵測可能暫時失效，直到 adapter 更新為止。
- Provider 帳號、訂閱、用量、區域限制、條款與安全驗證仍然適用；app 不會自動解題或繞過。Claude 必須登入帳號；Gemini 遇到 Google `/sorry` block 時可能需要系統瀏覽器指引；Grok challenge 必須在其 pane 內人工完成。
- **Windows x64** 有已驗證的 packaged launch 證據，但未簽章產物可能觸發 SmartScreen。
- **macOS Apple Silicon** 僅部分驗證。DMG 為 ad-hoc 簽章且未 notarize；較早的實機回報能開啟 app 並登入 ChatGPT、Claude、Gemini，但 Grok 卡在 Cloudflare。現行 Grok 恢復流程仍需 Apple Silicon live retest；沒有 Intel 產物。
- **Linux x86_64** 目前只有 CI packaging 驗證，沒有 maintainer 的新實機啟動報告。
- v1.8.6 尚未人工重跑 live provider 登入（含 Grok challenge）與完整 48 次發言的腦力激盪恢復。ChatGPT adapter v7 有聚焦的 live-DOM selector 證據，但不是完整 app 內 logged-out workflow。
- Snapshot／replay／checkpoint 只維護既有相容性。本功能凍結版本不規劃 marketplace、graph editor、第五家 provider、新 persistence schema、內嵌 terminal agent、telemetry、Developer ID／notarization 計畫或 self-updater。

證據詳見[相容性矩陣](./docs/COMPATIBILITY.md)。CI 與自動測試不會被包裝成「已用真實 provider 帳號或實機桌面驗證」。

## 用 Codex 或 Claude Code 從原始碼啟動

開啟或 clone 本 repo 不會自動執行任何程式。從原始碼啟動會執行你信任的 checkout、JavaScript dependency lifecycle scripts，以及 Rust build scripts／procedural macros，因此請先 review repo。

Repo 內含兩個必須明確呼叫的本機 Skills：

- Codex：[`.agents/skills/launch-multi-ai-chat/SKILL.md`](./.agents/skills/launch-multi-ai-chat/SKILL.md) — 在本機 Codex app、CLI 或 IDE task 輸入 `$launch-multi-ai-chat`。
- Claude Code：[`.claude/skills/launch-multi-ai-chat/SKILL.md`](./.claude/skills/launch-multi-ai-chat/SKILL.md) — 在具有本機圖形 session 的 Claude Code 輸入 `/launch-multi-ai-chat`。

Skills 只能安裝 locked 專案依賴、build generated code 並啟動 `tauri dev`；不會安裝／移除 host toolchain 或 global package、不改 `PATH` 或安全設定、不 build release installer、不讀 provider 憑證、不 upload receipt，也不自動 rollback host。Remote／cloud agent 無法在你的電腦顯示 GUI；本專案刻意不提供 Docker lane。

共同前提為 **Node.js ^22.13.0 || >=24.0.0**、pnpm／Corepack、stable Rust，以及 [Tauri 2 各平台 prerequisites](https://v2.tauri.app/start/prerequisites/)。第一次 Rust build 可能需要數分鐘。版本化合約位於 [`agent-release.json`](./agent-release.json) 與 [`docs/AGENT-READY-SOURCE-RELEASE.md`](./docs/AGENT-READY-SOURCE-RELEASE.md)。

## 開發

```sh
corepack enable # 只有尚未提供 pnpm 時才需要
pnpm install --frozen-lockfile
pnpm verify
pnpm tauri dev
```

常用 lifecycle check：

```sh
node scripts/agent/doctor.mjs --json
node scripts/agent/launch.mjs --dry-run --json
node scripts/agent/launch.mjs --wait --timeout-ms 600000 --json
node scripts/agent/status.mjs --json --lines 80
node scripts/agent/stop.mjs --json
```

只有目前 run 通過 identity 驗證的 `[MAC_AGENT] READY control-pane` marker 才代表 source app ready。Runtime state 與 before／after audit receipt 只留在 gitignored `.agent-runtime/`，不會自動上傳。`pnpm tauri build` 會建立目前平台的 package。

變更 behavior 前請先閱讀[規格](./docs/SPEC.md)、[架構](./docs/ARCHITECTURE.md)、[發布指南](./docs/RELEASE.md)、[source-launch 合約](./docs/AGENT-READY-SOURCE-RELEASE.md)與[貢獻指南](./CONTRIBUTING.md)。Adapter 變更必須維持 schema 與 URL boundary。

## 專案與致謝

Multi-AI Chat Desktop 是由 **Ted Huang／TED-H**（[TED@TED-H.com](mailto:TED@TED-H.com)、[ted-h.com](https://ted-h.com)）建立、[AI-Sister.com](https://ai-sister.com) 贊助的 MIT 開源軟體。紀念版 artwork 以專案特定授權收錄，不另外適用 MIT 軟體授權；詳見 [artwork notice](./src/assets/themes/ai-sister/NOTICE.md)。

貢獻者致謝：

- [Rumi-3653](https://github.com/Rumi-3653) 在 [#78](https://github.com/teddashh/multi-ai-chat-desktop/pull/78) 貢獻 ChatGPT v7 logged-out detector 修正。
- [George Ku（`@ufgeorge`）](https://github.com/ufgeorge) 在 [#80](https://github.com/teddashh/multi-ai-chat-desktop/issues/80) 回報 provider 用量造成腦力激盪中斷，促成 v1.8.6 恢復流程。
- [Dave Tseng（`@DaveTseng2019`）](https://github.com/DaveTseng2019) 貢獻 `v1.3.1` overlay 可靠性修正；在 [#10](https://github.com/teddashh/multi-ai-chat-desktop/pull/10)、[#11](https://github.com/teddashh/multi-ai-chat-desktop/pull/11)、[#12](https://github.com/teddashh/multi-ai-chat-desktop/pull/12) 提供詳細重現與原始方案；在 [#14](https://github.com/teddashh/multi-ai-chat-desktop/pull/14) 補上 serializer regression tests；透過 [#39](https://github.com/teddashh/multi-ai-chat-desktop/pull/39)、[#40](https://github.com/teddashh/multi-ai-chat-desktop/pull/40) 改善 Grok challenge 與 focus stage；並在 [#51](https://github.com/teddashh/multi-ai-chat-desktop/pull/51) 貢獻全寬 transcript 與隨捲動更新的 provider focus。
- [CE Lin（`@ChingEnLin`）](https://github.com/ChingEnLin) 在 [#41](https://github.com/teddashh/multi-ai-chat-desktop/issues/41) 提供 provider status 回報，並透過 [#42](https://github.com/teddashh/multi-ai-chat-desktop/pull/42) 貢獻 ChatGPT、Gemini 與 Grok adapter 修正。
- 提供可重現回報與 sanitized debug log 的 Windows、macOS 使用者，直接改善了第一次啟動封裝、provider 自動化、session 延續與 release 驗證。

歡迎在凍結的維護範圍內提出 Issue 或 PR。可重現的非安全 bug 與維護問題請使用 [GitHub Issues](https://github.com/teddashh/multi-ai-chat-desktop/issues)。
