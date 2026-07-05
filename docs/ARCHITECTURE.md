# Architecture Decision Record — Multi-AI Chat Desktop (Tauri)

> Status: **v1.0 FINAL** — 基於 4 份 study 報告定稿（docs/study/*.md）
> Date: 2026-07-03
> 決策者: Claude (orchestrator/plan master)，證據來源: codex feasibility study、codex multi-ai-chat study、grok tempo-term study、grok better-agent-terminal study

## 1. 產品定位（已拍板）

一個 **Tauri 2 桌面 app**（Windows 優先，NSIS installer 主軌 + portable zip 副軌）：
- **中央 control pane**（我們自己的 UI）：統一輸入、回應聚合、工作流編排（free / debate / consult / coding / roundtable 五模式承襲原版）
- **周圍多個 webview panes**：直接載入各家 AI 網頁（chatgpt.com、claude.ai、gemini.google.com、grok.com，未來擴充 claude.ai/code、agent web UI 等）
- **零 API key**：完全吃使用者在 webview 裡登入的 web session（原版核心精神）
- **Open source**：MIT（承襲原版），adapter 用社群 fork/PR 維護 + 遠端熱更新

與原 Chrome extension 的關係：**同一個心臟，換一個身體**。`createContentScript` 引擎、五模式 workflow 引擎、sidepanel UI 直接移植（原版 MIT，portability assessment 見 study §8）。

## 2. 核心架構決策

### D1: 多 webview 形態 ✅ 定稿
**決策**：單一主視窗 + Tauri 2 child webviews（`WebviewBuilder` + `Window::add_child`，需 `unstable` cargo feature）。
**證據**：tempo-term 生產環境實用（`Cargo.toml:21` unstable + `preview.rs:92-123` 對 external URL 建 child webview）；Tauri docs 確認 API 存在。
**強制守則**（feasibility Q1）：
- child webview **只能從 async command 或獨立 thread 建立**（Windows 同步 command 會 deadlock；macOS 主線程會卡 50-200ms）
- child webview 是 native layer 不是 DOM — 前端要自己管 position/size/show/hide（tempo-term `useNativePreviewWebview.ts` 模式 + overlay guard）
- 鎖 Tauri minor 版本（unstable API 會變）
**Fallback**：feature-flag 保留多 `WebviewWindow` docking 路徑（穩定 API，BAT 生產驗證），遇到 focus/z-order/平台問題時切換。

### D2: 注入機制 ✅ 定稿
**決策**：兩段式注入。
1. **Bootstrap**（`initialization_script`，builder-time，不可變）：安裝 namespaced bridge、驗證 `location.origin`、建立訊息 outbox/inbox。每次 top-level navigation 都會重跑（Tauri 保證），要用 location guard。注意 Windows 會連 subframe 都注入 — bootstrap 要自我檢查 frame。
2. **Adapter payload**（runtime `webview.eval()`）：selector 配置與引擎邏輯由 Rust 在 dom-ready 後 push 進去。selector 熱更新 = 重新 eval，不用重啟。
**證據**：feasibility Q2 CONFIRMED；tempo-term `preview.rs:92-93` 實證 external URL + initialization_script。

### D3: 遠端頁面 ↔ control pane 通訊 ✅ 定稿（重大修正）
**原傾向 local WebSocket 被否決**：AI 站的 CSP `connect-src` 很可能封鎖 localhost 連線（feasibility Q3），且網路可見性高。
**v1 決策：完全不開 remote IPC、不開 WS**。
- **Outbound（control → 頁面）**：Rust `webview.eval()` — SEND_MESSAGE、adapter 更新、CANCEL 全走這條
- **Inbound 小訊號（頁面 → Rust）**：`document.title` 編碼 + `on_document_title_changed`（tempo-term `preview.rs:94-103` 已實證）— STATUS_REPORT、thinking 狀態、DONE 訊號
- **Inbound 大 payload（RESPONSE_CHUNK 全文）**：sentinel navigation — 注入腳本 navigate 到特製 URL，Rust `on_navigation` 攔截解析並 return false（取消導航，頁面不受影響；tempo-term `preview.rs:104-115` 模式）。payload 過大時分段。
- **M1 必驗**：child `Webview` 是否支援 `eval_with_callback`（docs 只確認 `WebviewWindow` 有）— 若有，改用 Rust 定期 pull 頁面 outbox 的模型（更乾淨，取代 sentinel navigation）
- **✅ M1 gate 結果（2026-07-03）**：Tauri 2.11.x child webview 有 `eval_with_callback`，live 實測 192KB 12/12（30–72ms，比 sentinel ~300ms 快 ~6×）→ **採 callback pull 模型**（outbox + title hint + peek/ack），sentinel navigation 退場（僅留 `mac-bridge.invalid` 防禦性 block）。SPEC §7.3 已 amend；數據見 `plans/m1-bridge-findings.md`。
- **最後手段**（不到不得已不用）：scoped remote IPC — 單一 bridge command、`webviews` + `remote.urls` 雙重限縮、Rust 注入 nonce 驗證。永不給 remote origin 任何 core/fs/shell 權限（remote site 自己的 JS 與注入腳本同源，無法區分）。

### D4: Adapter 系統（社群維護的核心）✅ 定稿
- Repo 內 `adapters/<provider>.json`：URL patterns、inputSelectors、sendButtonSelectors、responseSelectors、loginDetector、isThinking 規則、injectInput 策略（`textarea` | `contenteditable` | `execCommand`）、doneDelay、chunkDebounce
- Schema 承襲原版 `ContentScriptConfig`（兩年實戰驗證）；seed 資料 = multi-ai-chat study §7 selector fragility map
- **熱更新**：Rust `reqwest` 啟動時 + 定期抓 GitHub raw（不受 CORS/CSP 限制，feasibility Q8 CONFIRMED）→ schema + 版本驗證 → 本地 last-known-good cache（GitHub 掛了 app 照常）→ `eval()` push 到各 webview
- **絕不**讓注入腳本自己在 AI 站內 fetch 配置（受該站 CSP 管轄）
- **壞掉一鍵回報**：control pane 按鈕 → dump 當前 provider DOM 摘要 → 預填 GitHub issue
- 完整性：v1 用 schema validation + 版本欄位；簽名（minisign）列 v2

### D5: Workflow 引擎位置 ✅ 定稿
control pane（local origin webview，full IPC 權限）跑 TypeScript workflow 引擎 — 原版 service-worker.ts 的 `sendAndWait`/mode handlers 演算法直接移植，transport 抽象成 `host.*` API。Rust 只做 message bus + webview 生命週期 + 遠端 fetch + 持久化。
**移植時修正原版弱點 = 四個宣告改進**（multi-ai-chat study §8 risk map；除此之外行為必須與原版一致）：
1. 連線狀態樂觀化 → 分開追蹤 `webview-loaded` / `dom-ready` / `login-detected`
2. 600s 死等 → 明確 step timeout UI + retry + skip + serial preflight（SPEC §9.2）
3. Chrome 隱式廣播語意 → 顯式 event-bus 路由表（Rust bus 為 dumb bus，waiter registry 在 TS — SPEC §7.4）
4. free mode `targets` 功能化（原版宣告未用）：ConnectionBar 可反選；預設全選 = 原版 fan-out parity（spec review 後補宣告，見 SPEC §1.1 / v1.1 changelog）

### D6: Session 持久化 ✅ 定稿
- **Windows**：每 provider 一個獨立 profile — `WebviewBuilder::data_directory(<app-data>/webviews/<provider>)`（WebView2 UDF 即 session 邊界，feasibility Q4 CONFIRMED）。不用 incognito。
- **macOS**：`data_store_identifier` 只支援 macOS ≥ 14；先用共享 default profile，隔離列 v2
- **不做 cookie 匯入/匯出**（HTTP-only + 加密 + device-bound，不可靠）
- `Webview::cookies()` 只能在 async context 呼叫（Windows deadlock 警告）

### D6b: 登入風險分級 ✅ 定稿（feasibility Q5）
| Provider | 風險 | 對策 |
|---|---|---|
| Gemini（Google 帳號） | **高 — Google 明文封鎖 embedded webview OAuth（2021 起）** | v1 標示 best-effort + 「open in system browser」引導；不做 UA spoofing 當產品策略；Gemini API key 模式列 v2 選項 |
| ChatGPT / Claude / Grok | 中 — 未明文封鎖但可隨時加檢查 | 手動 embedded login + per-provider health check + 「login blocked」明確狀態 |
| Cloudflare 挑戰 | 中 | 真實 UA、讓使用者在 webview 裡手動過挑戰 |

### D7: 打包與發佈 ✅ 定稿
- **主軌**：NSIS installer + Evergreen WebView2 bootstrapper（Win11 內建 runtime；Win10 由 bootstrapper 補）
- **副軌**：portable zip（解壓即跑 + WebView2 preflight 檢查）— BAT 已驗證此模式；**不承諾 single-exe**（WebView2 fixed runtime 250MB+，不現實）
- **Auto-update**：`tauri-plugin-updater` + minisign **只服務 installer 軌**（Windows updater artifact 本質是 NSIS/MSI，feasibility Q7）；portable 軌 v1 標示不支援自動更新（v2 再做自訂 swap-on-restart updater）
- **CI**：抄改 BAT `release.yml`（MIT）— tag-dispatch → verify → matrix build → GitHub Release + updater manifest 到固定 `manifests` release；版本號由 git tag 注入，repo 保持 `0.0.1-dev`
- Code signing：初期無證書 → SmartScreen 說明文件；後期買證書

## 3. 元件圖

```
┌─────────────────────────────── Main Window ───────────────────────────────┐
│ ┌───────────┐ ┌─────────────────────────────┐ ┌───────────┐ ┌───────────┐ │
│ │ webview:  │ │   control pane (local UI)   │ │ webview:  │ │ webview:  │ │
│ │ chatgpt   │ │  ├ 統一輸入框               │ │ claude    │ │ gemini    │ │
│ │           │ │  ├ 模式選擇(5 modes)        │ │           │ │           │ │
│ │ [bootstrap│ │  ├ 回應聚合視圖             │ │ [bootstrap│ │ [bootstrap│ │
│ │  +adapter]│ │  ├ workflow 引擎(TS)        │ │  +adapter]│ │  +adapter]│ │
│ └─────┬─────┘ │  └ 連線狀態列               │ └─────┬─────┘ └─────┬─────┘ │
│       │       └──────────────┬──────────────┘       │             │       │
└───────┼──────────────────────┼──────────────────────┼─────────────┼───────┘
        │ eval ▼ / title+nav ▲ │ Tauri IPC (local)    │             │
        └──────────────► Rust core ◄──────────────────┴─────────────┘
                    ├ message bus (route SEND/CHUNK/DONE/STATUS)
                    ├ webview lifecycle (async create/layout/show/hide)
                    ├ adapter fetch + cache (reqwest → GitHub raw)
                    └ persistence (per-provider profile dirs, settings)
```

## 4. 訊息協定（承襲原版，換 transport）

原版 `ExtensionMessage` action 集合原樣保留：
`CHECK_STATUS / STATUS_REPORT / SEND_MESSAGE / RESPONSE_CHUNK / RESPONSE_DONE / OPEN_LOGIN / GET_CONNECTIONS / CONNECTIONS_UPDATE / WORKFLOW_STATUS / ROLE_ASSIGNMENT / CANCEL_WORKFLOW`
新增：`ADAPTER_UPDATE`（熱更新推送）、`REPORT_BROKEN`（DOM 回報）、`PANE_LAYOUT`（版面控制）。
Transport 映射：outbound=eval、inbound 小=title、inbound 大=**eval_with_callback pull**（M1 gate 定案，見 D3；原 sentinel navigation 已退場）。

## 5. 開源治理

- License: MIT（原版同款）
- 可合法搬用：refs/multi-ai-chat（MIT）、refs/better-agent-terminal（MIT，保留 copyright notice）；refs/tempo-term **無 LICENSE — 只能 clean-room 重寫 pattern**
- `adapters/` 目錄 = 社群貢獻主戰場（改 selector 不用懂 Rust）
- CONTRIBUTING.md：adapter 貢獻 SOP（怎麼測、怎麼開 PR）
- adapter CI：schema validation + （後期）playwright smoke test
- **Agent-driven 開發治理**（抄 BAT 模式）：`AGENTS.md`（精簡規則）+ `CLAUDE.md`（完整規則）+ `plans/*.md`（status/motivation/進度 log/trade-offs/remaining work）。關鍵規則：pnpm 鎖版、明確 verify scripts、tag-based release、**host-api 是相容性契約（只能 additive）**
- **host-api adapter pattern**（BAT `host-api.ts`，MIT 可搬）：renderer 永不直接 `invoke`，一律走 `host.*` proxy。第一天就建立。
- 原 repo teddashh/multi-ai-chat：新增 desktop 方向指引或另開新 repo [待用戶決定]

## 6. 風險登記簿

| 風險 | 等級 | 緩解 |
|---|---|---|
| Google 登入擋 embedded browser | **確認（高）** | D6b：best-effort + system browser 引導；不賭 UA spoofing |
| unstable multi-webview API 變動/平台怪癖 | 中 | 鎖 minor 版本；async 建立守則；feature-flag fallback 多視窗 docking |
| ~~sentinel navigation~~ / title 通道容量與穩定性 | ~~中~~ 低（M1 已實測：ping med <10ms、192KB pull 12/12） | M1 gate 選定 eval_with_callback pull；title 不可用 provider 退化為 hint-less polling（SPEC §7.2）；最後才開 scoped remote IPC |
| Cloudflare 挑戰 WebView2 | 中 | 真實 UA、使用者手動過挑戰 |
| selector 脆弱 | 確認 | D4 熱更新 + 一鍵回報 + per-provider 健康檢查 |
| tempo-term 無 LICENSE | 確認 | 只學 pattern，clean-room 重寫 |
| portable 軌無自動更新 | 低 | v1 明示；v2 自訂 updater |
| solo 維護量 | 中 | adapter 社群化 + CI 自動化 |
