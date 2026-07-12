# Contributing

Before opening a pull request, read [`SECURITY.md`](./SECURITY.md) and the current evidence in [`docs/COMPATIBILITY.md`](./docs/COMPATIBILITY.md). Never attach cookies, tokens, account data, conversation text, provider HTML, or local profile files.

## Adapter PR SOP

Adapters live in `adapters/*.json` and must validate against `adapters/schema.json`.

For selector updates:
1. Change only the affected provider adapter unless a schema change is intentional.
2. Preserve ordered selector semantics; first match wins.
3. Keep `schemaVersion` unchanged unless parser compatibility changes.
4. Increment `adapterVersion` for content updates.
5. Keep `urls.app`, `urls.login`, `urls.match`, and `urls.ssoMatch` inside the URL scopes bundled with the installed app. New or broader scopes require an app release and security review; remote hot updates are rejected if they expand them.
6. Smoke-test login, prompt insertion, automatic send, completion detection, response capture, and new-session behavior. Check image-only completion when supported.
7. Run `pnpm verify` and `cargo test --manifest-path src-tauri/Cargo.toml adapters::tests`.

New providers are not adapter-only in v1. The fixed provider set is `chatgpt`, `claude`, `gemini`, and `grok`; adding another provider requires code and UI changes per `docs/SPEC.md` section 4.

Use the repository's adapter issue form and pull-request checklist so reports remain reproducible and privacy-safe. Vulnerabilities must be reported privately according to [`SECURITY.md`](./SECURITY.md), not through a public adapter issue.

## Agent Source Contract SOP

The Agent-ready source lane is a maintained product surface. Read [`agent-release.json`](./agent-release.json) and [`docs/AGENT-READY-SOURCE-RELEASE.md`](./docs/AGENT-READY-SOURCE-RELEASE.md) before changing `.agents/`, `.claude/`, or `scripts/agent/`.

1. Keep `agent-release.json`, its schema, package scripts, lifecycle scripts, and both Skill bodies aligned. Bump the contract/Skill version together for an incompatible interface change.
2. Preserve explicit-only invocation. Opening the repo must never launch code or install anything.
3. Keep project-local actions separate from host changes. Lifecycle scripts must not install/uninstall host tools or global packages, elevate privileges, modify `PATH`/profiles/security settings, or perform automatic rollback.
4. Preserve one-object JSON stdout, documented exit codes, current-run READY evidence, and identity-verified stop behavior. Process creation alone is not readiness.
5. Update side-effect and privacy declarations whenever a script writes a new path, uses a new shared cache, or accesses new application data.
6. Keep Codex and Claude Skill instruction bodies synchronized; only tool-specific frontmatter/metadata may differ.
7. Run `pnpm agent:verify`, `node scripts/agent/launch.mjs --dry-run --json`, and `pnpm verify`. CI reruns the contract tests on Windows, macOS, and Linux.
8. Do not add Docker, an embedded agent runtime, daemon, installer generation, credential access, log upload, or host package-management behavior to this lane.
