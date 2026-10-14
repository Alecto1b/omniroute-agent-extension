# Local Pi / OmniRoute thinking fix

Installed host: Pi 1.2.0. Active extension: omniroute-pi-ext-integration 2.0.1. Server: OmniRoute 3.8.51.

## Automatic effective controls

The initial per-model configuration fix below has been replaced by automatic catalog metadata consumption. The installed extension and `shared.ts` prefer `capabilities.thinking_controls.level_map`, then a legacy catalog `thinkingLevelMap`, then a saved same-ID map. There is no thinking provider/model list in either extension. A new provider with declared native tiers works without a client edit; unknown capabilities do not inherit generic advertised high tiers as proof of support.

The installed OmniRoute source now has a pure resolver at `src/shared/reasoning/effectiveThinkingControls.ts`. Catalog enrichment publishes its controls. The Codex executor uses its effective wire cap; Kiro's adaptive gate and output window use the same profile data. Kiro profiles follow [Kiro's October 9 schemas](https://kiro.dev/docs/models/effort/), with the separately verified Opus 5.5 profile retained. Provider schemas remain adapter data on the server because accepted fields differ across routes; the client consumes the result generically.

The server distinguishes native effort, numeric budget presets, fixed/no-think aliases, and unknown/dynamic routes. Codex Astra/Sol/Luna models with effective max support expose it automatically. Kiro Opus/Sonnet 4.6 have low/medium/high/max, without xhigh; documented later profiles expose both xhigh and max. The current Gemini effort translator maps xhigh/max to the high numeric budget, so the picker does not pretend they create extra modes. Codex Ultra is a client preset sent as Max; Pi's picker ends at Max. Fixed Codex aliases expose their actual fixed tier, while genuine model names such as `gpt-5.1-codex-max` are not mistaken for aliases.

The shared resolver was type-stripped and embedded into 17 affected installed server chunks, covering two catalog enrichers, four Codex executor copies, nine Kiro adaptive gates, and three Kiro output-cap expressions (some share chunks). All 17 pass syntax checks. Source and compiled behavior are verified independently. Backups ending `.before-universal-thinking` preserve earlier GPT/Kiro fixes; real Pi configuration backup is `~/.pi/agent/models.json.backup-20261014-universal-thinking`.

Verification on October 14:

- `npm test`: 23/23; typecheck and Pi/OMP/Prime smoke imports pass.
- `verify-universal-thinking.mjs`: real installed Pi loader, two HTTP syncs, picker controls, and outgoing max for Astra, Kiro, and a future provider; fixed aliases, a genuine max model name, budget routes, and unknown/dynamic routes also checked. No paid inference.
- `verify-local-thinking.mjs`: source and four compiled Codex effort resolvers, plus three Chat-to-Responses copies, retain native max while preserving lower model caps.
- `verify-local-kiro-thinking.mjs`: actual installed translator preserves effort, native tool history, sampling restrictions, and output caps for all eight profiles; nine compiled gates and three compiled cap expressions match.
- `verify-live-universal-thinking.mjs --sync`: live catalog has 368 rows; effective kinds are native 55, fixed 58, budget 11, none 174, unknown 25, plus 45 auto routes without a concrete contract. Two scratch syncs and a backed-up real sync retain 195 chat models. 72 entries, including variants, expose xhigh or max. These counts do not prove inference access for every model.
- `python3 scripts/verify-live-thinking.py codex/gpt-6-astra`: HTTP 200, response OK, requested max and upstream max. Call ID `320f9228-50f8-4f82-b72f-f6e4a951ea5c`, same Codex model/provider, no recorded resilience actions. Usage: 26 prompt + 23 completion = 49 tokens, including 16 reasoning tokens. No full-catalog paid probing was performed.

OmniRoute is active/running. The real model configuration is already synced. In the open Pi session use `/reload`, `/model codex/gpt-6-astra`, then `/thinking` and choose `max`. Future catalog changes follow `/omni sync`; when a server publishes effective controls the client needs no per-model edits. Unknown routes retain the host's conservative legacy choices until their adapter contract is established. This patch does not change the global thinking default.

## Earlier GPT changes

- The installed Pi extension and the shared checkout sync preserve explicit `thinkingLevelMap` entries for the same model ID. An explicit catalog map takes precedence. Generic `effort_tiers` are not converted into controls because the current server advertises tiers that sometimes share one effective upstream mode.
- The saved `codex/gpt-6.1-sol` entry offers `low`, `medium`, `high`, `xhigh`, and `max`; `off` and `minimal` are unsupported. The saved `codex/gpt-6-sol` entry adds `xhigh` and `max` and hides `minimal`.
- OmniRoute's Codex source cap now permits `max` for `gpt-6.1-sol`. The same cap was applied to its four compiled server copies. Other model caps are unchanged. This deliberately does not add an `ultra` mode to GPT-6.1 Sol.
- The Chat Completions → Responses effort translator now recognizes GPT-6.1 Sol's native `max` tier. This was a second downgrade point exposed by the first live smoke request. Its three compiled server copies were updated as well; other models' translation remains unchanged.
- Config backup: `~/.pi/agent/models.json.backup-20261014-thinking`. Each modified compiled chunk has a `.before-thinking` sibling.

Official GPT-6.1 Sol effort contract: https://developers.openai.com/api/docs/models/gpt-6.1-sol

## Kiro Opus / Sonnet 5.5 extension

The initial installed OmniRoute adapter omitted effort for both 5.5 models: its adaptive allowlist contained only `claude-opus-5` and `claude-sonnet-5`. The initial patch added both 5.5 models; the automatic-control update above then consolidated documented profiles into shared adapter data. Unsupported models such as Sonnet 4.5 remain gated. The Kiro translator forwards native `output_config.effort` with adaptive thinking, preserves native tool history, and drops incompatible sampling controls.

Kiro Sonnet 5.5 has a 64k output cap, distinct from its direct Claude API cap. The route now applies that cap in source and three compiled translator copies. Pi has explicit low/medium/high/xhigh/max maps for the two base 5.5 IDs; `off` and `minimal` are hidden. No effort-suffixed or no-think aliases are changed. Config backup: `~/.pi/agent/models.json.backup-20261014-kiro-thinking`; modified server chunks have `.before-kiro-thinking` siblings. These backups preserve the earlier GPT patch.

Sources: https://platform.claude.com/docs/en/build-with-claude/effort and https://kiro.dev/docs/models/effort/

`node scripts/verify-local-kiro-thinking.mjs` first reproduced missing effort on an Opus 5.5 high request, then passed after the fix. It proves repeat sync, real Pi outgoing fields, high/xhigh/max Kiro envelopes, prior tool-history preservation, sampling removal, output caps, nine compiled gates, and three compiled output-cap expressions. Syntax validation passes for all eleven affected server chunks. Live acceptance is checked separately with `scripts/verify-live-kiro-thinking.py`; it uses inference quota and must not be included in the ordinary test suite.

After restarting OmniRoute, all four live requests returned HTTP 200 and `OK`, on the selected Kiro model with no recorded resilience actions:

| Model | Effort | Call log ID |
|---|---|---|
| `kiro/claude-opus-5.5` | `xhigh` | `cb5dece1-14f4-4223-987a-2edf87801af5` |
| `kiro/claude-opus-5.5` | `max` | `3256962c-ea02-4dd2-856f-755c5a55ae68` |
| `kiro/claude-sonnet-5.5` | `xhigh` | `f4b47ce1-5444-4846-9504-4a5b6d1a02f1` |
| `kiro/claude-sonnet-5.5` | `max` | `2ccd861f-0b1c-41b2-afe6-88811ec45c0f` |

Kiro call-log effort columns are only populated by the server's encrypted-reasoning observation path and remain null here. The local translator/bundle test provides effort wire-field proof; these live calls prove acceptance. They do not measure relative answer quality or force a fixed number of thinking tokens. GPT verification still passes after the Kiro patch. The full extension suite remains 23/23, with typecheck and all three host smoke imports passing.

In Pi, run `/reload`, then select `/model kiro/claude-opus-5.5` or `/model kiro/claude-sonnet-5.5`. Open `/thinking` and select `xhigh` or `max`. No global thinking default was changed. Existing effort-suffixed aliases retain their earlier behavior; use the base IDs for these controls.

## Verification

Before the fix, both HTTP sync tests lost the map, and the compiled Codex resolver changed GPT-6.1 Sol `max` to `xhigh`.

After the fix:

- `npm test`: 23 tests passed.
- `npm run typecheck` and `npm run smoke`: passed.
- `node scripts/verify-local-thinking.mjs`: the real Pi loader registered the patched installed extension; two syncs preserved the mapping; supported picker values were `low, medium, high, xhigh, max`; outgoing Pi request effort was `xhigh` and `max`; all four compiled server resolvers retained GPT-6.1 Sol `max` while preserving other model caps.
- The same diagnostic verifies source Chat → Responses normalization and all three compiled translator patterns.
- `node --check` passed for all seven modified compiled chunks.
- After restarting OmniRoute, `python3 scripts/verify-live-thinking.py` returned HTTP 200 and `OK`; the call log recorded requested `max` and upstream `max`. Usage: 26 prompt tokens, 31 completion tokens, including 24 reasoning tokens. One earlier live probe recorded `max` → `xhigh`, which identified the translator downgrade; the final probe proves it is resolved.

The fixture diagnostic makes no paid inference. It is installation-specific and requires localhost permission.

## Activation and maintenance

OmniRoute has been restarted and its service is active with the patched server chunks. In the already-running Pi session, run `/reload`, then `/model codex/gpt-6.1-sol` and `/thinking`. Select `max`; use Ctrl+S in the thinking menu only if it should become the startup default.

OmniRoute/npm package updates can replace these installed-file patches. The shared checkout contains the generic metadata consumption change for review, but has not been installed as a replacement for the existing prompt-tool extension. Its native-tool architecture differs, so the active package was preserved. The shared server resolver and effective catalog contract are implemented locally; they need upstream integration or reapplication after reinstall/update. The installation-specific diagnostics can detect lost changes.
