# PR #96 / v1.9.0 交接

## 決策與範圍

- 使用者已取消部署與 VM 驗證工作，授權以自動化驗證完成後正式發布；Meta AI 維持 **experimental optional standby**。
- 5 家可選、恰好 4 家啟用。ChatGPT／Claude／Gemini／Grok 仍是預設，Meta 預設備用。
- 本對話接手基準為 `e3a9f9d`。截至 `9bc46e9` 已收斂 26 個 commits（24 個既有進度＋本輪 2 個修正），其後再以多路實際 Grok CLI 審查和修正收尾。

## 接手後完成

- Meta 登入提示、AI-Sister portrait 與診斷篩選；介面說明已縮短為必要文字。
- Login／Reload／重連／外部連結／回報／重播的錯誤重試，重複點擊合併與過期結果保護。
- Settings 切換 standby 後緊接 autosave 的狀態一致性，以及儲存中 Close／Save 的交錯保護。
- Standby 不因殘留 Ready 狀態通過 workflow／replay preflight；遇到 standby 時提供「設定」入口。
- Meta 替換原四家任一席位的 Debate、Consult、Coding、Roundtable、Brainstorm 順序／快照回歸覆蓋。
- 拒絕無效 snapshot provider，避免重播默默採用預設角色。
- Meta composer 必須可見、可編輯、非 disabled／readonly／inert；送出前重新確認，登入控制仍優先判為未登入。
- 修復 frontend 型別錯誤與測試中的 CodeQL finding；四語 README／官網／release notes 同步新版資訊。

## 驗證依據

- 前一個程式收斂點 `9bc46e9`：676 個 Vitest、22 個 Agent 測試、前端 build 與遠端 10 項檢查通過。
- 本輪最終測試數與建置結果見 [v1.9.0 release notes](RELEASE_NOTES_v1.9.0.md) 及 [GitHub Actions](https://github.com/teddashh/multi-ai-chat-desktop/actions)。
- Grok CLI 分工包含 Settings、workflow/replay、engine、native lifecycle、FocusPane 和 release docs；輸出逐項審閱，未完成 verdict 的執行不計為通過。
- 原生測試／Clippy 與安裝包依 Windows、macOS、Linux CI；不宣稱本機或 VM 已跑過 native app。

## 保留的已知限制

- 沒有新的 Meta 真實登入／guest／送收／完成／Stop／新 session／Debate 實站 E2E。既有 Windows QC 登入轉向 Facebook，email／手機及可用 guest composer 未成功到達。
- Facebook／Instagram 內嵌登入不支援；若 Meta 網站未提供可用 guest 或 email／手機登入，該工作階段仍不可用。沒有擴張允許網域或繞過登入。
- 登入後 profile 持久性、真實 provider error 匯出、ChatGPT Astra ↔ Grok Heavy 慢速交接及 macOS Grok challenge，仍待使用者實機回報。
- 未知的網站 DOM／地區／配額差異仍可能造成 Meta 不可用；請以 provider、OS、版本與去識別化診斷回報，勿附帳密或對話內容。

正式發布入口：[v1.9.0](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.9.0)。本次沒有另做 VM 部署。
