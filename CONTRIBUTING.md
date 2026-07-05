# Contributing

## Adapter PR SOP

Adapters live in `adapters/*.json` and must validate against `adapters/schema.json`.

For selector updates:
1. Change only the affected provider adapter unless a schema change is intentional.
2. Preserve ordered selector semantics; first match wins.
3. Keep `schemaVersion` unchanged unless parser compatibility changes.
4. Increment `adapterVersion` for content updates.
5. Run `pnpm verify`.

New providers are not adapter-only in v1. The fixed provider set is `chatgpt`, `claude`, `gemini`, and `grok`; adding another provider requires code and UI changes per `docs/SPEC.md` section 4.
