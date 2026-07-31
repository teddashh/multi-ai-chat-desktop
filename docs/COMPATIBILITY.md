# Compatibility and Smoke-Test Matrix / 相容性與人工測試矩陣

> Last reviewed: 2026-07-31 for the v1.8.4 release candidate. This document records evidence, not a guarantee. Provider DOM and login flows can change without notice.

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

macOS remains ad-hoc signed, not Developer ID signed or notarized. The Apple Silicon report confirms that the documented first-launch exception works, but does not make the build warning-free. Current source leaves provider permission APIs untouched, permits Cloudflare's required `about:blank` / `about:srcdoc` documents, defers the automation bridge on any detected Cloudflare or hCaptcha security-check page, and never monkey-patches Grok's History API. A native Tauri title observer marks known Grok challenge titles as blocked, and a bounded read-only host probe covers embedded Turnstile widgets whose top-level title remains unchanged. Neither path starts the injected bridge or changes the challenge page. Automated tests cover this policy, but a live Apple Silicon retest is still required.

## Agent-ready source lane

| Evidence | Windows | macOS / Linux | Status |
|---|---|---|---|
| Manifest/schema and Skill drift tests | 22 focused tests pass locally | The same 22 tests pass in Windows, macOS, and Linux CI jobs | **Verified** as a source contract; GUI launch remains separate |
| Doctor/audit/dry-run JSON | Exercised locally; dry-run preserves runtime state | Node contract paths pass on all three CI operating systems | Windows **Verified**; others **CI-only** |
| App-level READY wait | Three live source-launch smokes reached the same-run, identity-verified control-pane READY marker on 2026-07-12; stale/replacement/missing-state tests also pass | No real-device source-launch report | Windows **Verified**; others **Pending** |
| Launch/stop race safety | Live smokes released the fail-closed launch mutex; audit probes detected generated/target/runtime changes; stop re-verified before kill and before same-run state deletion; foreign/EPERM tests pass | Same code path, not manually exercised | Windows **Verified**; others **Pending** |
| Corrupt state recovery | Default stop refused malformed state and preserved it; explicit `--clear-invalid-state` removed only the state file, then a normal launch/stop completed | Not manually exercised | Windows **Verified**; others **Pending** |

The Agent contract does not claim that CI displayed a window. It also does not install host prerequisites, inventory the full OS, sandbox checked-out code, upload receipts, or roll back host changes. See [`AGENT-READY-SOURCE-RELEASE.md`](./AGENT-READY-SOURCE-RELEASE.md).

The v2.0.0 source contract supports Node.js `^22.13.0 || >=24.0.0`, matching the locked pnpm and lint toolchain. `agent:doctor` rejects unsupported Node versions and stops instead of presenting an invalid source launch as ready. This requirement applies only to source development; packaged desktop users do not need Node.js.

## Provider adapters

| Provider | Bundled adapter | Windows text workflow evidence | Image-only completion |
|---|---:|---|---|
| ChatGPT | v6 | v4 text workflow **Verified**; v5 mismatch recovery and v6 logged-out precedence have automated coverage and await live retest | Partial manual coverage; recheck after provider UI changes |
| Claude | v4 | v3 text workflow **Verified**; v4 login-page detection and explicit Google SSO scope have automated coverage and await live retest | Not a compatibility claim |
| Gemini | v2 | Base text workflow **Verified**; bounded Google `/sorry` navigation, blocked status, and passive bridge behavior have automated coverage and await live retest | Not a compatibility claim |
| Grok | v7 | Base text workflow **Verified**; a Windows 11 / WebView2 150 fresh-profile prototype completed Turnstile and embedded login; challenge-first delayed handoff, watchdog recovery, mutation refusal, and same-document auth-popup reload coordination have automated coverage and await a live retest | Not a compatibility claim |

Automated tests validate adapter structure, schema v1/v2 parser compatibility, typed detector rejection, logged-out precedence, approved strategies, HTTPS URL parsing, and navigation boundaries. They do not log into live provider accounts. Remote adapter updates cannot expand the URL scopes bundled with the installed app.

Claude's current consumer web experience requires an authenticated account. Adapter v4 recognizes common email-login fields and keeps the official Anthropic and Google sign-in routes within the existing bounded SSO policy. The app does not bypass login, age, subscription, challenge, or other provider-side requirements; guided workflows that assign a Claude seat remain blocked until Claude reports a ready composer.

macOS note: the `v1.0.1` report verified ChatGPT, Claude, and Gemini login, but Grok remained on Cloudflare's security-verification page. Current source omits the document-start bridge and permission shim for Grok while retaining the background-liveness settings required by hidden provider panes. A single atomic driver reads the shared Cloudflare/hCaptcha title, body, and marker signals before changing provider state or creating the bridge, then retries unresolved and blocked documents through page-load events and the host watchdog. Known challenge titles include the Traditional Chinese `安全驗證` variant, and an already-running engine refuses fill, send, and stop mutations while a challenge is active. Closing an allowlisted Grok authentication popup can reserve one same-document native reload; owner/epoch gates, close invalidation, rollback, and a bounded navigation-start lease prevent duplicate or permanently wedged recovery without evaluating the blocked document. A Windows 11 test with WebView2 Runtime `150.0.4078.99` completed the live challenge and embedded login using a broader prototype configuration; the final popup-close handoff and non-Windows behavior still require live confirmation. The app does not automate or bypass the challenge.

