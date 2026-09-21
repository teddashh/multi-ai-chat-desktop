# AI-Sister Commemorative Edition

> Status: shipped in `v1.0.0` as the final optional presentation theme.
> Internal theme ID: `ai-sister`.
> Default theme: Light. Existing users are never switched automatically.

## Scope

AI-Sister Commemorative Edition keeps its original four-character ensemble for Multi-AI Chat Desktop and supplies an additional standalone Meta AI portrait for the optional provider. It changes only the app-owned interface: panel surfaces, accents, provider portraits, active-speaker states, process rows, and the compact ensemble hero. Provider webpages, automation selectors, workflow order, snapshots, and stored sessions are unchanged.

The supplied ensemble image is intentionally used as a compact hero and brand mark rather than a full-window background so its low-resolution detail remains readable. Provider portraits appear only where they improve speaker recognition; Meta AI does not alter the original four-character ensemble.

## Companion Brainstorm preset

The final **Brainstorm** preset is available in every visual theme, including Light and AI-Sister. It is intentionally separate from the commemorative artwork: four seats contribute in every one of 12 rounds, for 48 contributions total. The built-in assignment gives ChatGPT, Claude, Gemini, and Grok one seat each; preflight blocks the run and identifies the provider if any seat is unavailable, while Settings still permits a custom assignment. Each seat receives a distinct lens, the starting and closing seats rotate by round, and the workflow moves through framing, divergence, cross-pollination, harvesting, intentional selection, and testable concepts. Every contribution receives the prior same-session record, and the last speaker produces a decision-ready synthesis. Sessions and snapshots retain the `brainstorm` preset identity so the run can be restored or replayed without adding a sixth top-level chat mode.

## Character mapping

| Provider | Character treatment | Asset |
|---|---|---|
| ChatGPT | Black and green | `src/assets/themes/ai-sister/chatgpt.webp` |
| Claude | White and gold | `src/assets/themes/ai-sister/claude.webp` |
| Gemini | Lavender | `src/assets/themes/ai-sister/gemini.webp` |
| Grok | Black and violet | `src/assets/themes/ai-sister/grok.webp` |
| Meta AI (optional standby) | Black hoodie, sunglasses, and blue Meta marks | `src/assets/themes/ai-sister/meta.webp` |
| Ensemble | All four characters | `src/assets/themes/ai-sister/ensemble.jpg` |

## UI behavior

- Select **AI-Sister Commemorative Edition** in Settings → Theme.
- Provider portraits identify connection cards, transcript messages, active thinking, targets, and process-trace entries.
- Active speakers receive restrained glow and pulse treatment.
- The onboarding and connection grids remain readable at narrow widths.
- Keyboard focus, contrast, safe Markdown, and reduced-motion behavior are preserved.
- Third-party provider pages are never reskinned.

## Credits and rights

Made by **TED-H / Ted Huang** (`TED@TED-H.com`, [ted-h.com](https://ted-h.com)). Sponsored by [AI-Sister.com](https://ai-sister.com).

The six images were supplied by the project owner for this commemorative edition. The Meta AI portrait is copied byte-for-byte from the owner-controlled `teddashh/Multi-Ai-Chatapp` asset `web/public/avatars/venice.webp`; see `src/assets/themes/ai-sister/NOTICE.md` for the recorded digest and redistribution terms. The artwork is not independently licensed under the repository's MIT software license.

## Maintenance policy

The theme and its companion preset are feature-complete. Future work is limited to regressions that affect readability, accessibility, packaging, or provider compatibility; no additional character themes, workflow engines, or snapshot-related theme features are planned.
