# Multi-AI Chat Desktop

**English** · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [Deutsch](./README.de.md)

Ask once. Let your signed-in **ChatGPT, Claude, Gemini, and Grok** web sessions answer, review, challenge, and refine one another. Multi-AI Chat Desktop is a Tauri 2 workflow hub—not four chat windows placed side by side.

[**Visit the official website →**](https://teddashh.github.io/multi-ai-chat-desktop/) · [Download v1.8.6](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.8.6) · [All releases](https://github.com/teddashh/multi-ai-chat-desktop/releases) · MIT · no API keys · no analytics

> This app automates provider web pages you already use. Provider UI changes can temporarily break an adapter, and automated use may be subject to each provider's terms. Use only accounts and content you are authorized to use. The app never bypasses login, subscription, age, rate-limit, or security checks.

> **Project status:** the web-session desktop edition is feature-frozen. Its four providers, six presets, five underlying workflow modes, snapshot/replay tools, and optional AI-Sister Commemorative Edition are complete. Future changes are limited to provider compatibility, security, data-loss/crash prevention, accessibility, packaging, and build breakage.

## Install first

Get the current stable release from the [**v1.8.6 download page**](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.8.6).

| Platform | Download | First-launch note |
|---|---|---|
| **Windows 10/11 x64** | `x64-setup.exe` or portable `.zip` | Artifacts are unsigned, so SmartScreen may warn. WebView2 is normally present; the installer can fetch it when missing. |
| **macOS Apple Silicon** | `aarch64.dmg` | Ad-hoc signed, not Apple-notarized. No Intel build is published. Follow the steps below on first launch. |
| **Linux x86_64** | `.AppImage` | Run `chmod +x Multi-AI*.AppImage`. Ubuntu 22.04 / Debian 12 or newer is recommended. |

Open each provider pane once and sign in on the provider's real page. Credentials and cookies stay in that provider's isolated local WebView profile; Multi-AI Chat Desktop never asks for your password.

### macOS first launch

1. Remove any old `v1.0.0` copy. Open the current DMG and drag the app to **Applications**.
2. Try to open the app once.
3. Within about one hour, open **System Settings → Privacy & Security**, scroll to **Security**, choose **Open Anyway**, and confirm.

The ad-hoc signature protects bundle integrity and avoids the false “app is damaged” result seen in `v1.0.0`; only Developer ID signing plus notarization could remove this exception. Managed Macs may prohibit it.

Portable Windows builds do not show in-app update controls. Update them manually from [GitHub Releases](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest). Installed builds can check for a newer release and open its download page, but the app does not download or install updates itself.

## What's new in v1.8.6

- **Recoverable Brainstorm limits and errors.** A usage limit, bridge degradation/timeout, or structured provider error pauses the run with **Retry**, **Skip**, and **Cancel**. Skip records a safe placeholder and continues without relaying raw error text into later prompts.
- **Brainstorm graph v4.** Older v3 snapshots cannot silently inherit the new recovery semantics; reserved-turn cleanup is also hardened after retry and cancellation.
- **ChatGPT adapter v7.** The bundled adapter recognizes the redesigned `/auth/login` form without expanding URL or permission scope.
- **Development dependency security.** The patched `fast-uri` release cleared all four open High Dependabot alerts; production and full dependency audits reported no known vulnerabilities at release time.

Read the [complete bilingual release notes and validation evidence](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.8.6). Thanks to [@Rumi-3653](https://github.com/Rumi-3653) for the ChatGPT adapter fix in [#78](https://github.com/teddashh/multi-ai-chat-desktop/pull/78), and [@ufgeorge](https://github.com/ufgeorge) for the Brainstorm interruption report in [#80](https://github.com/teddashh/multi-ai-chat-desktop/issues/80).

## Desktop or browser extension?

| | **Desktop (this repository)** | [**Browser extension**](https://teddashh.github.io/multi-ai-chat/) |
|---|---|---|
| Best for | Complete guided workflows, focused live-provider view, local sessions, snapshots/replay, and local text files | Lightweight use inside Chrome with existing provider tabs |
| Runtime | Tauri app with one isolated local profile per provider | Chrome Side Panel plus normal browser tabs |
| Install | Windows, Apple Silicon macOS, or Linux release | Load/install the Chrome extension |
| Shared core | Zero API keys, real signed-in provider pages, and multi-provider collaboration | Zero API keys, real signed-in provider pages, and multi-provider collaboration |

Choose Desktop when you want a dedicated workspace and the full local workflow toolset. Choose the extension when you prefer to remain entirely inside Chrome.

## What the desktop edition includes

- **One question, coordinated answers.** Send to selected providers in parallel or let a structured workflow pass results between assigned roles.
- **Reliable background automation.** Provider panes keep working when not focused; rejected back-to-back sends retry once and permanent failures surface clearly.
- **Conversation-first workspace.** The transcript can expand across the window, while provider chips keep the live page and current reading position easy to identify.
- **Six presets, five stable modes.** Free, Debate, Consult, Coding, Roundtable, and the additional Brainstorm preset built on the frozen workflow runtime.
- **Configurable roles.** Four-role defaults assign ChatGPT, Claude, Gemini, and Grok once each. Sequential roles may reuse a provider; roles that run in parallel must remain distinct.
- **Local continuity.** Start a clean conversation or reopen up to 30 locally stored transcripts. Restored follow-ups receive bounded context from that same session only.
- **Readable, faithful output.** Safe semantic Markdown supports headings, nested lists, links, quotes, fenced code, and scrollable tables while preserving math source. Image-only ChatGPT responses can also complete.
- **Reproducible work.** Opt-in snapshots with frozen privacy tiers, replay, checkpoints, Markdown export, provider diagnostics, and a 2,000-event deduplicated in-memory log remain available.
- **Independent interface and response languages.** The UI supports English, Traditional Chinese, Japanese, and German. Auto response language follows an explicit request, then the current question and conversation, using UI language only as fallback.
- **AI-Sister Commemorative Edition.** The optional four-character theme decorates only app-owned surfaces and never reskins provider pages.
- **Agent-ready source launch.** Explicit Codex and Claude Code repository Skills can audit prerequisites and launch the local source app without building an installer.

## Workflows

| Preset | Flow | Good for |
|---|---|---|
| **Free** | Selected providers answer in parallel | Fast comparison and image prompts |
| **Debate** | Pro → Con → Judge → Synthesis | Stress-testing a decision or argument |
| **Consult** | Two independent answers → Review → Final answer | Research and second opinions |
| **Coding** | Specification → Reviews → v1 → Tests → v2 → Acceptance → Final | Structured software planning and review |
| **Roundtable** | 5 rounds × 4 seats = 20 contributions | Slow, adversarial convergence on difficult questions |
| **Brainstorm** | 12 rounds × 4 rotating seats = 48 contributions across five phases | Full-context ideation, a balanced portfolio, and concrete experiments |

Structured workflows preflight every required role. If a provider is unavailable, the app identifies it and lets you open/login, reassign the role, or choose another mode; it never silently substitutes a provider. Standard structured workflows stop on a persistent provider error. Brainstorm instead pauses for an explicit Retry, Skip, or Cancel choice.

Brainstorm is intentionally heavy: keep all four default provider sessions authenticated and allow roughly **45–90 minutes**. Its full live 48-contribution recovery path has automated coverage but was not manually completed for v1.8.6.

After a workflow finishes, continue from the bottom composer to keep the same app conversation. Choose **New conversation** for clean session context.

## Privacy and security

- No API keys, Multi-AI Chat account, telemetry, analytics, or conversation backend.
- Prompts go directly to the provider pages you select. Provider services still receive and process them under their own policies.
- Each provider's cookies and browser profile remain under local app data and are never copied into snapshots or diagnostics.
- Remote provider webviews are untrusted and receive **zero Tauri permissions**. Only the bundled local control pane can call app commands.
- Optional adapter updates are data-only JSON, schema-validated, and cannot expand the provider/login/SSO URL scopes bundled with the app.
- Snapshots are opt-in and local, with the shipped `metadata-only`, `hashes`, `prompt-text`, and `full-local` privacy tiers. There is no automatic full-conversation upload or sharing channel.
- Debug bundles, Markdown exports, and share/publish actions run only after an explicit user action. Adapter diagnostics exclude page text, input values, cookies, storage, URL queries, and fragments.

Report vulnerabilities privately through [SECURITY.md](./SECURITY.md); never put cookies, tokens, account data, conversations, provider HTML, or local profile files in a public issue. Provider automation regressions can use the **Adapter broken** issue form after you review the in-app diagnostic preview.

## Known limits and verification status

- Provider sites can change without notice. A DOM or login-flow change may temporarily break automatic input, send, or completion detection until an adapter update ships.
- Provider accounts, subscriptions, quotas, regional availability, terms, and security challenges still apply. The app neither automates nor bypasses them. Claude requires an authenticated account; Gemini may require system-browser guidance for a Google `/sorry` block; Grok challenges must be solved manually in its pane.
- **Windows x64** has verified packaged launch evidence, but artifacts are unsigned and can trigger SmartScreen.
- **macOS Apple Silicon** is partially verified. The DMG is ad-hoc signed and not notarized; an earlier real-device report opened the app and logged into ChatGPT, Claude, and Gemini, while Grok remained on Cloudflare. Current Grok recovery still needs a live Apple Silicon retest. There is no Intel artifact.
- **Linux x86_64** packaging is CI-verified only; there is no current maintainer real-device launch report.
- For v1.8.6, live provider login—including Grok's challenge path—and a complete 48-contribution Brainstorm recovery run were not manually reverified. ChatGPT adapter v7 has focused live-DOM selector evidence, not a full in-app logged-out workflow.
- Snapshots/replay/checkpoints are compatibility-maintained in their shipped form. There is no marketplace, graph editor, fifth provider, new persistence schema, embedded terminal agent, telemetry roadmap, Developer ID/notarization program, or self-updater planned for this feature-frozen edition.

See the evidence-based [compatibility matrix](./docs/COMPATIBILITY.md). CI and automated tests are never presented as proof that a live provider account or real desktop device was exercised.

## Launch from source with Codex or Claude Code

Opening or cloning this repository never executes it. Source launch does execute the trusted checkout, JavaScript dependency lifecycle scripts, and Rust build scripts/procedural macros, so review the repository first.

The repo includes two explicit local Skills:

- Codex: [`.agents/skills/launch-multi-ai-chat/SKILL.md`](./.agents/skills/launch-multi-ai-chat/SKILL.md) — invoke `$launch-multi-ai-chat` in a local Codex app, CLI, or IDE task.
- Claude Code: [`.claude/skills/launch-multi-ai-chat/SKILL.md`](./.claude/skills/launch-multi-ai-chat/SKILL.md) — invoke `/launch-multi-ai-chat` in a local graphical Claude Code session.

The Skills may install only locked project dependencies, build generated code, and start `tauri dev`. They never install/remove host toolchains or global packages, change `PATH` or security settings, build a release installer, read provider credentials, upload receipts, or roll back host changes. Remote/cloud agents cannot display the GUI on your computer. There is intentionally no Docker lane.

Common prerequisites are **Node.js ^22.13.0 || >=24.0.0**, pnpm/Corepack, stable Rust, and the [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/). The first Rust build can take several minutes. The versioned contract is in [`agent-release.json`](./agent-release.json) and [`docs/AGENT-READY-SOURCE-RELEASE.md`](./docs/AGENT-READY-SOURCE-RELEASE.md).

## Development

```sh
corepack enable # only if pnpm is unavailable
pnpm install --frozen-lockfile
pnpm verify
pnpm tauri dev
```

Useful lifecycle checks:

```sh
node scripts/agent/doctor.mjs --json
node scripts/agent/launch.mjs --dry-run --json
node scripts/agent/launch.mjs --wait --timeout-ms 600000 --json
node scripts/agent/status.mjs --json --lines 80
node scripts/agent/stop.mjs --json
```

Only the current run's identity-verified `[MAC_AGENT] READY control-pane` marker means the source app is ready. Runtime state and before/after audit receipts stay in ignored `.agent-runtime/` and are not uploaded automatically. `pnpm tauri build` creates packages for the current platform.

Read the [specification](./docs/SPEC.md), [architecture](./docs/ARCHITECTURE.md), [release guide](./docs/RELEASE.md), [source-launch contract](./docs/AGENT-READY-SOURCE-RELEASE.md), and [contributing guide](./CONTRIBUTING.md) before changing behavior. Adapter changes must preserve schema and URL boundaries.

## Project and credits

Multi-AI Chat Desktop is MIT-licensed software created by **Ted Huang / TED-H** ([TED@TED-H.com](mailto:TED@TED-H.com), [ted-h.com](https://ted-h.com)) and sponsored by [AI-Sister.com](https://ai-sister.com). The commemorative artwork is included with project-specific permission and is not independently offered under the MIT software license; see its [artwork notice](./src/assets/themes/ai-sister/NOTICE.md).

Contributor thanks:

- [Rumi-3653](https://github.com/Rumi-3653) contributed the ChatGPT v7 logged-out detector repair in [#78](https://github.com/teddashh/multi-ai-chat-desktop/pull/78).
- [George Ku (`@ufgeorge`)](https://github.com/ufgeorge) reported the provider-limit Brainstorm interruption in [#80](https://github.com/teddashh/multi-ai-chat-desktop/issues/80), leading to the v1.8.6 recovery flow.
- [Dave Tseng (`@DaveTseng2019`)](https://github.com/DaveTseng2019) contributed the `v1.3.1` overlay reliability fix; detailed reproductions and proposals in [#10](https://github.com/teddashh/multi-ai-chat-desktop/pull/10), [#11](https://github.com/teddashh/multi-ai-chat-desktop/pull/11), and [#12](https://github.com/teddashh/multi-ai-chat-desktop/pull/12); serializer regression tests in [#14](https://github.com/teddashh/multi-ai-chat-desktop/pull/14); Grok challenge and expanded-focus work in [#39](https://github.com/teddashh/multi-ai-chat-desktop/pull/39) and [#40](https://github.com/teddashh/multi-ai-chat-desktop/pull/40); and the full-width transcript with scroll-linked provider focus in [#51](https://github.com/teddashh/multi-ai-chat-desktop/pull/51).
- [CE Lin (`@ChingEnLin`)](https://github.com/ChingEnLin) provided the provider-status report in [#41](https://github.com/teddashh/multi-ai-chat-desktop/issues/41) and contributed ChatGPT, Gemini, and Grok adapter repairs in [#42](https://github.com/teddashh/multi-ai-chat-desktop/pull/42).
- Windows and macOS users shared reproducible reports and sanitized debug logs that improved first-launch packaging, provider automation, session continuity, and release verification.

Issues and pull requests are welcome within the frozen maintenance scope. Please use [GitHub Issues](https://github.com/teddashh/multi-ai-chat-desktop/issues) for reproducible non-security bugs and maintenance questions.
