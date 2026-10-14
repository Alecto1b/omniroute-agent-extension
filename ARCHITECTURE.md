# Architecture

## Overview

This package provides OmniRoute extensions for Pi Coding Agent, Oh My Pi, and Prime Agent. The host-specific entrypoints call the shared implementation:

```text
pi.ts     -> createOmniExtension({ homeEnvVar: PI_CODING_AGENT_DIR, defaultHome: ~/.pi/agent })
omp.ts    -> createOmniExtension({ homeEnvVar: OMP_HOME, defaultHome: ~/.omp/agent })
prime.ts  -> createOmniExtension({ homeEnvVar: PRIME_AGENT_CODING_AGENT_DIR, defaultHome: ~/.prime/agent })
```

The extension registers `/omni` commands, an `omni` provider, two model-management tools, health monitoring, and gateway telemetry.

## Data flow: setup

```text
/omni setup
  -> ask user for OmniRoute URL
  -> ask user for API key
  -> verify URL with authenticated GET /v1/models when key is present
  -> save <agent-home>/omniroute-agent-extension/config.json
  -> discover models
  -> write <agent-home>/models.json
  -> register/refresh omni provider
```

Saved provider shape:

```json
{
  "providers": {
    "omni": {
      "baseUrl": "https://example.com/v1",
      "api": "openai-completions",
      "apiKey": "...",
      "authHeader": true,
      "models": []
    }
  }
}
```

## Data flow: sync

```text
/omni sync
  -> GET {OMNI_URL}/v1/models?configuredOnly=true&prefix=canonical
  -> reject invalid or empty data before provider registration/persistence
  -> filter explicit non-chat types and raw image/video/audio-only output
  -> reject a catalog with no chat models before applying user include/exclude globs
  -> normalize input modalities
  -> copy context/max token/reasoning metadata
  -> copy effective thinking_controls.level_map, legacy catalog map, or saved same-ID map
  -> map OmniRoute pricing into host model cost
  -> write config.providers.omni.models
  -> refresh host model registry
  -> re-register omni provider
```

All hosts and sync entrypoints use `fetchSyncedModels()` through `discoverModels()`. The guard runs before built-in auto models are prepended, so they cannot mask an empty server catalog. Unusable catalogs throw through the existing error flow and leave saved and registered models unchanged. User filters may intentionally produce an empty selection after validation.

Missing or unknown output metadata remains compatible; output with text remains eligible for multimodal chat. Valid route/effort variants are not deduplicated by suffix or provider assumptions. Server configured-only/canonical filtering is not an inference-access check. Older servers may ignore the parameters; request errors never fall back to the full catalog.

`normalizeThinkingLevelMap()` retains only host thinking-level keys with string wire values or `null` (unsupported). `fetchSyncedModels()` prefers `capabilities.thinking_controls.level_map`, then a legacy catalog `thinkingLevelMap`, then a saved same-ID map. Generic effort arrays do not establish effective controls. `buildProviderModelConfig()` carries the mapping through registration and persistence. The extension has no provider/model list for thinking and does not rewrite inference requests. The installed OmniRoute resolver shares Codex wire caps and Kiro profile data with adapters; it publishes native/budget/fixed maps and leaves unknown/dynamic choices to legacy host behavior. Server implementation details are in `docs/thinking-controls-2026-10-14.md`.

Pricing map:

| OmniRoute `/v1/models` field | Host model `cost` field |
|---|---|
| `pricing.input` | `cost.input` |
| `pricing.output` | `cost.output` |
| `pricing.cached` | `cost.cacheRead` |
| `pricing.cache_creation` | `cost.cacheWrite` |

Missing pricing fields become `0`; models without a `pricing` object keep zero cost.

## Catalog autosync

Configured sessions perform one quiet catalog sync on `session_start` after the `/v1/models` health probe succeeds. This keeps the picker fresh once per session without requiring a manual `/omni sync` every time.

Repeating background autosync is off by default:

```json
{
  "autoSyncIntervalMinutes": 0
}
```

Users can enable or tune it with `/omni autosync`:

- `/omni autosync status` shows the current setting and whether the interval timer is active.
- `/omni autosync on` enables a 60-minute interval.
- `/omni autosync off` disables the repeating timer. Manual `/omni sync` still works.
- `/omni autosync 30` or `/omni autosync 2h` sets the interval in minutes or hours.

Intervals below 5 minutes clamp to 5 minutes. The implementation stores minutes in config and converts to milliseconds only for `setInterval()`. `session_shutdown` clears the timer so repeated sessions do not leak duplicate intervals. A new `session_start` stops any previous autosync timer before creating a new one.

The quiet startup sync does not depend on the repeating timer setting; `autoSyncIntervalMinutes: 0` means “do the startup sync, but do not keep syncing in the background.”

## Request routing

All synced models use the host's built-in OpenAI-compatible provider:

```ts
const PROVIDER_API = "openai-completions";
```

The extension does not proxy or rewrite chat requests. The host sends requests directly to OmniRoute, so native SSE streaming and native `tool_calls` stay intact.

Local installed-server fixes are recorded separately in `docs/thinking-controls-2026-10-14.md`. For Kiro Opus/Sonnet 5.5, Pi emits `reasoning_effort`; the patched OmniRoute translator builds `additionalModelRequestFields.output_config.effort` with adaptive thinking, and the Kiro executor preserves that envelope. Kiro Sonnet 5.5 output is capped at 64k on that route. These changes live in the installed OmniRoute source/bundle, not in the extension's HTTP routing.

## Gateway telemetry

After inference, the extension wraps host `fetch` for OmniRoute `/v1/chat/completions`, `/v1/responses`, and `/v1/messages` calls.

It captures:

- `X-OmniRoute-*` headers from non-streaming responses
- `usage.tokens_per_second` from JSON bodies
- final SSE `usage.tokens_per_second` from streaming responses
- routed model/provider, cost, token counts, cache state, and fallback count when OmniRoute emits them

The stream wrapper passes chunks through unchanged. It never derives tok/s from tokens divided by latency; missing gateway tok/s stays unavailable.

## Model persistence

`persistModelsJson()` preserves existing `models.json` content and replaces only `providers[providerName]`. Legacy catalog entries from earlier Pi-only releases are normalized to `openai-completions` on load.

## Health checks

`checkHealth()` probes `/v1/models` with the configured API key. HTTP responses below 500 count as reachable because 401/403 are auth/setup problems, not network downtime. Transport errors and 5xx responses are logged to `<agent-home>/omniroute-agent-extension/connection.log`.

## Auto models

The extension prepends OmniRoute virtual model IDs unless `/v1/models` already returns them:

```text
auto
auto/coding
auto/fast
auto/cheap
auto/offline
auto/smart
auto/lkgp
```

OmniRoute resolves these server-side.
