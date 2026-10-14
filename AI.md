# AI Handoff Guide

This file is the first stop for AI agents. Read this before scanning the repo.

## Repository purpose

`omniroute-agent-extension` is an OmniRoute extension for Pi Coding Agent, Oh My Pi, and Prime Agent.

It does four jobs:

1. `/omni setup` saves OmniRoute URL/API key into the selected agent home and tests protected endpoints with the entered key.
2. `/omni sync` fetches OmniRoute `/v1/models` and syncs models into the host `/model` picker. Configured sessions also perform one quiet sync on startup; repeating autosync is off unless the user enables it.
3. The extension registers one `omni` provider that routes through the host's built-in `openai-completions` handler.
4. Gateway telemetry reports OmniRoute tok/s, cost, token counts, cache state, and routed model/provider when the gateway emits them.

## Files

| Path | Purpose |
|---|---|
| `shared.ts` | Shared implementation: commands, sync, pricing map, provider registration, health checks, connection log. |
| `omp.ts` | Oh My Pi entrypoint. Uses `OMP_HOME` / `~/.omp/agent`. |
| `pi.ts` | Pi Coding Agent entrypoint. Uses `PI_CODING_AGENT_DIR` / `~/.pi/agent`. |
| `prime.ts` | Prime Agent entrypoint. Uses `PRIME_AGENT_CODING_AGENT_DIR` / `~/.prime/agent`. |
| `telemetry.ts` | Gateway telemetry parsing for headers, JSON bodies, and final streaming SSE usage. Never invents tok/s from latency. |
| `test/shared.test.ts` | Shared extension tests. |
| `test/catalog-sync.test.ts` | HTTP-to-scratch-catalog integration proof: configured/canonical query, chat filtering, metadata, preservation on unusable responses. |
| `test/thinking-sync.test.ts` | HTTP sync proof: effective controls override legacy maps for a new provider; explicit maps survive repeat sync; generic tiers do not invent controls. |
| `scripts/verify-local-thinking.mjs` | Installation-specific proof using Pi 1.2.0's real extension loader and adapter, plus OmniRoute 3.8.51 source and server bundle caps. |
| `scripts/verify-live-thinking.py` | One short live Codex max request (optional model argument); verifies requested/upstream effort in the call log. Uses inference quota. |
| `scripts/verify-local-kiro-thinking.mjs` | Real Pi loader/sync/adapter plus installed Kiro translator: 5.5 effort fields, tool history, sampling removal, Sonnet output cap, compiled gates. |
| `scripts/verify-live-kiro-thinking.py` | Four short quota-consuming Kiro 5.5 requests at xhigh/max; confirms same-model HTTP 200 without inventing effort telemetry. |
| `scripts/verify-universal-thinking.mjs` | Real Pi loader/sync/picker/request proof across providers, fixed aliases, budget controls, and unknown/dynamic routes; no inference. |
| `scripts/verify-live-universal-thinking.mjs` | Actual local catalog and Pi sync proof; scratch by default, `--sync` backs up and refreshes the real models.json. No inference. |
| `docs/universal-thinking-plan.md` | Effective server-control contract and verification acceptance conditions. |
| `docs/fork-snapshot-2026-10-14.md` | Fork branches, source baselines, published scope, and local verification limits. |
| `docs/thinking-controls-2026-10-14.md` | Local patch details, verification results, activation, and update limitations. |
| `test/telemetry.test.ts` | Telemetry parser and streaming capture tests. |
| `README.md` | User-facing install/setup/usage docs. |
| `ARCHITECTURE.md` | Data flow and routing docs. |
| `AGENTS.md` | Mandatory instructions for AI agents editing this repo. |
| `CONTRIBUTING.md` | Dev workflow and contribution rules. |
| `docs/contribution-plan-model-sync.md` | Configured/canonical catalog contribution plan and separate future capability-aware thinking work. |
| `package.json` | Package metadata, host manifests, scripts. |

## Key concepts

### Provider name

The host provider is always:

```text
omni
```

Users switch models normally:

```text
/model cx/gpt-5.5
/model auto/coding
```

Do not create duplicate providers unless explicitly asked.

### Provider API

All synced models register with:

```ts
const PROVIDER_API = "openai-completions";
```

The extension does not proxy chat requests. The host sends requests directly to OmniRoute, preserving native SSE streaming and native `tool_calls`.

### Prime Agent manifest behavior

