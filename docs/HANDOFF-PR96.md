# PR #96 收斂交接

- 分支：`feat/meta-ai-optional`；[PR #96](https://github.com/teddashh/multi-ai-chat-desktop/pull/96) 仍為 Open。
- 接手基準：`e3a9f9d`（本對話第一次確認的 Claude 交接後 HEAD）。
- 已驗證程式版本：`9bc46e9b2183fc9928b269832bc2cd01e557c9f3`。
- 範圍：5 個 catalog providers、恰好 4 個 active、Meta 預設 standby；沒有 merge、tag 或 release。

## 從接手到現在完成什麼

基準之後共收斂 26 個 commits：包含其他工作席位推入、這輪保留並整合的 24 個 commits，以及本輪直接完成的 2 個 commits。不是把整批進度都算成本輪新寫的功能。

1. **Meta 登入與診斷說明**：加入英／繁中／日／德登入提示，說明可用時選 email／手機、Facebook／Instagram 不支援內嵌登入；提示保持在 native webview 範圍外。補上 Meta 混合 provider 診斷篩選測試與實測紀錄。
2. **操作失敗能看見、能重試**：FocusPane 的 Login、Reload、狀態列重連、外部瀏覽器、問題回報，以及 preflight／replay 登入、GitHub issue 開啟、Settings 下載／作者／贊助連結，加入對應的錯誤呈現與重試處理。
3. **避免重複操作與過期結果**：合併同 provider 尚未完成的 Login／Reload 點擊；避免卸載後的回連結果更新 UI 或重新定位；診斷 Copy 忽略切換 provider 後的舊結果，Export 防重入且關閉 Settings 後不繼續舊匯出；更新檢查在關閉／卸載時取消。
4. **本輪修正 `75f4f74`**：序列工作流程、Brainstorm、快照重播與 App preflight 都檢查 active 名單。即使 standby 殘留 Ready 狀態，也在任何送出之前阻擋；不偷偷換掉歷史重播角色。新增 6 個先失敗、修正後通過的案例，以及 Meta 替換原四家任一 Debate 席位的 4 個順序測試。同時修正 FocusPane 測試的 TypeScript 錯誤，解除 frontend CI 阻塞。
5. **本輪修正 `9bc46e9`**：Settings 測試改由 React 產生完整 HTML 轉義的預期值，清除 CodeQL 指出的「只替換第一個單引號」finding。問題位於測試，不是正式產品的登入／導覽路徑。

原四家預設、workflow 順序、provider profile、adapter 與零 Tauri provider 權限邊界未由本輪兩個修正擴張。

## 驗證與停點

- `pnpm verify`：61 個 Vitest 檔案、676 個測試、22 個 Agent 測試，連同 typecheck、lint、注入建置與 adapter／SPEC 檢查全部通過。
- `pnpm build`：通過；仍有既有的單一 chunk 超過 500 kB 提示。
- `9bc46e9` 的遠端 10 項檢查全部通過，包括 frontend、adapters、三平台 Rust tests／Clippy、CodeQL 分析與彙總。
  - [CI 執行紀錄](https://github.com/teddashh/multi-ai-chat-desktop/actions/runs/35552833070)
  - [CodeQL 執行紀錄](https://github.com/teddashh/multi-ai-chat-desktop/actions/runs/35552830969)
- 本機 Rust 重跑曾因缺少 D-Bus／GTK／WebKitGTK 開發套件而受阻；原生驗證依據是上述三平台 CI，不能寫成本機原生測試已通過。
- **停點：READY_FOR_VM_E2E。** 表示原始碼已可交 Conductor VM QC，不表示 Meta 已完成實站 E2E。
- **Push 已完成；部署尚未確認。** 本輪尚未取得 VM 部署目標／指令；repo 的 Pages 官網部署不等於桌面程式部署，tag 打包則屬另一條 release 流程。不得將 CI 全綠寫成部署完成。

## 還沒做好的重點／下一步

1. **先部署並記錄版本**：確認目標 VM／部署方式，部署 `9bc46e9`，記錄 OS、WebView2、實際啟動版本及結果；保留既有 provider profiles。
2. **Meta 可用登入仍未證實**：既有 Windows QC 的登入導向 Facebook，email／手機和可用 guest composer 尚未成功到達。提示文字沒有解決 Meta 網站端的可用性；若沒有可用登入或 guest composer，該 session 仍不能在 app 內使用。
3. **Meta 實站送收與 workflow／Debate**：確認輸入、送出、串流擷取、完成判斷、Stop、新 session、登入後的四席 workflow／Debate；不得以 mock 測試取代實站證據。
4. **持久性與錯誤恢復**：實測重啟後 standby 選擇、各 provider profile／登入狀態；以 Meta provider error 確認篩選與 sanitized debug bundle 匯出。既有 no-login QC 已通過 Meta 篩選／log copy，不等於完整錯誤匯出與登入持久性都通過。
5. **原四家回歸**：跑 Free 與 Debate，檢查 preflight 阻擋、取消／重試，以及 ChatGPT Astra ↔ Grok Heavy 慢速交接不提前完成、不重送。macOS Grok challenge／新一輪實機登入仍是既有待驗證項目。

下一刀是 Conductor VM 測試部署與登入能力確認；若 Meta 仍只能走不支援的 Facebook 登入，應如實記錄 blocked，不擴張允許網域、不宣稱已支援登入。
