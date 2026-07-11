# Multi-AI Chat Desktop

**English** · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [Deutsch](./README.de.md)

Ask one question, then let your logged-in **ChatGPT, Claude, Gemini, and Grok** web sessions answer, review, challenge, and refine one another. Multi-AI Chat Desktop is a Tauri 2 workflow hub—not four chat windows placed side by side.

**Current release: [v0.6.0](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v0.6.0)** · MIT · no API keys · no analytics

> This project automates provider web pages you already use. Provider UI changes can temporarily break an adapter, and automated use may be subject to each provider’s terms. Use accounts and content you are authorized to use.

## Choose the right edition

| Edition | Best for | How it runs |
|---|---|---|
| **Desktop (this repo)** | Full workflows, focused live provider view, replay, snapshots, local files | Tauri app with isolated local provider profiles |
| [Browser extension](https://github.com/teddashh/multi-ai-chat) | Lightweight workflows inside Chrome | Chrome Side Panel controlling your existing provider tabs |

## What v0.6.0 includes

- **Reliable offscreen automation.** Providers keep working without manually opening each “live page”; rejected sends retry and fail clearly instead of waiting forever.
- **Conversation-first layout.** Workflow controls sit above the less-important provider WebView on the left; the transcript and composer keep the larger right pane.
- **Five guided modes.** Free distribution, debate, consultation, coding, and five-round truth-seeking roundtable.
- **Local sessions.** Create a new conversation or reopen up to 30 recent transcripts stored on this computer.
- **Readable results.** Safe Markdown rendering for headings, lists, links, quotes, and code blocks.
- **Image completion.** Image-only ChatGPT responses complete the workflow instead of hanging.
- **Reproducible work.** Optional snapshots, privacy tiers, replay, provider diagnostics, and a 2,000-event deduplicated log.
- **Four UI languages.** English, Traditional Chinese, Japanese, and German.
- **Repository Skills.** Codex and Claude Code can validate prerequisites and launch the source app without an installer.

## Workflow modes

| Mode | Flow | Typical use |
|---|---|---|
| **Free** | Selected providers answer in parallel | Quick comparison, brainstorming, image prompts |
| **Debate** | Pro → Con → Judge → Synthesis | Stress-test a decision or argument |
| **Consult** | Two independent answers → Review → Final answer | Research and second opinions |
| **Coding** | Specification → Reviews → v1 → Tests → v2 → Acceptance → Final | Structured software planning and review |
| **Roundtable** | 5 rounds × 4 AIs = 20 turns | Slow, adversarial convergence on difficult questions |

After a workflow finishes, use the bottom composer to continue the same conversation. Use **New conversation** when you want a clean session.

## Install a release

Download from [Releases](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest):

- **Windows x64:** portable `.zip` or `x64-setup.exe`. Windows 10/11 normally already includes WebView2; the installer can fetch it when missing.
- **macOS Apple Silicon:** `aarch64.dmg`. If an unsigned build is blocked, right-click the app and choose **Open**. Intel builds are not currently published.
- **Linux x64:** `.AppImage`, then run `chmod +x Multi-AI*.AppImage` and open it. Ubuntu 22.04 / Debian 12 or newer is recommended.

On first launch, open each provider once and sign in. Credentials stay in that provider’s local WebView profile; the app never asks for the password.

## Launch the source with Codex or Claude Code

The repo contains two explicit local Skills:

- Codex: [`.agents/skills/launch-multi-ai-chat/SKILL.md`](./.agents/skills/launch-multi-ai-chat/SKILL.md)
- Claude Code: [`.claude/skills/launch-multi-ai-chat/SKILL.md`](./.claude/skills/launch-multi-ai-chat/SKILL.md)

These follow the official [Codex Agent Skills](https://developers.openai.com/codex/skills) and [Claude Code Skills](https://docs.anthropic.com/en/docs/claude-code/skills) layouts.

Opening a repository must not execute its code automatically. Invoke the Skill once; it checks the machine, installs only JavaScript project dependencies when needed, builds the injected bundle, and starts `tauri dev` in the background. It never installs system toolchains, builds an installer, or reads provider credentials.

### Codex app, CLI, or IDE

1. Download/clone this repository and open the folder as a **local** Codex project/task.
2. Type `$launch-multi-ai-chat` (or choose **Launch Multi-AI Chat** from `/skills`).
3. Approve local command execution if your Codex security settings request it.
4. Wait for the first Rust build; the Tauri window opens when compilation finishes.

Repo Skills work in Codex app, CLI, and IDE surfaces. A remote/cloud task can edit this repo but cannot display a GUI on your computer.

### Claude Code desktop, CLI, or IDE

1. Open this repository in a Claude Code surface that has a **local shell on your graphical computer**.
2. Run `/launch-multi-ai-chat`.
3. Keep the repository folder available while the dev app runs.

If your Claude desktop/browser session is remote, use a local Claude Code session or run `claude` from a terminal in this folder, then invoke `/launch-multi-ai-chat`.

### Platform prerequisites for source launch

Common: **Node.js 20+**, pnpm (or Corepack), and the stable Rust toolchain.

**Windows 10/11**

1. Install Node.js LTS.
2. Install Rust with `winget install --id Rustlang.Rustup` and select the MSVC toolchain.
3. Install **Visual Studio Build Tools → Desktop development with C++**.
4. Install Microsoft Edge WebView2 Evergreen Runtime only if it is missing.

**macOS 10.15+**

1. Run `xcode-select --install` (full Xcode is not required for desktop-only development).
2. Install Node.js LTS and Rust stable.
3. Start the Skill from a local graphical login session, not SSH.

**Ubuntu / Debian**

```sh
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Then install Node.js 20+, Rust stable, and run the Skill from a graphical X11/Wayland session. Other distributions should follow the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

### Skill lifecycle commands

```sh
node scripts/agent/doctor.mjs          # explain missing prerequisites
node scripts/agent/launch.mjs          # start once; safe if already running
node scripts/agent/status.mjs --lines 80
node scripts/agent/stop.mjs
```

The first Rust build can take several minutes. Logs stay in `.agent-runtime/tauri-dev.log`.

## Development

```sh
corepack enable        # only if pnpm is not already available
pnpm install --frozen-lockfile
pnpm build:injected
pnpm verify
pnpm tauri dev
```

`pnpm tauri build` creates platform packages. See [`docs/SPEC.md`](./docs/SPEC.md), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), and [`docs/RELEASE.md`](./docs/RELEASE.md).

## Privacy and network behavior

- No API keys, project account, telemetry, or conversation backend.
- Prompts go directly to the provider pages selected by the user.
- Provider cookies and profiles stay in local app data.
- Adapter updates are optional and constrained by the adapter schema.
- Debug bundles are created locally only when requested.
- Export/share actions run only after an explicit user action.

## Project

Sponsored by [AI-Sister.com](https://ai-sister.com). Created by Ted Huang ([TED@TED-H.com](mailto:TED@TED-H.com), [ted-h.com](https://ted-h.com)).

MIT License.
