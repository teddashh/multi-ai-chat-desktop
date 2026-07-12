## Summary

- What changed and why?
- Which provider, workflow, platform, or security boundary is affected?

## Validation

- [ ] `pnpm verify`
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` when Rust changed
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` when Rust changed
- [ ] Relevant manual smoke steps are listed with platform and app/adapter versions
- [ ] No cookies, tokens, account data, conversation text, provider HTML, or local profile files are included

## Adapter changes

Complete this section when `adapters/*.json` changes.

- [ ] Only the affected provider adapter changed
- [ ] `adapterVersion` increased
- [ ] Ordered selector fallback behavior is preserved
- [ ] URL fields do not expand provider, login, match, or SSO scope without an app release and security review
- [ ] Login, prompt insertion, automatic send, completion detection, response capture, and new-session behavior were smoke-tested
- [ ] Image-only completion was checked when the provider supports image generation
