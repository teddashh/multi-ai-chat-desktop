# PLAN — Multi-AI Chat Desktop implementation

> Status: **v2.0** (v1 M-series shipped; next phase = SPEC §17 roadmap N0–N9 — see "Next phase" below)
> Date: 2026-07-06 (the M0–M6 map below is the shipped-v1 record; "Next phase" tracks N0–N9)
> Contract: `docs/SPEC.md` v2.0. Decisions: `docs/ARCHITECTURE.md` v1.0. Roadmap synthesis: `.orchestration/analysis/roadmap-synthesis.md`.
> Working model: codex (`codex exec --dangerously-bypass-approvals-and-sandbox`, /goal) implements each milestone from this plan; Claude/Opus orchestrates, reviews diffs, and gates milestone exit; grok + codex do independent blind review passes. Every milestone starts from a clean git state and ends with a commit — codex runs unsandboxed, so git history is the safety net.

## Milestone map (risk-first ordering)

```
M0 scaffold ──► M1 bridge spike ──► M2 providers+adapters ──► M3 workflows ──► M4 UI ──► M5 hot-update ──► M6 release
   (blocked on VS Build Tools install)     ▲ highest technical risk lives in M1 — fail fast
```

---

## Next phase — v2.0 roadmap (N0–N9)

> Full detail: `docs/SPEC.md` §17 + `.orchestration/analysis/roadmap-synthesis.md`. The M-series (below)
> shipped the v1 Chrome-extension port; N0–N9 evolve it per the `New Comments2.md` 4-AI design debate
> ("底線硬、入口軟"; killer feature = reproducibility). Same working model: codex implements · Opus gates ·
> blind grok/codex reviews · commit-per-milestone · frozen contract preserved every step.

| # | Milestone | Status |
|---|---|---|
| N0 | Route all 5 modes through `executeGraph` (retire imperative handlers) | ✅ `978fa0b` |
| N1a | In-memory `ExecutionSnapshot` capture + `graphVersion` | ✅ `1fd85a2` |
| N1b1 | Redaction transform (metadata-only / hashes / prompt-text / full-local) | ✅ `4e1ec19` |
| N1b2 | Opt-in durable snapshot store (Rust, retention, redaction, best-effort) | ⏳ in progress |
| N1c | Snapshot replay (rerun from snapshot; current sessions; preflight-block) | ⏭ |
| N1d | Minimum session checkpoint (crash/restart resume) | ⏭ |
| N2 | Human relay checkpoints (auto-fill draft, never auto-send; `FILL_DRAFT`) | ⏭ |
| N3 | Workflow pack export/import (`.macflow.json`, share) | ⏭ |
| N4 | Preset catalog UX + read-only process trace | ⏭ |
| N5 | RAM three-state webviews (chip → side → center + hibernate) | ⏭ |
| N6 | Adapter completeness: Claude Code (web-DOM) + hardening | ⏭ |
| N7 | Local context injection v2 (PDF/DOCX extract, fan-out) | ⏭ |
| N8 | Contributor graph view → constrained editor (LAST) | ⏭ |
| N9 | Dynamic preset promotion / temperature feedback | ⏭ |

Sequence: N0 → N1 → N2+N4 → N3 → N5 → N6 → N7 → N8 → N9 (N5 may parallelize with N1).
**Frozen throughout N0–N9:** §5.1 seeds · §6.1 zero-permission · §7 transport · §8.2 strategies · zero-key identity.

---

## M0 — Repo scaffold (S)

