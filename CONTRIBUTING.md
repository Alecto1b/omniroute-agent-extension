# Contributing

## Quick Start

```bash
npm install
npm run typecheck
npm test
npm run smoke
```

## Development Scripts

| Command | Purpose |
|---|---|
| `npm run typecheck` | Type-check both host entrypoints, shared code, and tests with NodeNext settings. |
| `npm test` | Run the focused Node test suite. |
| `npm run smoke` | Import both Pi and OMP entrypoints and verify they load. |

## Local Testing

Link the checkout into either host:

```bash
pi install /absolute/path/to/omniroute-agent-extension
omp plugin link /absolute/path/to/omniroute-agent-extension
```

Then in Pi or OMP:

```text
/omni setup
/omni sync
/model cgpt-web/gpt-5.4-pro
```

## Before Opening a PR

Run:

```bash
npm run typecheck
npm test
npm run smoke
```

Check working tree:

```bash
git status --short
git diff --stat
```

## Documentation Rules

If changing user-visible behavior, update `README.md`.

If changing architecture or core data flow, update `ARCHITECTURE.md`.

If changing function names or scan paths, update `AI.md` so future AI agents do not waste tokens rediscovering the repo.

## Coding Rules

- Keep extension in `index.ts` unless feature grows enough to justify splitting files.
- Add short comments for non-obvious functions.
- Preserve `/model` UX; do not add duplicate providers for prompt tools.
- Keep `omni` as provider name.
- Keep prompt fallback automatic.
- Avoid destructive behavior in `/omni sync`; it should only replace `config.providers.omni.models`.

## Testing (HARD)

Follow `AGENTS.md` Testing (HARD): prefer E2E with a verifiable artifact; do not write unit tests after the code; keep real integration, telemetry, and routing-correctness tests; delete only low-signal unit tests already covered by E2E.

## Focused catalog sync verification

`test/catalog-sync.test.ts` exercises real HTTP against a local fixture server and syncs into a scratch agent home. It checks the configured/canonical query, chat filtering, valid variants and metadata, preservation of another provider, and unchanged catalogs on unusable responses or request errors. It does not prove live OmniRoute account access or host picker behavior.

Capture its sanitized count/prefix summary as a repeatable artifact:

```bash
set -o pipefail
node --experimental-strip-types --test test/catalog-sync.test.ts | tee /tmp/omni-catalog-sync.log
```

## Testing Checklist

Thinking-control integration is covered by `test/thinking-sync.test.ts`: repeat HTTP sync must preserve explicit maps through persistence and registration, while unknown generic tiers remain unchanged. On the local Pi 1.2.0 / OmniRoute 3.8.51 installation, run `node scripts/verify-local-thinking.mjs` to check the real installed extension loader, `xhigh`/`max` request fields, source caps, and compiled server effort resolution. It uses scratch configuration and a localhost fixture, without paid inference. Its JSON output is the repeatable verification artifact; absolute installation paths make this diagnostic local-only.

`python3 scripts/verify-live-thinking.py` is a separate, opt-in quota-consuming check: it sends one short GPT-6.1 Sol max request by default, or the model passed as its first argument, and polls the corresponding call log to confirm upstream effort. Do not include it in the ordinary test suite.

For the local Kiro 5.5 patch, `node scripts/verify-local-kiro-thinking.mjs` checks repeat sync and Pi payloads, then executes the installed Kiro translator with native tools and previous tool history. It verifies effort fields, adaptive sampling restrictions, the Kiro Sonnet 5.5 64k output cap, and compiled server copies. `python3 scripts/verify-live-kiro-thinking.py` separately uses quota for four brief xhigh/max requests and confirms HTTP 200 from the selected model. Kiro's call-log effort columns are not populated, so this script intentionally does not claim effort telemetry from them.

`node scripts/verify-universal-thinking.mjs` covers real Pi consumption of effective metadata for Astra, Luna, Sol, Kiro, Gemini, a future provider, fixed aliases, and unknown/dynamic routes. `node scripts/verify-live-universal-thinking.mjs` verifies the actual server catalog with scratch configuration; add `--sync` only to intentionally refresh the user's real model list after creating a dated backup. Both print sanitized JSON proof and make no inference requests. `test/thinking-sync.test.ts` covers the equivalent shared extension contract, including precedence over a stale legacy map.

For another checkout, `verify-universal-thinking.mjs` accepts `OMNI_EXTENSION_PATH`, `PI_HOST_ROOT`, and `OMNIROUTE_SOURCE_ROOT`. The defaults target the documented local installation. Fork snapshot branches and source baselines are recorded in `docs/fork-snapshot-2026-10-14.md`.

For model sync changes:

- `/omni setup` saves URL/API key.
- `/omni sync` writes models to `~/.pi/agent/models.json`.
- Web-synced models get `tool_calling:false` even when `-web` only appears in OmniRoute `owned_by`/provider metadata.
- Normal models do not get forced into prompt mode.

For prompt tool changes:

- `npm run typecheck` passes.
- `npm run smoke` passes.
- A `tool_calling:false` model can trigger a tool call.
- A native model still uses native tool calls.
- Bad `<tool_call>` JSON surfaces correction text instead of silent failure.

## Commit Style

Use descriptive commit messages. Good examples:

```text
Add prompt-tool fallback for web-synced OmniRoute models
Document OmniRoute prompt tool architecture
Preserve raw tool_calling metadata during model sync
```