Prime Agent currently reads the Pi-compatible manifest path. `prime.ts` is included under `pi.extensions` in `package.json`. Do not add a separate top-level `prime` manifest key unless real Prime runtime behavior or docs require it.

## Important functions in `shared.ts`

Read in this order:

1. `createOmniExtension()` — entrypoint used by `pi.ts`, `omp.ts`, and `prime.ts`.
2. `runSetup()` — setup flow, health probe, provider registration, config save.
3. `fetchSyncedModels()` — requests `/v1/models?configuredOnly=true&prefix=canonical`, rejects invalid/empty/chat-less catalogs before registration/persistence, filters explicit non-chat types and raw non-chat output, maps metadata and pricing. Unknown output metadata stays eligible; user globs run afterward in `discoverModels()`.
4. `normalizeCost()` — maps OmniRoute `pricing` into host model `cost`.
5. `discoverModels()` — combines auto models with synced models.
6. `buildProviderModelConfig()` — converts a synced model into host provider config.
7. `persistModelsJson()` — updates only `providers[providerName]` in `models.json`.
8. `reloadProviderFromModelsJson()` — loads saved catalog and normalizes legacy API identifiers.
9. `checkHealth()` / `isOmniRouteReachableHttpStatus()` — treat HTTP `< 500` as reachable.

`normalizeThinkingLevelMap()` validates wire mappings. Sync prefers effective `capabilities.thinking_controls.level_map`, then the legacy catalog map, then a saved same-ID map. Do not add a provider/model list in the extension or infer controls from generic `effort_tiers`. Route differences are resolved by OmniRoute. Unknown/dynamic routes keep conservative legacy host choices.

## Catalog autosync

Autosync behavior lives in `createOmniExtension()`:

- On `session_start`, after a successful health probe, run one quiet sync for configured agents.
- Repeating autosync is controlled by `autoSyncIntervalMinutes` and defaults to `0` (off).
- `/omni autosync on` sets `60` minutes.
- `/omni autosync <number>` treats the number as minutes; `<Nm>` and `<Nh>` are accepted.
- Minimum repeat interval is 5 minutes; lower non-zero values clamp to 5.
- `OMNIROUTE_AUTO_SYNC_INTERVAL_MINUTES` overrides config.
- Always clear interval timers on `session_shutdown`; do not leak duplicate timers across sessions.

## Pricing mapping

OmniRoute `/v1/models` pricing uses USD per million tokens. The host cost object uses the same units.

| OmniRoute field | Host cost field |
|---|---|
| `pricing.input` | `cost.input` |
| `pricing.output` | `cost.output` |
| `pricing.cached` | `cost.cacheRead` |
| `pricing.cache_creation` | `cost.cacheWrite` |

Missing fields become `0`; missing `pricing` keeps the zero-cost fallback.

## Gateway telemetry

`telemetry.ts` wraps host `fetch` only for configured OmniRoute inference URLs:

- `/v1/chat/completions`
- `/v1/responses`
- `/v1/messages`

It reads telemetry from:

- `X-OmniRoute-*` response headers
- JSON `usage.tokens_per_second`
- final streaming SSE `usage.tokens_per_second`

Never calculate tok/s from latency. OmniRoute owns that measurement.

## Common change requests

### Change OmniRoute sync metadata

Update together:

```ts
OmniApiModel
SyncedModel
fetchSyncedModels()
buildProviderModelConfig()
```

Add or update `test/shared.test.ts`.

### Change pricing behavior

Update `normalizeCost()` and the sync test. Keep negative, missing, and non-finite values from leaking into model config.

### Change setup behavior

Update `runSetup()`. Preserve the current order: verify/register first, then save config. Protected OmniRoute servers may require Authorization for `/v1/models`.

### Change telemetry behavior

Update `telemetry.ts` and `test/telemetry.test.ts`. For streaming, prove the response body still reaches the caller unchanged.

## Test commands

```bash
npm test
npm run typecheck
npm run smoke
npm pack --dry-run
```

Expected smoke output:

```text
omp ok
pi ok
prime ok
```

## Pitfalls

- Do not reintroduce the old `index.ts` single-entry architecture.
- Do not revive prompt-emulated tool routing unless explicitly asked; current routing uses host-native `openai-completions`.
- Do not put `omp.ts` under `pi.extensions`; OMP belongs under `omp.extensions`.
- Do not remove Prime support when porting old PRs.
- Do not derive tok/s locally from latency.
- Do not overwrite the whole docs from stale PR branches; preserve current Pi/OMP/Prime and telemetry docs.
