# Multi-AI Chat Desktop

[English](./README.md) · [繁體中文](./README.zh-TW.md) · **日本語** · [Deutsch](./README.de.md)

ログイン済みの **ChatGPT、Claude、Gemini、Grok** に同じ質問を送り、回答・レビュー・反論・統合を自動で進める Tauri 2 デスクトップハブです。4つのチャットを並べるだけではなく、複数AIの workflow を実行します。

**最新版：[最新の安定版をダウンロード](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest)** · MIT · APIキー不要 · 解析なし

> 本アプリは各プロバイダーのWebページを自動操作します。ページ構造の変更で adapter が一時的に動かなくなる場合があります。各サービスの利用規約と、利用権限のあるアカウント・コンテンツを使用してください。

> **プロジェクト状況：** 機能開発は完了し、最後のオプションとして4人のAI-Sister記念Themeと軽量なブレインストーミングpresetを追加しました。presetは安定した自由送信engineを再利用します。今後はprovider互換性、セキュリティ、build障害のみを保守し、既存のsnapshot／replayは拡張しません。

## v1.5.1 の更新点

- **Runtime経路をセキュリティ検査。** Geminiの状態判定はprovider hostnameの完全一致を要求し、会話とmessageのIDはWeb Cryptoと衝突しないローカルfallbackを使用します。
- **Windows source agentを安全化。** Agent-Ready Source Releaseはlauncherに必要な固定のshell-safe tokenだけを受け付け、shellの特殊文字を拒否します。
- **開発依存関係を整理。** Vitestとesbuildを更新し、既存機能を変えずに対応可能なnpm advisoryをすべて解消しました。
- **Release automationを強化。** JavaScript製GitHub ActionsをNode 24対応版へ移行し、immutable commitへの固定と最小workflow権限を採用しました。
- **継続的なrepo保護。** Dependabot security updates、週次CodeQL、保護された`main` checksが今後の保守変更を監視します。

検証内容、記録済みのGTK上流リスク、既知のplatform制限は、日英併記の [`v1.5.1 release notes`](./docs/RELEASE_NOTES_v1.5.1.md) を参照してください。

## エディション

