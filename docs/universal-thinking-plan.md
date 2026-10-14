# Universal thinking controls

The user wants model switching and sync to discover thinking choices automatically, including Astra, without editing one model at a time.

1. Add a shared, pure OmniRoute resolver for effective thinking controls. Use route contracts and declared model capabilities, distinguish native effort from budget presets, collapse aliases that produce the same wire effort, and respect fixed/no-think/dynamic routes. Unknown capabilities retain the host's conservative legacy choices rather than inventing extra levels. Route exceptions belong in OmniRoute, not in the extension.
2. Publish `capabilities.thinking_controls` from catalog enrichment. Keep existing public catalog fields compatible. The Codex effort cap and Kiro adaptive profile should use the shared resolver data; mirror source changes into this installed server's compiled chunks.
3. Make both the active Pi extension and the shared Pi/OMP/Prime checkout consume the new metadata on every sync. Preserve legacy explicit maps only when the server has no effective controls. There must be no provider/model allowlist in extension mapping.
4. Verify the real Pi loader, HTTP sync, persistence, model switching, and outgoing request fields for Astra, Luna, existing patched models, Gemini budget routes, a new provider with declared tiers, aliases, and unknown/dynamic models. Verify compiled adapters and catalog metadata. Run required extension checks, restart the server, sync the real catalog, and perform one brief Astra max request.

Acceptance: Astra and other eligible catalog models offer their effective higher levels automatically; unsupported or duplicate tiers do not appear as additional native capabilities; no global thinking default changes; model lists, tools, existing user changes, and credentials are preserved. Source changes and local install limitations are documented. No full-catalog paid probes.
