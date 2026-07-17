# Multi-AI Chat Desktop

**English** · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [Deutsch](./README.de.md)

Ask one question, then let your logged-in **ChatGPT, Claude, Gemini, and Grok** web sessions answer, review, challenge, and refine one another. Multi-AI Chat Desktop is a Tauri 2 workflow hub—not four chat windows placed side by side.

**Current release: [download the latest stable version](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest)** · MIT · no API keys · no analytics

> This project automates provider web pages you already use. Provider UI changes can temporarily break an adapter, and automated use may be subject to each provider’s terms. Use accounts and content you are authorized to use.

> **Project status:** Feature development is complete. The final optional AI-Sister four-character commemorative theme and its 12-round Brainstorm preset are included; future changes are limited to provider compatibility, security, and build breakage. Every Brainstorm round includes all four providers—48 contributions total—with a rotating speaking order and full same-session history. The shipped snapshot/replay tools remain available as-is with no further roadmap.

## v1.6.3 highlights

- **Reliable overlay restoration.** Provider WebView hide/show commands now run in order, preventing a rapidly closed modal from leaving a live provider hidden.
- **Safer UI lifecycles.** Late adapter-listener subscriptions and update checks can no longer update an already-disposed app or Settings session.
- **Calmer background operation.** Restoring an existing provider no longer steals keyboard focus unless focus was explicitly requested.
- **Recoverable session resets.** A timed-out new-session attempt clears its temporary boot filter so the current provider page can report status normally again.
- **Release hygiene.** Rust setup actions use an immutable commit, while the standard MIT text and a separate NOTICE file make licensing and provenance machine-readable.

See the bilingual [`v1.6.3 release notes`](./docs/RELEASE_NOTES_v1.6.3.md) for validation, audit scope, the documented upstream GTK risk, and known platform limits.

## Choose the right edition