**Deliverables**
- pnpm + Vite + React 18 + TS + Tailwind app in `src/`; `src-tauri/` via `tauri init`, cargo `unstable` feature, pinned Tauri minor.
- `shared/types.ts` + `shared/constants.ts` ported from original (MIT header preserved).
- `src/host/` host-api proxy skeleton (every namespace present, unimplemented throws loudly — BAT pattern).
- `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `LICENSE` (MIT), `.github/workflows/ci.yml` (tsc + eslint + vitest + cargo clippy + adapter schema check + **SPEC §5.1 seed-diff script**).
- `adapters/schema.json` (named strategies, stopButtonSelectors, thinkingDetectors object form — SPEC §5) + 4 seed adapter JSONs **exactly matching SPEC §5.1** (selectors copied verbatim from `refs/multi-ai-chat/src/content/<provider>.ts`).
- `shared/constants.ts` includes SSO allowlist (SPEC §6.3) + sentinel segment size constant (SPEC §7.3).

**Acceptance**
- `pnpm tauri dev` opens a window rendering the control pane shell (empty panes ok).
- `pnpm verify` (tsc + lint + vitest) and `cargo clippy` pass. CI green on push.

**Prereq**: VS Build Tools C++ (user must approve UAC install — currently pending).

## M1 — Bridge spike ⚠ risk gate (M)

**Goal**: prove D3 transport on real WebView2 before building anything on it.

**Deliverables**
- `webviews.rs`: async `provider_open` (chatgpt only), data_directory profile, bootstrap injection.
- `injected/bootstrap.ts` + build step (esbuild → IIFE string embedded via `include_str!`) — subframe guard, bootId, U+200B title codec, ack handler (SPEC §7.0/§7.2/§8.1).
- `bridge.rs`: title codec ingestion (lastSeq dedup per bootId) + sentinel interception (`mid`/`segIdx`/`segTotal`/`len` reassembly, 30s drop, 10MB cap, ack eval) + `provider_eval` dispatch; dumb bus → `bridge://msg` (SPEC §7.3/§7.4).
- Echo harness in control pane dev panel: eval a ping into the page; page answers via title (small) and sentinel nav (multi-segment bulk at 8KB/seg).
- Probe: does child `Webview` expose `eval_with_callback`? Record verdict in `plans/m1-bridge-findings.md`.

**Acceptance (all measured, written to plans/m1-bridge-findings.md)**
- Round-trip ping < 200ms; 192KB payload reassembles at 8KB/seg incl. out-of-order + duplicate-segment injection tests; measured max reliable sentinel URL size recorded (may raise the constant); ack flow verified (blocked second bulk until ack; retry-once on 5s timeout).
- Title: restored ≤ 50ms; seq replay dropped; emit survives page-driven title churn (retry-once verified); bootId rotation invalidates buffers.
- Page survives 100 sentinel navs with no history/beforeunload/SPA-router side effects; bootstrap re-arms with fresh bootId after hard reload; engine re-push on `dom:'unknown'` (SPEC §8.1 step 7) ≤ 2s.
- **Gate decision recorded**: exactly ONE bulk transport chosen (sentinel vs eval_with_callback pull) and SPEC §7.3 amended; worst case (both unusable) escalates scoped remote IPC design to orchestrator sign-off before M2.

## M2 — Providers + adapters + engine (L)

**Deliverables**
- `injected/engine.ts`: full base.ts port (transport-shimmed) + **named input strategies** `default`/`prosemirror-paste`/`quill-angular` ported verbatim (SPEC §8.2) + error-as-DONE (§8.3).
- `adapters.rs`: load bundled adapters, validate, select per provider; boot lifecycle per SPEC §8.1 (HELLO/bootId → engine eval → ADAPTER_UPDATE → CHECK_STATUS, debounced re-push).
- All 4 providers open/close/show/hide/bounds (lazy creation + placeholder panes); navigation policy table (§6.3); per-provider profiles; ProviderState tri-state + staleness watchdog (§9.1); ConnectionBar 4-state chips (§10); OPEN_LOGIN per-provider table (§10.1).
- Send path: control pane input → SEND_MESSAGE → strategy injection → send; receive path: chunks/done → ChatArea streaming bubbles; DONE authority = §7.3-pulled bulk DONE only (§7.5; M1 gate selected `eval_with_callback` pull — includes outbox/peek/ack in bootstrap, pull loop in control pane, and sentinel ingest removal).

