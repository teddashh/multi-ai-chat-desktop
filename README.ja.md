# Multi-AI Chat Desktop

[English](./README.md) · [繁體中文](./README.zh-TW.md) · **日本語** · [Deutsch](./README.de.md)

一度質問するだけで、ログイン済みの **ChatGPT、Claude、Gemini、Grok** のWebセッションが回答し、レビューし、反論しながら結果を磨きます。Multi-AI Chat Desktopは、4つのチャットを横に並べただけではない、Tauri 2製のマルチAIワークフローハブです。

[**公式サイトを見る →**](https://teddashh.github.io/multi-ai-chat-desktop/?lang=ja) · [v1.8.6をダウンロード](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.8.6) · [すべてのリリース](https://github.com/teddashh/multi-ai-chat-desktop/releases) · MIT · APIキー不要 · アナリティクスなし

> このアプリは、普段利用しているプロバイダーのWebページを自動操作します。プロバイダー側のUI変更でアダプターが一時的に動かなくなる場合があり、自動操作には各サービスの利用規約が適用されることがあります。利用権限のあるアカウントとコンテンツだけを使用してください。ログイン、契約、年齢、利用上限、セキュリティ確認を回避する機能はありません。

> **プロジェクト状況：** Webセッション版Desktopは機能凍結済みです。4プロバイダー、6プリセット、基盤となる5ワークフローモード、snapshot／replay、任意のAI-Sister 4キャラクター記念版は完成しています。今後の変更は、プロバイダー互換性、セキュリティ、データ損失／クラッシュ防止、アクセシビリティ、パッケージ、ビルド障害に限られます。

## まずインストール

現在の安定版は[**v1.8.6ダウンロードページ**](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.8.6)から入手できます。

| プラットフォーム | ダウンロード | 初回起動時の注意 |
|---|---|---|
| **Windows 10/11 x64** | `x64-setup.exe` またはportable `.zip` | 署名されていないため、SmartScreenの警告が出る場合があります。通常WebView2は導入済みで、ない場合はインストーラーが取得できます。 |
| **macOS Apple Silicon** | `aarch64.dmg` | Ad-hoc署名済みですが、Appleのnotarizationは未実施です。Intel版はありません。初回は下記の手順に従ってください。 |
| **Linux x86_64** | `.AppImage` | `chmod +x Multi-AI*.AppImage` を実行してください。Ubuntu 22.04／Debian 12以降を推奨します。 |

初回は各プロバイダーのpaneを開き、実際のプロバイダーページでログインします。認証情報とcookieはプロバイダーごとに分離されたローカルWebView profileに残り、Multi-AI Chat Desktopがパスワードを尋ねることはありません。

### macOSでの初回起動

1. 古い `v1.0.0` があれば削除し、現在のDMGを開いてアプリを「**アプリケーション**」へ移動します。
2. 一度アプリを開こうとします。
3. 約1時間以内に「**システム設定 → プライバシーとセキュリティ**」を開き、「セキュリティ」までスクロールして「**このまま開く**」を選び、確認します。

Ad-hoc署名はbundleの完全性を守り、`v1.0.0` で発生した誤った「アプリが壊れています」判定を防ぎます。ただし、この例外を完全になくせるのはDeveloper ID署名とnotarizationだけです。管理対象Macでは利用者による例外指定が禁止されている場合があります。

Windows portable版にはアプリ内更新UIがありません。[GitHub Releases](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest)から手動で更新してください。インストール版は新しいリリースを確認してダウンロードページを開けますが、アプリ自身が更新をダウンロード／インストールすることはありません。

## v1.8.6の主な変更

- **Brainstormの上限・エラーから復旧可能に。** 利用上限、bridgeのdegraded／timeout、構造化されたプロバイダーエラーで一時停止し、**再試行・スキップ・キャンセル**を選べます。スキップ時は安全なplaceholderを記録し、生のエラー文を後続promptへ渡さず次の席へ進みます。
- **Brainstorm graph v4。** 古いv3 snapshotが新しい復旧動作を暗黙に採用することはありません。再試行後のキャンセルでも予約turnを安全に片付けます。
- **ChatGPT adapter v7。** URLや権限範囲を広げず、刷新された `/auth/login` formを認識します。
- **開発依存関係のセキュリティ更新。** 修正版 `fast-uri` により4件のHigh Dependabot alertをすべて解消し、公開時点のproduction／全依存auditはいずれも既知の脆弱性0件でした。

詳細と検証範囲は[日英併記のリリースノート](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.8.6)をご覧ください。[#78](https://github.com/teddashh/multi-ai-chat-desktop/pull/78)でChatGPT adapter修正を提供した[@Rumi-3653](https://github.com/Rumi-3653)と、[#80](https://github.com/teddashh/multi-ai-chat-desktop/issues/80)でBrainstorm中断を報告した[@ufgeorge](https://github.com/ufgeorge)に感謝します。

## Desktopとブラウザー拡張のどちらを選ぶ？

| | **Desktop（このrepo）** | [**ブラウザー拡張**](https://teddashh.github.io/multi-ai-chat/?lang=ja) |
|---|---|---|
| 最適な用途 | 完全なガイド付きworkflow、実プロバイダーのfocus表示、local session、snapshot／replay、ローカルテキストファイル | Chromeと既存のプロバイダータブ内で軽量に利用 |
| 実行方式 | プロバイダーごとに独立したローカルprofileを持つTauriアプリ | Chrome Side Panelと通常のブラウザータブ |
| インストール | Windows、Apple Silicon macOS、Linux向けrelease | Chrome extensionをインストール／読み込み |
| 共通する核 | APIキー不要、実際のログイン済みWebページ、複数プロバイダー連携 | APIキー不要、実際のログイン済みWebページ、複数プロバイダー連携 |

専用ワークスペースと完全なローカルworkflow機能が必要ならDesktop、すべてをChrome内で完結したいなら拡張版が適しています。

## Desktop版に含まれるもの

- **1つの質問から連携した回答へ。** 選択したプロバイダーへ並列送信するか、構造化workflowで割り当て済みrole間に結果を受け渡します。
- **信頼性の高いバックグラウンド自動操作。** Focusしていないprovider paneも動作し、直前の完了直後に拒否された送信は1回再試行、恒久的な失敗は明示します。
- **会話中心のワークスペース。** Transcriptを画面全体へ拡大でき、provider chipで実ページと現在の読書位置を識別できます。
- **6プリセット、5つの安定モード。** Free、Debate、Consult、Coding、Roundtableと、凍結済みruntime上に追加されたBrainstorm presetです。
- **Roleを設定可能。** 4-roleの初期設定ではChatGPT、Claude、Gemini、Grokを1回ずつ使います。順次roleは同じプロバイダーを再利用できますが、並列roleは別々である必要があります。
- **ローカルで会話を継続。** 新しい会話を始めるか、このPCだけに保存された最大30件のtranscriptを再開できます。再開後のfollow-upには同じsessionの限定的な文脈だけが渡ります。
- **読みやすく忠実な出力。** 安全なsemantic Markdownで見出し、ネストしたlist、link、quote、fenced code、数式source、横scroll可能なtableを保持します。ChatGPTの画像のみの回答も完了できます。
- **再現可能な作業。** Opt-in snapshotと固定済みprivacy tier、replay、checkpoint、Markdown export、provider診断、重複除去された2,000件のin-memory logを利用できます。
- **UI言語と回答言語を分離。** UIはEnglish、繁體中文、日本語、Deutschに対応。回答言語Autoは明示指定、現在の質問、会話の順に従い、UI言語は最後のfallbackにだけ使います。
- **AI-Sister 4キャラクター記念版。** 任意のThemeはアプリ所有のUIだけを装飾し、第三者のprovider pageを変更しません。
- **Agent-ready source launch。** 明示的なCodex／Claude Code repo Skillで、installerをbuildせず前提条件を監査し、ローカルsource appを起動できます。

## Workflows

| プリセット | 流れ | 適した用途 |
|---|---|---|
| **Free** | 選択したAIが並列回答 | すばやい比較と画像prompt |
| **Debate** | 賛成 → 反対 → 判定 → 統合 | 意思決定や主張のstress test |
| **Consult** | 2つの独立回答 → Review → 最終回答 | 調査とsecond opinion |
| **Coding** | 仕様 → Reviews → v1 → Tests → v2 → Acceptance → Final | 構造化されたソフトウェア計画とreview |
| **Roundtable** | 5ラウンド × 4席 = 20件の発言 | 難しい問いを対立も含めて慎重に収束 |
| **Brainstorm** | 12ラウンド × 4つの交代席 = 48件、5段階 | 全文脈を使う発想、バランスのよい案、具体的な実験 |

構造化workflowは開始前に必要な全roleを確認します。利用できないプロバイダーがあれば、その名前を示し、open／login、role再割り当て、別modeへの切り替えを案内します。暗黙のプロバイダー置換はしません。通常の構造化workflowは継続するprovider errorで停止し、Brainstormだけは再試行・スキップ・キャンセルの明示選択まで一時停止します。

Brainstormは意図的に最も重いpresetです。標準の4 provider sessionをすべてログイン済みにし、約 **45〜90分** を見込んでください。48件すべてを含むlive復旧経路には自動テストがありますが、v1.8.6では完全な手動実行を行っていません。

Workflow完了後は画面下のcomposerから同じapp conversationを続けられます。文脈を一新する場合は「**新しい会話**」を選んでください。

## プライバシーとセキュリティ

- APIキー、Multi-AI Chatアカウント、telemetry、analytics、独自の会話backendはありません。
- Promptは選択したprovider pageへ直接送られます。各providerは自身のpolicyに従って受信・処理します。
- Providerごとのcookieとbrowser profileはローカルapp dataに留まり、snapshotや診断へコピーされません。
- Remote provider webviewは信頼しないcontentとして扱われ、**Tauri権限は0**です。App commandを呼べるのはbundled local control paneだけです。
- 任意のadapter updateはdata-only JSONで、schema検証され、app同梱のprovider／login／SSO URL範囲を拡張できません。
- Snapshotはopt-inでローカル保存され、既存の `metadata-only`、`hashes`、`prompt-text`、`full-local` privacy tierを使います。会話全文の自動uploadや共有channelはありません。
- Debug bundle、Markdown export、share／publishは利用者の明示操作でのみ実行されます。Adapter診断からはページ本文、入力値、cookie、storage、URL query／fragmentが除外されます。

脆弱性は [SECURITY.md](./SECURITY.md) に従って非公開で報告し、公開Issueへcookie、token、アカウント情報、会話、provider HTML、local profileを載せないでください。Provider自動操作のregressionは、アプリ内diagnostic previewを確認してから **Adapter broken** issue formで報告できます。

## 既知の制限と検証状況

- Provider siteは予告なく変わります。DOMやlogin flowの変更により、adapter更新まで自動入力、送信、完了検出が一時的に動かない場合があります。
- Provider account、契約、quota、地域、規約、security challengeはそのまま適用され、アプリは自動化も回避もしません。Claudeはaccount login必須、GeminiのGoogle `/sorry` blockはsystem browserの案内が必要な場合があり、Grok challengeはpane内で手動完了する必要があります。
- **Windows x64** はpackaged launchの検証実績がありますが、未署名artifactがSmartScreenを表示する場合があります。
- **macOS Apple Silicon** は部分検証です。DMGはad-hoc署名済み・notarize未実施です。以前の実機報告ではアプリを開きChatGPT、Claude、Geminiへloginできましたが、GrokはCloudflareで停止しました。現在のGrok復旧もApple Siliconでlive retestが必要です。Intel artifactはありません。
- **Linux x86_64** はCI packagingのみ検証済みで、maintainerによる新しい実機起動報告はありません。
- v1.8.6では、Grok challengeを含むlive provider loginと完全な48件Brainstorm復旧runを手動で再検証していません。ChatGPT adapter v7は焦点を絞ったlive-DOM selector evidenceのみで、アプリ内logged-out workflow全体の検証ではありません。
- Snapshot／replay／checkpointは既存互換性だけを保守します。この機能凍結版にmarketplace、graph editor、第5のprovider、新persistence schema、組み込みterminal agent、telemetry、Developer ID／notarization program、self-updaterを追加する予定はありません。

根拠は[互換性マトリクス](./docs/COMPATIBILITY.md)をご覧ください。CIや自動テストを、実際のprovider accountやdesktop deviceを操作した証拠として扱うことはありません。

## CodexまたはClaude Codeからsource起動

このrepoを開く／cloneするだけでコードが実行されることはありません。Source launchでは、信頼したcheckout、JavaScript dependency lifecycle scripts、Rust build scripts／procedural macrosが実行されるため、先にrepoをreviewしてください。

Repoには明示的に呼び出す2つのlocal Skillがあります。

- Codex：[`.agents/skills/launch-multi-ai-chat/SKILL.md`](./.agents/skills/launch-multi-ai-chat/SKILL.md) — local Codex app／CLI／IDE taskで `$launch-multi-ai-chat` を実行。
- Claude Code：[`.claude/skills/launch-multi-ai-chat/SKILL.md`](./.claude/skills/launch-multi-ai-chat/SKILL.md) — local graphical Claude Code sessionで `/launch-multi-ai-chat` を実行。

Skillが行えるのはlocked project dependencyのinstall、generated codeのbuild、`tauri dev` の起動だけです。Host toolchain／global packageのinstall・remove、`PATH`／security settingの変更、release installerのbuild、provider credentialの読み取り、receiptのupload、host変更のrollbackは行いません。Remote／cloud agentはあなたのPCにGUIを表示できず、Docker laneは意図的に用意していません。

共通の前提条件は **Node.js ^22.13.0 || >=24.0.0**、pnpm／Corepack、stable Rust、[Tauri 2の各platform prerequisites](https://v2.tauri.app/start/prerequisites/)です。最初のRust buildには数分かかる場合があります。Versioned contractは [`agent-release.json`](./agent-release.json) と [`docs/AGENT-READY-SOURCE-RELEASE.md`](./docs/AGENT-READY-SOURCE-RELEASE.md) にあります。

## 開発

```sh
corepack enable # pnpmがない場合のみ
pnpm install --frozen-lockfile
pnpm verify
pnpm tauri dev
```

よく使うlifecycle check：

```sh
node scripts/agent/doctor.mjs --json
node scripts/agent/launch.mjs --dry-run --json
node scripts/agent/launch.mjs --wait --timeout-ms 600000 --json
node scripts/agent/status.mjs --json --lines 80
node scripts/agent/stop.mjs --json
```

Source appがreadyであることを示すのは、現在runのidentity検証済み `[MAC_AGENT] READY control-pane` markerだけです。Runtime stateとbefore／after audit receiptはgitignored `.agent-runtime/` にだけ残り、自動uploadされません。`pnpm tauri build` は現在のplatform向けpackageを作成します。

動作を変更する前に[仕様](./docs/SPEC.md)、[アーキテクチャ](./docs/ARCHITECTURE.md)、[リリースガイド](./docs/RELEASE.md)、[source-launch contract](./docs/AGENT-READY-SOURCE-RELEASE.md)、[contributing guide](./CONTRIBUTING.md)を読んでください。Adapter変更はschemaとURL boundaryを維持する必要があります。

## プロジェクトと謝辞

Multi-AI Chat Desktopは **Ted Huang／TED-H**（[TED@TED-H.com](mailto:TED@TED-H.com)、[ted-h.com](https://ted-h.com)）が制作し、[AI-Sister.com](https://ai-sister.com)がスポンサーを務めるMITソフトウェアです。記念版artworkはこのプロジェクト専用の許諾で収録され、ソフトウェアのMIT Licenseで独立利用できるものではありません。[artwork notice](./src/assets/themes/ai-sister/NOTICE.md)をご確認ください。

コントリビューターへの感謝：

- [Rumi-3653](https://github.com/Rumi-3653) は [#78](https://github.com/teddashh/multi-ai-chat-desktop/pull/78) でChatGPT v7 logged-out detector修正を提供しました。
- [George Ku（`@ufgeorge`）](https://github.com/ufgeorge) は [#80](https://github.com/teddashh/multi-ai-chat-desktop/issues/80) でprovider上限によるBrainstorm中断を報告し、v1.8.6の復旧flowにつながりました。
- [Dave Tseng（`@DaveTseng2019`）](https://github.com/DaveTseng2019) は `v1.3.1` のoverlay信頼性修正、[#10](https://github.com/teddashh/multi-ai-chat-desktop/pull/10)・[#11](https://github.com/teddashh/multi-ai-chat-desktop/pull/11)・[#12](https://github.com/teddashh/multi-ai-chat-desktop/pull/12)での詳細な再現と初期案、[#14](https://github.com/teddashh/multi-ai-chat-desktop/pull/14)のserializer regression test、[#39](https://github.com/teddashh/multi-ai-chat-desktop/pull/39)・[#40](https://github.com/teddashh/multi-ai-chat-desktop/pull/40)のGrok challenge／focus stage改善、[#51](https://github.com/teddashh/multi-ai-chat-desktop/pull/51)の全幅transcript／scroll連動provider focusに貢献しました。
- [CE Lin（`@ChingEnLin`）](https://github.com/ChingEnLin) は [#41](https://github.com/teddashh/multi-ai-chat-desktop/issues/41) のprovider status報告と、[#42](https://github.com/teddashh/multi-ai-chat-desktop/pull/42) のChatGPT・Gemini・Grok adapter修正に貢献しました。
- 再現可能な報告とsanitized debug logを共有したWindows／macOSユーザーの協力により、初回起動package、provider自動操作、session continuity、release verificationが改善されました。

凍結済みmaintenance scope内のIssueとPRを歓迎します。再現可能な非security bugとmaintenanceに関する質問は [GitHub Issues](https://github.com/teddashh/multi-ai-chat-desktop/issues)をご利用ください。