| Edition | Best for | How it runs |
|---|---|---|
| **Desktop (this repo)** | Full workflows, focused live provider view, replay, snapshots, local files | Tauri app with isolated local provider profiles |
| [Browser extension](https://github.com/teddashh/multi-ai-chat) | Lightweight workflows inside Chrome | Chrome Side Panel controlling your existing provider tabs |

## What the desktop edition includes

- **Reliable offscreen automation.** Providers keep working without manually opening each “live page”; rejected sends retry and fail clearly instead of waiting forever.
- **Conversation-first layout.** Workflow controls sit above the less-important provider WebView on the left; the transcript and composer keep the larger right pane.
- **Six guided presets, five stable modes.** Free distribution, debate, consultation, coding, five-round truth-seeking roundtable, and a 12-round × 4-provider Brainstorm workflow with 48 contributions.
- **Local sessions.** Create a new conversation or reopen up to 30 recent transcripts stored on this computer; restored follow-ups receive bounded context from the same session.
- **Readable results.** Safe semantic Markdown rendering for headings, nested lists, links, quotes, fenced code, and scrollable tables.
- **Image completion.** Image-only ChatGPT responses complete the workflow instead of hanging.
- **Reproducible work.** Optional snapshots, privacy tiers, replay, provider diagnostics, and a 2,000-event deduplicated log.
- **Four UI languages.** English, Traditional Chinese, Japanese, and German.
- **Question-aware response language.** Auto follows an explicit request, then the question and conversation language; the UI language is used only as a fallback. A fixed response language can be selected separately.
- **AI-Sister Commemorative Edition.** One optional four-character theme adds the supplied portraits to provider cards, active speakers, process rows, and the app shell without reskinning third-party pages.
- **Repository Skills.** Codex and Claude Code can validate prerequisites and launch the source app without an installer.
- **Safer macOS packaging.** Apple Silicon DMGs are ad-hoc signed, and release CI verifies the embedded app signature before upload.

## Workflow presets

| Preset | Flow | Typical use |
|---|---|---|
| **Free** | Selected providers answer in parallel | Quick comparison and image prompts |
| **Debate** | Pro → Con → Judge → Synthesis | Stress-test a decision or argument |
| **Consult** | Two independent answers → Review → Final answer | Research and second opinions |
| **Coding** | Specification → Reviews → v1 → Tests → v2 → Acceptance → Final | Structured software planning and review |
| **Roundtable** | 5 rounds × 4 AIs = 20 turns | Slow, adversarial convergence on difficult questions |
| **Brainstorm** | 12 rounds × 4 AIs = 48 contributions; rotating order across framing → divergence → cross-pollination → harvesting → concept tests | Full-context idea development, a balanced portfolio, and concrete first experiments |

Brainstorm is intentionally the heaviest preset: keep all four web sessions authenticated and allow roughly 45–90 minutes. Claude's current consumer site requires an account login; this app detects and guides that flow but never bypasses provider login or security checks.

After a workflow finishes, use the bottom composer to continue the same conversation. Use **New conversation** when you want a clean session.

## Install a release

Download from [Releases](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest):

- **Windows x64:** portable `.zip` or `x64-setup.exe`. Windows 10/11 normally already includes WebView2; the installer can fetch it when missing.
- **macOS Apple Silicon:** `aarch64.dmg`. Builds from `v1.0.1` onward are ad-hoc signed but not Apple-notarized. Intel builds are not currently published.
- **Linux x64:** `.AppImage`, then run `chmod +x Multi-AI*.AppImage` and open it. Ubuntu 22.04 / Debian 12 or newer is recommended.

On first launch, open each provider once and sign in. Credentials stay in that provider’s local WebView profile; the app never asks for the password.

### macOS first launch

1. Delete any `v1.0.0` copy, download `v1.0.1` or newer, open the DMG, and drag the app to **Applications**.
2. Try to open the app once.
3. Within about one hour, open **System Settings → Privacy & Security**, scroll to **Security**, then choose **Open Anyway** and confirm.

The ad-hoc signature prevents the false “app is damaged” bundle-integrity failure, but only Apple Developer ID signing plus notarization can remove the first-launch security exception entirely. Managed Macs may prohibit user exceptions.

## Launch the source with Codex or Claude Code

The repo contains two explicit local Skills:

- Codex: [`.agents/skills/launch-multi-ai-chat/SKILL.md`](./.agents/skills/launch-multi-ai-chat/SKILL.md)
- Claude Code: [`.claude/skills/launch-multi-ai-chat/SKILL.md`](./.claude/skills/launch-multi-ai-chat/SKILL.md)

These follow the official [Codex Agent Skills](https://developers.openai.com/codex/skills) and [Claude Code Skills](https://docs.anthropic.com/en/docs/claude-code/skills) layouts.

The machine-readable source of truth is [`agent-release.json`](./agent-release.json), validated by [`agent-release.schema.json`](./agent-release.schema.json). The full trust, permission, side-effect, readiness, and audit model is documented in the bilingual [`Agent-Ready Source Release contract`](./docs/AGENT-READY-SOURCE-RELEASE.md).

Opening a repository never executes it automatically. Source launch executes this checkout, JavaScript dependency lifecycle code, and Rust build scripts/procedural macros, so review and trust the repo first. The explicit Skill can install locked dependencies into this project, build generated code, and start `tauri dev`; it never installs or removes host toolchains/global packages, changes `PATH` or security settings, builds an installer, or reads provider credentials. Any host installation is a separate operation requiring separate explicit approval.

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

Common: **Node.js 20+**, pnpm (or Corepack), and the stable Rust toolchain. The commands below are manual prerequisite examples; the Skill only reports missing items and stops.

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
node scripts/agent/audit.mjs --phase before --write --json
node scripts/agent/doctor.mjs --json
node scripts/agent/launch.mjs --dry-run --json
node scripts/agent/launch.mjs --wait --timeout-ms 600000 --json
node scripts/agent/status.mjs --json --lines 80
node scripts/agent/audit.mjs --phase after --write --json
node scripts/agent/stop.mjs --json
pnpm agent:verify
```

The first Rust build can take several minutes. `accepted` and `building` are not readiness claims: only the current run's `[MAC_AGENT] READY control-pane` marker produces `state: "ready"`. Logs, identity state, and before/after receipts stay under ignored `.agent-runtime/`; nothing is uploaded automatically. This GUI/WebView lane intentionally has no Docker variant.

## Development

```sh
corepack enable        # only if pnpm is not already available
pnpm install --frozen-lockfile
pnpm build:injected
pnpm verify
pnpm tauri dev
```

`pnpm tauri build` creates platform packages. See [`docs/SPEC.md`](./docs/SPEC.md), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/RELEASE.md`](./docs/RELEASE.md), and the honest [`compatibility matrix`](./docs/COMPATIBILITY.md).

## Privacy and network behavior

- No API keys, project account, telemetry, or conversation backend.
- Prompts go directly to the provider pages selected by the user.
- Provider cookies and profiles stay in local app data.
- Adapter updates are optional, data-only, schema-validated, and unable to expand the URL scopes bundled with the app.
- Debug bundles are created locally only when requested.
- Export/share actions run only after an explicit user action.

## Project

Report vulnerabilities privately through [`SECURITY.md`](./SECURITY.md). Report provider automation regressions with the GitHub **Adapter broken** issue form after reviewing the in-app diagnostic preview.

### Contributors and acknowledgements

Special thanks to [Dave Tseng (`@DaveTseng2019`)](https://github.com/DaveTseng2019) for the `v1.3.1` overlay reliability fix, the careful reproductions and original proposals in [#10](https://github.com/teddashh/multi-ai-chat-desktop/pull/10), [#11](https://github.com/teddashh/multi-ai-chat-desktop/pull/11), and [#12](https://github.com/teddashh/multi-ai-chat-desktop/pull/12), and the serializer regression tests merged in [#14](https://github.com/teddashh/multi-ai-chat-desktop/pull/14).

Thank you to the Windows and macOS users who shared reproducible reports and sanitized debug logs. Those reports directly improved first-launch packaging, provider automation, session continuity, and release verification.

Sponsored by [AI-Sister.com](https://ai-sister.com). Created by Ted Huang ([TED@TED-H.com](mailto:TED@TED-H.com), [ted-h.com](https://ted-h.com)).

MIT License.
