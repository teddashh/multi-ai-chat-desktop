# Release Ritual

Releases are tag-driven. You push a version tag; CI builds all three platforms and creates a
**draft** GitHub Release with the artifacts attached. You review the draft and click **Publish
release** when ready — the pipeline never creates tags and never auto-publishes.

The whole ritual:

```sh
git tag v0.1.0
git push origin v0.1.0
```

Then wait ~10-20 min for the `Release` workflow, open the draft Release on GitHub, check the attached
Windows `.exe`/`.zip`, macOS `.dmg`, and Linux `.AppImage`, and click **Publish release**. To scrap a
build, just delete the draft (and the tag) — nothing is public until you publish.

## Version From Tag

The release workflow runs only for `v*` tag pushes. It strips the leading `v` and injects that version into `package.json` and `src-tauri/tauri.conf.json` inside the CI checkout before `pnpm tauri build`.

Example:

```sh
git tag v0.1.0
git push origin v0.1.0
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

## Before The First Tag

- Confirm the app identifier is final: `com.tedh.multiaichat`.
- Replace the placeholder icon set with a real logo at least 1024px source resolution.
- Decide the committed baseline version before tagging.

## Later Release Hardening

- Add Windows Authenticode signing.
- Add macOS signing and notarization.
- Add a local `pnpm tauri build` release gate once Rust/toolchain prerequisites are ready on the release machine.
