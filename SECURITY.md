# Security Policy

## Supported versions

Security fixes are maintained on the latest `main` branch and the latest published GitHub Release. Older releases may be asked to upgrade before a report is investigated.

| Version | Supported |
|---|---|
| Latest published release | Yes |
| Current `main` | Yes |
| Older releases | No |

## Report a vulnerability

Do not open a public issue for a vulnerability or include cookies, account data, conversation text, provider-page HTML, access tokens, or local profile files in a report.

Use GitHub's private **Report a vulnerability** form under the repository Security tab when available. Otherwise email [TED@TED-H.com](mailto:TED@TED-H.com) with the subject `[security] multi-ai-chat-desktop`.

Please include:

- affected app version, commit, operating system, and installation type;
- a minimal reproduction that uses test data and a disposable provider account where possible;
- the expected and observed security boundary;
- whether provider cookies, local files, Tauri commands, adapter updates, or exported diagnostics are involved;
- any suggested mitigation and whether disclosure is time-sensitive.

This is a feature-frozen, best-effort open-source project and does not promise a response SLA. Reports that can expose user data or cross the local/remote trust boundary are prioritized.

## Security boundaries

- Provider pages are untrusted remote content. Their `ai-<provider>` webviews receive no Tauri capability and no `remote.urls` permission.
- Only the bundled local `main` control webview receives the app command capability. Rust commands also verify the calling control webview.
- The bundled control UI uses a production Content Security Policy. Development keeps CSP disabled for the local Vite server.
- Remote adapter updates are data-only JSON. They may update selectors, approved input/send strategies, and timing, but cannot expand the bundled provider, login, match, or SSO URL scopes.
- Provider cookies and profiles stay in the local app-data directory. The project has no conversation server, telemetry endpoint, or account backend.
- Debug bundles and Markdown exports are created only after explicit user action. The adapter diagnostic report excludes page text, input values, cookies, storage, query strings, and fragments.

Provider account security, provider service availability, provider terms, browser-engine vulnerabilities, and a compromised local machine remain outside this application's security boundary.

## 繁體中文摘要

請勿用公開 Issue 回報漏洞，也不要附上 cookie、帳號資料、對話文字、token、provider HTML 或本機 profile。優先使用 GitHub Security 頁面的私人 **Report a vulnerability**；若該功能不可用，請寄信至 [TED@TED-H.com](mailto:TED@TED-H.com)，主旨使用 `[security] multi-ai-chat-desktop`。

遠端 provider webview 沒有 Tauri 權限；只有本機 `main` 控制介面可呼叫 app command。遠端 adapter 只能更新受限 JSON，不能新增或放寬 provider／登入／SSO 網域範圍。
