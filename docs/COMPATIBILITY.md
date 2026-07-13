# Compatibility and Smoke-Test Matrix / 相容性與人工測試矩陣

> Last reviewed: 2026-07-12. This document records evidence, not a guarantee. Provider DOM and login flows can change without notice.

## Status legend

- **Verified** — exercised manually on the named platform or validated by a focused automated test.
- **Partially verified** — real-device evidence exists, but at least one named path remains unverified or blocked.
- **CI-only** — compiles/packages in GitHub Actions, but no maintainer end-user launch report is available.
- **Pending** — needs a repeatable manual check before claiming support for that behavior.

## Desktop platforms

| Platform | Packaging evidence | End-user launch | Status |
|---|---|---|---|
| Windows x64 | NSIS and portable builds; local development and packaged builds | Maintainer/user runs available | **Verified** |
| macOS Apple Silicon | DMG builds in CI; embedded app is verified as ad-hoc signed | A `v1.0.1` user opened the app and logged into ChatGPT, Claude, and Gemini; Grok looped on Cloudflare verification | **Partially verified** |
| Linux x86_64 | AppImage builds in CI with WebKitGTK dependencies | No maintainer desktop report yet | **CI-only** |

macOS remains ad-hoc signed, not Developer ID signed or notarized. The Apple Silicon report confirms that the documented first-launch exception works, but does not make the build warning-free. The current source stops injecting the permission Web-API shim into Grok/Cloudflare frames and permits only Cloudflare's required `about:blank` / `about:srcdoc` auxiliary documents; this fix still requires an Apple Silicon retest before final release publication.

## Agent-ready source lane

| Evidence | Windows | macOS / Linux | Status |
|---|---|---|---|
| Manifest/schema and Skill drift tests | 20 focused tests pass locally | Cross-platform CI job configured; awaiting the first merged run of this contract | Windows **Verified**; others **Pending** |
| Doctor/audit/dry-run JSON | Exercised locally; dry-run preserves runtime state | Same Node entrypoints covered by the platform matrix after merge | Windows **Verified**; others **Pending** |
| App-level READY wait | Three live source-launch smokes reached the same-run, identity-verified control-pane READY marker on 2026-07-12; stale/replacement/missing-state tests also pass | No real-device source-launch report | Windows **Verified**; others **Pending** |
| Launch/stop race safety | Live smokes released the fail-closed launch mutex; audit probes detected generated/target/runtime changes; stop re-verified before kill and before same-run state deletion; foreign/EPERM tests pass | Same code path, not manually exercised | Windows **Verified**; others **Pending** |
| Corrupt state recovery | Default stop refused malformed state and preserved it; explicit `--clear-invalid-state` removed only the state file, then a normal launch/stop completed | Not manually exercised | Windows **Verified**; others **Pending** |

The Agent contract does not claim that CI displayed a window. It also does not install host prerequisites, inventory the full OS, sandbox checked-out code, upload receipts, or roll back host changes. See [`AGENT-READY-SOURCE-RELEASE.md`](./AGENT-READY-SOURCE-RELEASE.md).

## Provider adapters

| Provider | Bundled adapter | Windows text workflow evidence | Image-only completion |
|---|---:|---|---|
| ChatGPT | v4 | **Verified** | Partial manual coverage; recheck after provider UI changes |
| Claude | v3 | **Verified** | Not a compatibility claim |
| Gemini | v1 | **Verified** | Not a compatibility claim |
| Grok | v6 | **Verified** | Not a compatibility claim |

Automated tests validate adapter structure, approved strategies, HTTPS URL parsing, and navigation boundaries. They do not log into live provider accounts. Remote adapter updates cannot expand the URL scopes bundled with the installed app.

macOS note: the `v1.0.1` report verified ChatGPT, Claude, and Gemini login, but Grok remained on Cloudflare's security-verification page. The next release candidate leaves Grok's core browser APIs unmodified, following Cloudflare's documented WebView requirements. CI can compile this policy but cannot prove that a live challenge completes.

## Product behavior

| Area | Automated evidence | Manual release check |
|---|---|---|
| Free mode | Four-provider fan-out tests | Send to all selected providers; verify each final response |
| Debate / consultation / coding | Golden graph ordering and prompt-threading tests | Complete one run; verify role labels and final summary |
| Roundtable | Five-round, four-speaker history tests | Complete one run; verify prior same-session speeches remain available |
| Session isolation | Conversation persistence and latest-snapshot matching tests | Create two sessions; confirm no messages or export provenance cross over |
| Snapshot / replay | Schema, redaction, version mismatch, replay, and app-version tests | Save/replay once when local snapshot persistence is enabled |
| Markdown export | Formatting and provenance tests | Confirm UTC time, app version, latest matching workflow/snapshot, and adapter versions |
| Adapter hot update | Rust validation, version gate, cache, and URL-scope tests | Use a higher-version test adapter on an allowed host scope |
| Control-pane security | Capability and CSP configuration tests | Confirm Settings update check and export still work in a packaged build |

## Release smoke checklist

1. Install or launch the platform artifact on a clean profile.
2. Open and authenticate each provider using a non-sensitive test account where possible.
   On macOS, explicitly confirm that Grok exits the Cloudflare verification page before calling the release verified.
3. Verify prompt insertion, automatic send, thinking state, text completion, and new-session reset.
4. Run Free mode and one serial mode; cancel one in-progress run.
5. Generate an image on a supporting provider and confirm the workflow reaches completion without relying on text-only output.
6. Export Markdown and inspect provenance; create a new app session and verify history isolation.
7. Open Settings, check for updates, switch themes and interface languages, and review the author/sponsor links. With Response language set to Auto, verify an English question receives English text and a Traditional Chinese question receives Traditional Chinese text regardless of the interface language; then verify a fixed response-language choice.
8. Export a sanitized debug bundle only if a failure occurs; never attach secrets or raw provider-page content.

## 回報方式

若你有 macOS 或 Linux 實機，最有價值的回報是：OS/CPU、app 版本、安裝方式、是否能第一次開啟、四家 provider 的登入／自動送出／完成偵測，以及不含私人內容的 debug bundle。Adapter 問題請使用 GitHub 的 **Adapter broken** 表單；安全問題請依 [`SECURITY.md`](../SECURITY.md) 私下回報。
