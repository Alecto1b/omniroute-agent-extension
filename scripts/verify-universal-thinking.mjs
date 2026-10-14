import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Failure modes: Astra omitted, new providers require client code edits, generic
// tiers invent Gemini max, aliases duplicate effective effort, unsupported low
// tiers leak, no-think/fixed routes contradict the picker, sync loses metadata.
const root = process.env.OMNIROUTE_SOURCE_ROOT || "/home/alecto/.npm-global/lib/node_modules/omniroute";
const helperPath = `${root}/src/shared/reasoning/effectiveThinkingControls.ts`;
// Older installed catalogs have no effective-control contract. Keep that baseline
// reproducible so this diagnostic fails on the original high-only picker.
let resolveControls = () => undefined;
if (existsSync(helperPath)) {
  const code = stripTypeScriptTypes(readFileSync(helperPath, "utf8"));
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  resolveControls = module.resolveEffectiveThinkingControls;
}
const host = process.env.PI_HOST_ROOT || "/home/alecto/.pi/agent/install/releases/1.2.0/node_modules/@earendil-works";
const extensionPath = process.env.OMNI_EXTENSION_PATH || "/home/alecto/.pi/agent/npm/node_modules/omniroute-pi-ext-integration/index.ts";
const { loadExtensions } = await import(`${host}/pi-coding-agent/dist/core/extensions/loader.js`);
const { getSupportedThinkingLevels } = await import(`${host}/pi-ai/dist/models.js`);
const rows = [
  { id: "codex/gpt-6-astra", provider: "codex", model: "gpt-6-astra", reasoning: true },
  { id: "codex/gpt-6-luna", provider: "codex", model: "gpt-6-luna", reasoning: true },
  { id: "codex/gpt-6.1-sol", provider: "codex", model: "gpt-6.1-sol", reasoning: true },
  { id: "codex/gpt-5.5", provider: "codex", model: "gpt-5.5", reasoning: true },
  { id: "codex/gpt-5.1-codex-max", provider: "codex", model: "gpt-5.1-codex-max", reasoning: true },
  { id: "codex/gpt-6-astra-high", provider: "codex", model: "gpt-6-astra-high", reasoning: true },
  { id: "kiro/claude-opus-5.5", provider: "kiro", model: "claude-opus-5.5", reasoning: true },
  { id: "kiro/claude-opus-4.6", provider: "kiro", model: "claude-opus-4.6", reasoning: true },
  { id: "kiro/claude-sonnet-5.5", provider: "kiro", model: "claude-sonnet-5.5", reasoning: true },
  { id: "antigravity/gemini-3.8-flash-tiered", provider: "antigravity", model: "gemini-3.8-flash-tiered", reasoning: true,
    thinkingBudgetCap: 24576, defaultThinkingBudget: 8192 },
  { id: "future-provider/new-reasoner", provider: "future-provider", model: "new-reasoner", reasoning: true,
    declaredEfforts: ["low", "high", "xhigh", "max"] },
  { id: "future-provider/binary", provider: "future-provider", model: "binary", reasoning: true, declaredEfforts: ["none", "high"] },
  { id: "unknown/provider-model", provider: "unknown", model: "provider-model", reasoning: true },
  { id: "auto/smart", provider: "auto", model: "smart", reasoning: true },
  { id: "no-think/kiro/claude-opus-4.6", provider: "kiro", model: "claude-opus-4.6", reasoning: true },
];
const home = mkdtempSync(join(tmpdir(), "pi-universal-thinking-"));
const previousHome = process.env.PI_HOME;
process.env.PI_HOME = home;
const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ data: rows.map((row) => ({ id: row.id, capabilities: {
    reasoning: row.reasoning, thinking_controls: resolveControls(row),
  } })) }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  writeFileSync(join(home, "models.json"), JSON.stringify({ providers: { omni: {
    api: "omni-prompt-tools", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: "test-only", models: [],
  } } }));
  const loaded = await loadExtensions([extensionPath], home);
  assert.deepEqual(loaded.errors, []);
  const notices = [];
  const ctx = { modelRegistry: { refresh() {} }, ui: { notify(message, kind) { notices.push({ message, kind }); }, setStatus() {} } };
  for (let i = 0; i < 2; i++) await loaded.extensions[0].commands.get("omni").handler("sync", ctx);
  assert(!notices.some((notice) => notice.kind === "error"));
  const registration = loaded.runtime.pendingProviderRegistrations.at(-1).config;
  const byId = new Map(registration.models.map((m) => [m.id, m]));
  const levels = (id) => getSupportedThinkingLevels(byId.get(id));
  assert.deepEqual(levels("codex/gpt-6-astra"), ["low", "medium", "high", "xhigh", "max"], "Astra automatically exposes its native controls");
  assert(levels("codex/gpt-6-luna").includes("max"));
  assert(levels("codex/gpt-6.1-sol").includes("max"));
  assert(!levels("codex/gpt-5.5").includes("max"), "effective Codex cap is respected");
  assert(levels("codex/gpt-5.1-codex-max").includes("low"), "a genuine -max model name is not a fixed-effort alias");
  assert.deepEqual(levels("codex/gpt-6-astra-high"), ["high"], "fixed Codex alias cannot pretend to honor another level");
  assert(levels("kiro/claude-opus-5.5").includes("max"));
  assert.deepEqual(levels("kiro/claude-opus-4.6"), ["low", "medium", "high", "max"]);
  assert(levels("kiro/claude-sonnet-5.5").includes("max"));
  assert.deepEqual(levels("antigravity/gemini-3.8-flash-tiered"), ["low", "medium", "high"]);
  assert.deepEqual(levels("future-provider/new-reasoner"), ["low", "high", "xhigh", "max"], "no client provider allowlist");
  assert.deepEqual(levels("future-provider/binary"), ["off", "high"]);
  assert(!levels("unknown/provider-model").includes("xhigh"));
  assert(!levels("auto/smart").includes("max"));
  assert.deepEqual(levels("no-think/kiro/claude-opus-4.6"), ["off"]);
  const sent = [];
  for (const id of ["codex/gpt-6-astra", "kiro/claude-opus-5.5", "future-provider/new-reasoner"]) {
    const model = { ...byId.get(id), provider: "omni", baseUrl: registration.baseUrl,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    const result = await registration.streamSimple(model, { messages: [{ role: "user", content: "test", timestamp: 1 }] }, {
      apiKey: "test-only", reasoning: "max", fetch: async (_url, init) => {
        sent.push({ id, effort: JSON.parse(init.body).reasoning_effort });
        return new Response('data: {"id":"test","choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
      },
    }).result();
    assert.equal(result.stopReason, "stop", result.errorMessage);
  }
  assert(sent.every((r) => r.effort === "max"));
  console.log(JSON.stringify({ universalThinking: "verified", repeatSync: true,
    models: [...byId].map(([id, m]) => ({ id, levels: getSupportedThinkingLevels(m) })), sent, paidInference: false }));
} finally {
  if (previousHome === undefined) delete process.env.PI_HOME;
  else process.env.PI_HOME = previousHome;
  await new Promise((resolve) => server.close(resolve));
  rmSync(home, { recursive: true, force: true });
}
