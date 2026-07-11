# Release Ritual

> Project status: **feature-frozen after the AI-Sister commemorative edition**. Later releases are reserved for provider compatibility, security, build-breakage, and release-critical fixes.

Releases are tag-driven. You push a version tag; CI builds all three platforms and creates a
**draft** GitHub Release with the artifacts attached. You review the draft and click **Publish
release** when ready — the pipeline never creates tags and never auto-publishes.

Example:

```sh
git tag -a v1.0.0 -m "v1.0.0: AI-Sister Commemorative Edition"
git push origin v1.0.0
```

Then wait ~10-20 min for the `Release` workflow, open the draft Release on GitHub, check the attached
Windows `.exe`/`.zip`, macOS `.dmg`, and Linux `.AppImage`, and click **Publish release**. To scrap a
build, just delete the draft (and the tag) — nothing is public until you publish.

## Version From Tag

The release workflow runs only for `v*` tag pushes. It strips the leading `v` and injects that version into `package.json` and `src-tauri/tauri.conf.json` inside the CI checkout before `pnpm tauri build`.

The repository keeps development metadata at `0.0.0`; release builds receive their real version from the tag:

```sh
git tag -a v1.0.0 -m "v1.0.0: AI-Sister Commemorative Edition"
git push origin v1.0.0
```

## What CI Produces

- Windows: NSIS setup `.exe` and a portable `.zip`.
- Linux: `.AppImage`.
- macOS: `.dmg`.

Portable Windows builds include a `PORTABLE` marker next to the app `.exe`. Portable mode hides the in-app updater UI (the Settings update section is not shown), so portable users update by downloading a newer release from GitHub Releases manually. Installed (non-portable) users can use Settings -> Check for updates to detect a newer release and open its download page.

## User Notes

- Windows artifacts are unsigned for now. SmartScreen may warn; users can choose More info -> Run anyway.
- Windows portable builds require the Microsoft Edge WebView2 Evergreen Runtime.
- macOS artifacts are not notarized yet. Gatekeeper may block first launch; users can right-click the app and choose Open.

## Frozen Distribution Policy

- The final identifier is `com.tedh.multiaichat`.
- GitHub Releases remains the update channel. The app may check for a newer release and open its page, but it does not download or install updates itself.
- Windows Authenticode signing, macOS signing/notarization, updater manifests, and a separate package-manager distribution program are closed scope, not active roadmap items.
- Every release tag must pass `pnpm verify`, cross-platform `cargo clippy -- -D warnings`, and the three-platform bundle workflow before its draft is published.