Gemini may redirect an embedded session to `https://www.google.com/sorry/index?...`. Current source allows only the HTTPS `www.google.com/sorry` path family for Gemini, reports it as blocked instead of logged in, skips the permission shim there, and defers bridge startup until Google returns to Gemini. Sibling paths, lookalike hosts, non-HTTPS URLs, and cross-provider use remain denied. A live challenge completion still requires manual verification.

## Product behavior

| Area | Automated evidence | Manual release check |
|---|---|---|
| Free mode | Four-provider fan-out tests | Send to all selected providers; verify each final response |
| Debate / consultation / coding | Golden graph ordering, prompt threading, four-provider default assignment, unavailable-provider preflight, configurable roles, bounded retry, and terminal provider-error tests | Complete one default run; verify role labels and final summary |
| Roundtable | Five-round, four-seat history, four-provider default coverage, configurable assignment, repeated-seat preflight, and unavailable-provider tests | Complete one run; verify prior same-session speeches remain available |
| Brainstorm | Twelve rounds × four rotating seats, four-provider defaults, four distinct lenses, 48-step history threading, five phase prompts, preflight, localization, and snapshot tests | Allow 45–90 minutes; verify four contributions per round and a consolidated portfolio from the final speaker |
| Long provider work | Thinking, pulled chunks, bulk-ready, and done-ready activity refresh a 10-minute inactivity window; ChatGPT completion-marker tests cover more than 10 minutes of active thinking and fail closed after true completion inactivity; tests also enforce a 60-minute bridge hard cap | Run one provider task beyond 10 minutes, then verify a truly stalled task still terminates |
| Session isolation | Conversation persistence and latest-snapshot matching tests | Create two sessions; confirm no messages or export provenance cross over |
| Restored-session continuity | Stable response-identity and bounded same-session replay tests | Reopen a session, ask a follow-up, and confirm old context is available without cross-session leakage |
| Response fidelity | DOM-to-Markdown tests for paragraphs, nested lists, links, fenced code, direct/nested tables, image-only fallback, finish-time revisions/shortening, late render batches, and literal replacement patterns in code | Compare a slowly completed provider answer containing code and a table with the captured transcript; confirm the final provider DOM and transcript match |
| Transcript scrolling | Near-bottom and user-scroll intent tests; scroll-linked provider focus, resize/reflow recalculation, pre-first-message boundary, binary lookup, and maximized-workspace tests | Stream a long answer, scroll upward, resize the window, maximize/restore the transcript, and confirm the provider chip and reading position remain stable |
| Session quota recovery | Quota-only eviction, transient-failure preservation, and persisted-state result tests | Fill local history near quota and confirm only the oldest sessions are removed |
| Snapshot / replay | Schema, redaction, version mismatch, replay, and app-version tests | Save/replay once when local snapshot persistence is enabled |
| Markdown export | Formatting and provenance tests | Confirm UTC time, app version, latest matching workflow/snapshot, and adapter versions |
| Adapter hot update | Rust validation, version gate, cache, and URL-scope tests | Use a higher-version test adapter on an allowed host scope |
| Control-pane security | Capability and CSP configuration tests | Confirm Settings update check and export still work in a packaged build |

## Release smoke checklist

1. Install or launch the platform artifact on a clean profile.
2. Open and authenticate each provider using a non-sensitive test account where possible. Claude requires its official Google or email login flow; do not call Claude ready until the composer appears.
   On Windows, close Grok's in-app authentication popup after completing login and confirm the blocked pane reloads once and becomes Ready without a manual reload.
   On macOS, explicitly confirm that Grok exits the Cloudflare verification page before calling the release verified.
3. Verify prompt insertion, automatic send, thinking state, text completion, and new-session reset.
4. Run Free mode and one serial mode; cancel one in-progress run.
5. Generate an image on a supporting provider and confirm the workflow reaches completion without relying on text-only output.
6. Export Markdown and inspect provenance; create a new app session and verify history isolation.
7. In the installed build, open Settings, check for updates, switch themes and interface languages, and review the author/sponsor links. In the portable build, confirm update controls are hidden and `README-PORTABLE.txt` links to the latest GitHub Release. With Response language set to Auto, verify an English question receives English text and a Traditional Chinese question receives Traditional Chinese text regardless of the interface language; then verify a fixed response-language choice. In particular, confirm Grok answers the request instead of reproducing the internal `<response-language-policy>` block.
8. Export a sanitized debug bundle only if a failure occurs; never attach secrets or raw provider-page content.

## 回報方式

若你有 macOS 或 Linux 實機，最有價值的回報是：OS/CPU、app 版本、安裝方式、是否能第一次開啟、四家 provider 的登入／自動送出／完成偵測，以及不含私人內容的 debug bundle。Adapter 問題請使用 GitHub 的 **Adapter broken** 表單；安全問題請依 [`SECURITY.md`](../SECURITY.md) 私下回報。