**Acceptance**
- Manual: log into all 4 providers → restart app → still logged in.
- Send "hello" to all sendable providers; streamed responses render per provider; RESPONSE_DONE marks bubbles final.
- Kill a provider's selectors (edit adapter to garbage) → broken-adapter banner appears, others unaffected.
- Gemini login attempt documented (expected blocked; banner + system-browser guidance shown).

## M3 — Workflow engine (M)

**Deliverables**
- `src/workflow/`: sendAndWait + 5 mode handlers ported; **waitForResponse registry lives here, not Rust** (SPEC §7.4); golden vitest suite reproduces original ordering (incl. coding 8-step, roundtable 5×4 history, ROLE_ASSIGNMENT consumption order, error-as-DONE unblocking, free-mode default-targets parity); serial preflight dialog (§9.2); step timeout UI (countdown, retry, skip with `"(no response — skipped)"` substitution); CANCEL_WORKFLOW abort flag + best-effort `stopButtonSelectors` click; `targets` chips for free mode.

**Acceptance**
- Golden tests pass with mocked host (incl. preflight block + skip-substitution cases).
- Live debate mode across ≥2 logged-in providers completes; starting debate with an unavailable role provider is blocked with reassignment offer; cancel mid-run stops cleanly (stop-click observed best-effort); a timed-out step offers retry/skip and workflow continues.

## M4 — Control pane UX (M)

**Deliverables**
- Dock layout grid (left/center/right), draggable column widths, pane slot assignment, hidden-pane liveness; pane chrome (show/hide/reload/login/report); overlay guard (modals hide overlapping webviews); degraded-state banners; export .md; HackMD publish (Rust command); SettingsModal (token, adapter channel, layout).

**Acceptance**
- Resize/show/hide keeps webview geometry glued to slots (no drift at 125%/150% DPI zoom).
- Modal open ⇒ webviews hidden ⇒ restore on close. Export + publish work.

## M5 — Adapter hot-update + report (S/M)

**Deliverables**
- reqwest fetch loop (startup + 6h), validation, last-known-good cache, ADAPTER_UPDATE push, downgrade toast; REPORT_BROKEN: DOM digest (≤10KB, selectors miss context), user preview + confirm → prefilled GitHub issue URL via opener.

**Acceptance**
- Point base URL at a test branch with changed adapterVersion → app picks it up without restart. Corrupt remote JSON → cache retained + warning. Report flow opens a correct prefilled issue.

## M6 — Packaging + release (M)

**Deliverables**
- `tauri.conf.json` finalized (identifier, NSIS, downloadBootstrapper, updater artifacts, minisign pubkey); `release.yml` (tag → verify → build → GitHub Release + latest.json; portable zip job + PORTABLE marker disables updater); README (install, SmartScreen note, portable caveats), CONTRIBUTING (adapter PR SOP); v0.1.0 tag → first Release.

**Acceptance**
- Fresh Windows VM (or clean profile): installer installs + runs; portable zip runs; updater detects a staged v0.1.1; adapter-only PR triggers schema CI only.

---

## Working agreements (all milestones)

1. **Dispatch**: one codex /goal per milestone with SPEC §refs + acceptance list inline; large milestones (M2) may split into 2 dispatches (engine port / webview mgmt).
2. **Safety**: commit before every dispatch; codex is unsandboxed — review `git diff --stat` first, then full diff of key files; never let codex touch `refs/`, `docs/ARCHITECTURE.md`, `docs/SPEC.md`.
3. **Review chain**: codex implements → Claude reviews diff vs acceptance → grok reviews on M1/M2/M3 exits (protocol + engine are the risk areas) → Claude final gate → commit + `plans/<milestone>-log.md` entry.
4. **Blocked?** codex writes findings to `plans/` and stops rather than improvising around SPEC.
5. Effort key: S ≈ half day, M ≈ 1–2 days, L ≈ 3+ days (agent-days, parallelizable inside milestone).
