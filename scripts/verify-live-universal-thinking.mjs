import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Reads the actual catalog, then exercises the installed Pi loader and sync.
// Defaults to scratch config. --sync also refreshes the user's real models.json,
// with a dated backup. No inference request and no credentials in the report.
const realHome = "/home/alecto/.pi/agent";
const original = JSON.parse(readFileSync(join(realHome, "models.json"), "utf8"));
const provider = original.providers.omni;
const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/models?configuredOnly=true&prefix=canonical`, {
  headers: { Authorization: `Bearer ${provider.apiKey || "omniroute-public"}` },
  signal: AbortSignal.timeout(20000),
});
assert.equal(response.status, 200);
const { data: catalog } = await response.json();
assert(Array.isArray(catalog) && catalog.length > 0);
for (const row of catalog) {
  const controls = row.capabilities?.thinking_controls;
  assert(controls || row.id.startsWith("auto/"), `${row.id}: effective controls are published for concrete routes`);
}
const host = "/home/alecto/.pi/agent/install/releases/1.2.0/node_modules/@earendil-works";
const { loadExtensions } = await import(`${host}/pi-coding-agent/dist/core/extensions/loader.js`);
const { getSupportedThinkingLevels } = await import(`${host}/pi-ai/dist/models.js`);
const home = mkdtempSync(join(tmpdir(), "pi-live-controls-"));
const previous = process.env.PI_HOME;
process.env.PI_HOME = home;
try {
  writeFileSync(join(home, "models.json"), JSON.stringify(original));
  const loaded = await loadExtensions([join(realHome, "npm/node_modules/omniroute-pi-ext-integration/index.ts")], home);
  assert.deepEqual(loaded.errors, []);
  const notices = [];
  const ctx = { modelRegistry: { refresh() {} }, ui: { notify(message, kind) { notices.push({ message, kind }); }, setStatus() {} } };
  const sync = loaded.extensions[0].commands.get("omni");
  for (let attempt = 0; attempt < 2; attempt++) await sync.handler("sync", ctx);
  assert(!notices.some((n) => n.kind === "error"));
  const saved = JSON.parse(readFileSync(join(home, "models.json"), "utf8"));
  const byId = new Map(saved.providers.omni.models.map((m) => [m.id, m]));
  const expected = {
    "codex/gpt-6-astra": ["low", "medium", "high", "xhigh", "max"],
    "codex/gpt-6-luna": ["off", "low", "medium", "high", "xhigh", "max"],
    "codex/gpt-6.1-sol": ["low", "medium", "high", "xhigh", "max"],
    "kiro/claude-opus-5.5": ["low", "medium", "high", "xhigh", "max"],
    "kiro/claude-sonnet-5.5": ["low", "medium", "high", "xhigh", "max"],
    "kiro/claude-opus-4.6": ["low", "medium", "high", "max"],
    "antigravity/gemini-3.8-flash-tiered": ["low", "medium", "high"],
  };
  for (const [id, levels] of Object.entries(expected)) {
    assert(byId.has(id), `${id} remains eligible after sync`);
    assert.deepEqual(getSupportedThinkingLevels(byId.get(id)), levels, `${id}: Pi consumes live effective controls`);
  }
  const registered = loaded.runtime.pendingProviderRegistrations.at(-1).config.models;
  assert.deepEqual(registered.map((m) => m.id), [...byId.keys()]);
  for (const model of registered) {
    assert.deepEqual(model.thinkingLevelMap, byId.get(model.id).thinkingLevelMap,
      `${model.id}: registration retains effective controls`);
  }
  assert.deepEqual(Object.keys(saved.providers), Object.keys(original.providers));
  for (const name of Object.keys(original.providers).filter((n) => n !== "omni")) {
    assert(JSON.stringify(saved.providers[name]) === JSON.stringify(original.providers[name]), `${name} remains unchanged`);
  }
  let syncedRealConfig = false;
  if (process.argv.includes("--sync")) {
    copyFileSync(join(realHome, "models.json"), join(realHome, "models.json.backup-20261014-universal-thinking"));
    process.env.PI_HOME = realHome;
    await sync.handler("sync", ctx);
    assert(!notices.some((n) => n.kind === "error"));
    const real = JSON.parse(readFileSync(join(realHome, "models.json"), "utf8"));
    assert.deepEqual(real.providers.omni.models, saved.providers.omni.models);
    syncedRealConfig = true;
  }
  const kinds = {};
  for (const row of catalog) {
    const kind = row.capabilities?.thinking_controls?.kind || "dynamic";
    kinds[kind] = (kinds[kind] || 0) + 1;
  }
  console.log(JSON.stringify({ liveUniversalControls: "verified", catalogRows: catalog.length,
    syncedChatModels: byId.size, kinds, repeatSync: true, syncedRealConfig, examples: expected,
    modelsAboveHigh: [...byId.values()].filter((m) => getSupportedThinkingLevels(m).some((v) => v === "xhigh" || v === "max")).length,
    paidInference: false }));
} finally {
  if (previous === undefined) delete process.env.PI_HOME;
  else process.env.PI_HOME = previous;
  rmSync(home, { recursive: true, force: true });
}