| エディション | 用途 | 実行方法 |
|---|---|---|
| **Desktop（このrepo）** | 完全な workflow、ライブ表示、replay、snapshot、ローカルファイル | 独立したローカルプロファイルを持つ Tauri app |
| [Browser extension](https://github.com/teddashh/multi-ai-chat) | Chrome 内で軽量に使う | Side Panel から既存のAIタブを操作 |

## デスクトップ版の主な機能

- 非表示のプロバイダーにも安定して送信し、失敗時は再試行または明確なエラーを表示。
- workflow コントロールを左側 WebView の上へ移動し、右側の会話と入力欄を広く確保。
- 6つのguided presetと5つの安定したengine：自由送信、四者討論、多角相談、Coding、5ラウンド円卓討論、自由送信engineを使う多視点ブレインストーミング。
- 最大30件のローカル会話履歴と「新しい会話」。復元後の追質問には同一sessionだけの制限付きcontextを渡します。
- 見出し、ネストしたlist、link、fenced code、scroll可能なtableを安全に表示するMarkdown、画像のみの回答完了判定、snapshot／replay、2,000件の診断ログ。
- English、繁體中文、日本語、Deutsch。
- 応答言語はインターフェース言語から独立。自動では、明示的な指定、質問、会話の言語を優先し、インターフェース言語は最後のフォールバックとして使用。固定の応答言語も選択可能。
- 4人のキャラクターをproviderカード、発言状態、process row、app shellに表示する唯一のオプションTheme「AI-Sister 記念版」。第三者ページ自体は変更しません。
- Codex／Claude Code 用の repo Skill から、インストーラーなしでソース版を起動。
- Apple Silicon DMGをad-hoc署名し、release CIがアップロード前にアプリ署名を検証。

## 6つの workflow preset

| preset | 流れ | 向いている用途 |
|---|---|---|
| **自由送信** | 選択したAIが並列回答 | 比較、画像生成 |
| **四者討論** | 賛成 → 反対 → 判定 → 統合 | 主張や判断の検証 |
| **多角相談** | 独立回答2件 → レビュー → 最終回答 | 調査、セカンドオピニオン |
| **Coding** | 仕様 → Review → v1 → Test → v2 → 受入 → 最終版 | ソフトウェア設計とレビュー |
| **円卓討論** | 5ラウンド × 4 AI = 20発言 | 難題を対立させながら収束 |
| **ブレインストーミング** | 選択したAIが異なる創造的視点で並列に発想 | 多様なアイデア、型破りな選択肢、具体的な次の一歩 |

workflow 完了後も右下の入力欄から会話を続けられます。文脈をリセットする場合は「新しい会話」を選びます。

## リリース版をインストール

[Releases](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest) から取得します。

- **Windows x64：** portable `.zip` または `x64-setup.exe`。Windows 10/11 は通常 WebView2 を含みます。
- **macOS Apple Silicon：** `aarch64.dmg`。`v1.0.1` 以降はad-hoc署名済みですが、Appleのnotarizationは未実施です。Intel版は未提供です。
- **Linux x64：** `.AppImage` に `chmod +x Multi-AI*.AppImage` を実行。Ubuntu 22.04／Debian 12 以降を推奨します。

初回だけ各 provider を開いてログインします。パスワードは provider ページにのみ入力され、アプリは取得しません。

### macOSでの初回起動

1. 古い `v1.0.0` を削除し、`v1.0.1` 以降をダウンロードします。DMGを開き、アプリを **Applications** に移動します。
2. アプリを一度開いてみます。
3. 約1時間以内に **システム設定 → プライバシーとセキュリティ** の「セキュリティ」へ移動し、**このまま開く（Open Anyway）** を選んで確認します。

ad-hoc署名により誤った「アプリが破損しています」というbundle整合性エラーは防げますが、初回のセキュリティ例外を完全になくすにはApple Developer ID署名とnotarizationが必要です。管理対象Macでは例外が禁止される場合があります。

## Codex／Claude Code からソース版を起動

- Codex Skill： [`.agents/skills/launch-multi-ai-chat/SKILL.md`](./.agents/skills/launch-multi-ai-chat/SKILL.md)
- Claude Code Skill： [`.claude/skills/launch-multi-ai-chat/SKILL.md`](./.claude/skills/launch-multi-ai-chat/SKILL.md)

ディレクトリ構成は公式の [Codex Agent Skills](https://developers.openai.com/codex/skills) と [Claude Code Skills](https://docs.anthropic.com/en/docs/claude-code/skills) に準拠します。

機械可読の正本は [`agent-release.json`](./agent-release.json) で、[`agent-release.schema.json`](./agent-release.schema.json) により検証されます。信頼境界、権限、副作用、READY、audit の詳細は、バイリンガルの [`Agent-Ready Source Release contract`](./docs/AGENT-READY-SOURCE-RELEASE.md) を参照してください。

repoを開いただけではコードを実行しません。ソース起動ではcheckout本体、JavaScript依存関係のlifecycle code、Rust build script／procedural macroが実行されるため、先にrepoを確認し信頼してください。明示的なSkillは、このproject内のlocked dependencies、generated code、`tauri dev` だけを扱います。host toolchain／global packageの導入・削除、`PATH`／security設定の変更、installer生成、provider資格情報の読み取りは行いません。hostへの導入は別の操作として、別途明示的な承認が必要です。

### Codex app／CLI／IDE

1. このrepoをダウンロード／cloneし、**ローカル**の Codex project/task で開きます。
2. `$launch-multi-ai-chat` と入力するか、`/skills` から **Launch Multi-AI Chat** を選択します。
3. 必要に応じてローカルコマンド実行を許可します。
4. 初回の Rust build が終わると Tauri ウィンドウが開きます。

Codex repo Skill は app、CLI、IDE で利用できます。remote/cloud task からは手元PCにGUIを表示できません。

### Claude Code desktop／CLI／IDE

1. このrepoを、グラフィカルPC上の**ローカルshell**を持つ Claude Code surface で開きます。
2. `/launch-multi-ai-chat` を実行します。
3. dev app の実行中はrepoフォルダを移動しないでください。

desktop/browser session が remote の場合は、local Claude Code session を使うか、このフォルダで `claude` を起動して `/launch-multi-ai-chat` を実行します。

### OS別の前提条件

共通：**Node.js 20+**、pnpm（または Corepack）、stable Rust。以下は手動で前提条件を用意する例であり、Skill自体は不足項目を報告して停止します。

**Windows 10/11**

1. Node.js LTS をインストール。
2. `winget install --id Rustlang.Rustup` を実行し、MSVC toolchain を選択。
3. **Visual Studio Build Tools → Desktop development with C++** をインストール。
4. 不足している場合のみ Microsoft Edge WebView2 Evergreen Runtime を追加。

**macOS 10.15+**

1. `xcode-select --install` を実行（desktop開発だけなら完全なXcodeは不要）。
2. Node.js LTS と Rust stable をインストール。
3. SSHではなくローカルのGUI sessionからSkillを実行。

**Ubuntu／Debian**

```sh
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Node.js 20+ と Rust stable を追加し、X11／Wayland session でSkillを実行します。他のdistributionは [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) を参照してください。

### Skill コマンド

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

初回buildには数分かかる場合があります。`accepted`／`building` はREADYではなく、現在のrunが `[MAC_AGENT] READY control-pane` を出した場合だけ `state: "ready"` になります。log、process identity、before／after audit receipt はgitignored `.agent-runtime/` にだけ保存され、自動uploadされません。このローカルGUI／WebView laneには意図的にDocker版を設けません。

## 開発

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build:injected
pnpm verify
pnpm tauri dev
```

仕様：[`docs/SPEC.md`](./docs/SPEC.md) · 構成：[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · Release：[`docs/RELEASE.md`](./docs/RELEASE.md) · 検証状況：[`docs/COMPATIBILITY.md`](./docs/COMPATIBILITY.md)

## プライバシー

APIキー、独自アカウント、telemetry、会話backendはありません。promptは選択したproviderページへ直接送信され、cookieとprofileはローカルに残ります。adapter更新は任意のデータ専用JSONで、schema検証され、同梱URL範囲を拡張できません。debug bundle、export、shareは利用者が明示的に実行した場合だけ動作します。

脆弱性は [`SECURITY.md`](./SECURITY.md) に従って非公開で報告してください。Provider自動化の不具合は、アプリ内診断を確認してからGitHubの **Adapter broken** フォームで報告できます。

### コントリビューターと謝辞

[Dave Tseng（`@DaveTseng2019`）](https://github.com/DaveTseng2019) に特別な感謝を表します。`v1.3.1` のoverlay信頼性修正、[#10](https://github.com/teddashh/multi-ai-chat-desktop/pull/10)・[#11](https://github.com/teddashh/multi-ai-chat-desktop/pull/11)・[#12](https://github.com/teddashh/multi-ai-chat-desktop/pull/12)での詳細な再現と初期案、そして [#14](https://github.com/teddashh/multi-ai-chat-desktop/pull/14) でmergeされたserializer regression testに貢献しました。

再現可能な報告とsanitized debug logを共有したWindows／macOSユーザーにも感謝します。これらの報告が初回起動package、provider自動化、session継続、release検証を直接改善しました。

Sponsored by [AI-Sister.com](https://ai-sister.com)。作者 Ted Huang（[TED@TED-H.com](mailto:TED@TED-H.com)、[ted-h.com](https://ted-h.com)）。MIT License。
