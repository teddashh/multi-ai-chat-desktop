# Release Ritual

> Project status: **feature-frozen after the AI-Sister commemorative edition**. Later releases are reserved for provider compatibility, security, build-breakage, and release-critical fixes.

Releases are tag-driven. You push a version tag; CI builds all three platforms and creates a
**draft** GitHub Release with the artifacts attached. You review the draft and click **Publish
release** when ready — the pipeline never creates tags and never auto-publishes.

Example:

```sh
git tag -a v1.0.1 -m "v1.0.1: fix macOS Gatekeeper packaging"
git push origin v1.0.1
```

Then wait ~10-20 min for the `Release` workflow, open the draft Release on GitHub, check the attached
Windows `.exe`/`.zip`, macOS `.dmg`, and Linux `.AppImage`, and click **Publish release**. To scrap a
build, just delete the draft (and the tag) — nothing is public until you publish.

## Version From Tag

The release workflow runs only for `v*` tag pushes. It strips the leading `v` and injects that version into `package.json` and `src-tauri/tauri.conf.json` inside the CI checkout before `pnpm tauri build`.

The repository keeps development metadata at `0.0.0`; release builds receive their real version from the tag:

```sh
git tag -a v1.0.1 -m "v1.0.1: fix macOS Gatekeeper packaging"
git push origin v1.0.1
```

## What CI Produces

- Windows: NSIS setup `.exe` and a portable `.zip`.
- Linux: `.AppImage`.
- macOS: ad-hoc-signed `.dmg`; CI mounts it and strictly verifies the embedded `.app` signature.

Portable Windows builds include a `PORTABLE` marker next to the app `.exe`. Portable mode hides the in-app updater UI (the Settings update section is not shown), so portable users update by downloading a newer release from GitHub Releases manually. Installed (non-portable) users can use Settings -> Check for updates to detect a newer release and open its download page.

## User Notes

- Windows artifacts are unsigned for now. SmartScreen may warn; users can choose More info -> Run anyway.
- Windows portable builds require the Microsoft Edge WebView2 Evergreen Runtime.
- macOS artifacts use Tauri's ad-hoc signing identity but are not notarized. After one launch attempt, users open System Settings -> Privacy & Security -> Security -> Open Anyway. The option is normally available for about one hour. `v1.0.0` must not be redistributed because it was emitted without a bundle signature.

## Final Verification

- Run `pnpm verify` (including `pnpm agent:verify`), Rust tests, `cargo fmt -- --check`, and `cargo clippy --all-targets -- -D warnings`.
- Validate `agent-release.json` against its schema, confirm both Skill bodies remain synchronized and explicit-only, and inspect `node scripts/agent/launch.mjs --dry-run --json` for zero writes. The source lane never installs host prerequisites or builds release artifacts.
- Confirm the default capability targets only `webviews:["main"]`, has no `windows` or `remote` entry, and the packaged control pane still supports update checks and export under the production CSP.
- Confirm remote adapter tests permit selector/timing changes inside bundled URL scopes and reject provider/login/match/SSO expansion.
- Update [`docs/COMPATIBILITY.md`](./COMPATIBILITY.md) with only evidence actually observed. CI packaging is not an end-user launch result.
- Before publishing, smoke-test Windows artifacts. macOS and Linux remain explicitly CI-only until a real-device report is recorded.

## Frozen Distribution Policy

- The final identifier is `com.tedh.multiaichat`.
- GitHub Releases remains the update channel. The app may check for a newer release and open its page, but it does not download or install updates itself.
- The repository tag also carries the Agent-Ready Source Release manifest and Skills, but they launch only `tauri dev` from a trusted checkout. They are not a packaged artifact, container, updater, or host-tool installer. See [`AGENT-READY-SOURCE-RELEASE.md`](./AGENT-READY-SOURCE-RELEASE.md).
- Windows Authenticode signing, macOS Developer ID/notarization, updater manifests, and a separate package-manager distribution program are closed scope, not active roadmap items. Ad-hoc macOS signing is a required packaging-integrity baseline, not an identity/notarization program.
- Every release tag must pass `pnpm verify`, cross-platform `cargo clippy -- -D warnings`, and the three-platform bundle workflow before its draft is published.
