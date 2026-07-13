# 執行與更新指南

本文件整理 Multi-AI Chat Desktop 的日常執行與更新流程。詳細背景見 [README.zh-TW.md](../README.zh-TW.md)。

## 前置需求

- Node.js 20+
- pnpm（本專案鎖定 `pnpm@11`，可用 Corepack：`corepack enable`）
- Rust stable toolchain（Windows 需 MSVC + Visual Studio Build Tools「Desktop development with C++」）
- Windows 10/11 通常已內建 WebView2

## 執行方法

### 方法一：直接執行（開發模式）

```sh
pnpm install
pnpm build:injected   # 產生 src-tauri/gen/injected 的注入腳本
pnpm tauri dev        # 第一次 Rust 編譯較久，完成後自動開啟視窗
```

### 方法二：透過 agent 腳本（有稽核與狀態管理）

```sh
node scripts/agent/doctor.mjs --json     # 檢查前置環境
node scripts/agent/launch.mjs --wait --timeout-ms 600000 --json
node scripts/agent/status.mjs --json --lines 80   # 查狀態，state: "ready" 才算就緒
node scripts/agent/stop.mjs --json       # 停止
```

在 Claude Code 中可直接執行 `/launch-multi-ai-chat`，等同上述流程加上前後稽核。

### 方法三：安裝正式版本（非開發用）

到 [Releases](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest) 下載對應平台的安裝檔（Windows `.zip`/`x64-setup.exe`、macOS `.dmg`、Linux `.AppImage`）。

## 更新方法

### 更新原始碼（開發環境）

```sh
git pull
pnpm install          # lockfile 有變更時同步 dependencies
pnpm build:injected   # 注入腳本有變更時必須重建
pnpm tauri dev
```

### 更新後驗證

```sh
pnpm verify   # 一次跑完：build:injected + typecheck + lint + test + agent:verify + adapter 檢查
```

只想快速檢查可分開跑：

```sh
pnpm typecheck
pnpm test
```

### 更新正式版本（安裝版）

app 內建更新檢查會比對 GitHub 最新 release；有新版時到 Releases 頁下載安裝即可，本機設定與 provider 登入 profile 會保留。

## 產生執行檔

### 本機打包（開發環境）

```sh
pnpm tauri build      # 自動先建前端與注入腳本，再編譯 Rust release
```

產物位置：

- 純執行檔：`src-tauri/target/release/*.exe`
- NSIS 安裝檔：`src-tauri/target/release/bundle/nsis/*-setup.exe`

portable zip（含 `PORTABLE` 標記，停用 app 內更新 UI）：

```sh
pnpm pack:portable    # 從 src-tauri/target/release 打包到 dist/portable/
```

注意：本機 build 版本號固定為 `0.0.0`；正式版本號由 CI 從 git tag 注入。

### 正式發佈（三平台，走 CI）

推 `v*` tag 觸發 Release workflow，CI 產出 Windows `.exe`/`.zip`、macOS `.dmg`、Linux `.AppImage` 掛在 draft Release，人工審核後 Publish。完整流程與發佈前檢查見 [RELEASE.md](./RELEASE.md)。

## 常用指令一覽

| 指令 | 用途 |
|---|---|
| `pnpm tauri dev` | 開發模式執行 |
| `pnpm build` | 建置前端（vite） |
| `pnpm build:injected` | 建置注入腳本 |
| `pnpm verify` | 完整驗證（提交前建議執行） |
| `pnpm test` | 跑 vitest 測試 |
| `pnpm typecheck` | TypeScript 型別檢查 |
| `pnpm lint` | ESLint |
| `pnpm tauri build` | 產生執行檔與安裝檔（release） |
| `pnpm pack:portable` | 打包 portable zip |
