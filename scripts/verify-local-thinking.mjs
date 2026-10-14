import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

// Verify the installed extension in its real Pi loader, repeat /omni sync,
// inspect Pi's outgoing effort without calling an upstream, and verify router caps.
const host = "/home/alecto/.pi/agent/install/releases/1.2.0/node_modules/@earendil-works";
const router = "/home/alecto/.npm-global/lib/node_modules/omniroute";
const { loadExtensions } = await import(`${host}/pi-coding-agent/dist/core/extensions/loader.js`);
const { getSupportedThinkingLevels } = await import(`${host}/pi-ai/dist/models.js`);
const home = mkdtempSync(join(tmpdir(), "pi-omni-thinking-"));
const previous = process.env.PI_HOME;
process.env.PI_HOME = home;
const map = { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" };
const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ data: [
    { id: "codex/gpt-6.1-sol", capabilities: { reasoning: true } },
    { id: "antigravity/gemini-3.8-flash-tiered", capabilities: { reasoning: true, effort_tiers: ["high", "xhigh", "max"] } },
  ] }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  writeFileSync(join(home, "models.json"), JSON.stringify({ providers: { omni: {
    api: "omni-prompt-tools", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: "test-only",
    models: [{ id: "codex/gpt-6.1-sol", reasoning: true, thinkingLevelMap: map }],
  } } }));
  const loaded = await loadExtensions(["/home/alecto/.pi/agent/npm/node_modules/omniroute-pi-ext-integration/index.ts"], home);
  assert.deepEqual(loaded.errors, []);
  const notices = [];
  const ctx = { modelRegistry: { refresh() {} }, ui: { notify(message, kind) { notices.push({ message, kind }); }, setStatus() {} } };
  const command = loaded.extensions[0].commands.get("omni");
  for (let attempt = 0; attempt < 2; attempt++) {
    await command.handler("sync", ctx);
    assert(!notices.some((n) => n.kind === "error"), JSON.stringify(notices));
    const saved = JSON.parse(readFileSync(join(home, "models.json"), "utf8"));
    const codex = saved.providers.omni.models.find((m) => m.id === "codex/gpt-6.1-sol");
    assert.deepEqual(codex.thinkingLevelMap, map, "sync must retain the model's explicit thinking controls");
    assert.deepEqual(getSupportedThinkingLevels(codex), ["low", "medium", "high", "xhigh", "max"]);
    const gemini = saved.providers.omni.models.find((m) => m.id.startsWith("antigravity/"));
    assert(!getSupportedThinkingLevels(gemini).includes("max"), "generic advertised tiers must not invent a Gemini max mode");
  }
  const registration = loaded.runtime.pendingProviderRegistrations.at(-1).config;
  const model = { ...registration.models.find((m) => m.id === "codex/gpt-6.1-sol"),
    provider: "omni", baseUrl: registration.baseUrl, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  const sent = [];
  for (const reasoning of ["xhigh", "max"]) {
    const result = await registration.streamSimple(model, { messages: [{ role: "user", content: "test", timestamp: 1 }] }, {
      apiKey: "test-only", reasoning, fetch: async (_url, init) => {
        sent.push(JSON.parse(init.body).reasoning_effort);
        return new Response('data: {"id":"test","choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          { headers: { "content-type": "text/event-stream" } });
      },
    }).result();
    assert.equal(result.stopReason, "stop", result.errorMessage);
  }
  assert.deepEqual(sent, ["xhigh", "max"]);
  const suffixCode = stripTypeScriptTypes(readFileSync(`${router}/open-sse/executors/codex/reasoningSuffix.ts`, "utf8"));
  const { CODEX_EFFORT_ORDER } = await import(`data:text/javascript;base64,${Buffer.from(suffixCode).toString("base64")}`);
  const controlsCode = stripTypeScriptTypes(readFileSync(`${router}/src/shared/reasoning/effectiveThinkingControls.ts`, "utf8"));
  const { getEffectiveCodexEffortCap } = await import(`data:text/javascript;base64,${Buffer.from(controlsCode).toString("base64")}`);
  const source = readFileSync(`${router}/open-sse/executors/codex.ts`, "utf8");
  const fn = source.match(/function clampEffort\(model: string, requested: string\): string (\{[\s\S]*?\n\})/)[1]
    .replace("const max: EffortLevel", "const max").replace("requested as EffortLevel", "requested");
  const scope = vm.createContext({ EFFORT_ORDER: CODEX_EFFORT_ORDER, getEffectiveCodexEffortCap, console: { debug() {} } });
  vm.runInContext(`function clampEffort(model, requested) ${fn}`, scope);
  assert.equal(vm.runInContext('clampEffort("gpt-6.1-sol", "max")', scope), "max", "OmniRoute must not lower GPT-6.1 Sol max");
  assert.equal(vm.runInContext('clampEffort("gpt-5-mini", "max")', scope), "high");
  assert.equal(vm.runInContext('clampEffort("gpt-6-sol", "max")', scope), "max");
  const responsesSource = readFileSync(`${router}/open-sse/translator/request/openai-responses/helpers.ts`, "utf8");
  const responsesCode = stripTypeScriptTypes(responsesSource);
  const { normalizeResponsesReasoningEffort } = await import(`data:text/javascript;base64,${Buffer.from(responsesCode).toString("base64")}`);
  assert.equal(normalizeResponsesReasoningEffort("max", "codex/gpt-6.1-sol"), "max", "Chat-to-Responses translation must retain GPT-6.1 Sol max");
  assert.equal(normalizeResponsesReasoningEffort("max", "gpt-5-mini"), "xhigh");
  assert.equal(normalizeResponsesReasoningEffort("max", "gpt-6-sol"), "max");
  const chunks = `${router}/dist/.build/next/server/chunks`;
  let compiledExecutors = 0;
  let compiledTranslators = 0;
  for (const file of readdirSync(chunks).filter((name) => name.endsWith(".js"))) {
    const bundle = readFileSync(join(chunks, file), "utf8");
    const marker = "gpt-5\\.6-(?:sol|terra|luna)|gpt-6-(?:astra|sol|luna)";
    const index = bundle.indexOf(marker);
    if (index >= 0) {
      const start = bundle.lastIndexOf("/^", index);
      const end = bundle.indexOf("$/", index);
      assert(start >= 0 && end > start);
      const nativeMax = new RegExp(bundle.slice(start + 1, end + 1));
      assert(nativeMax.test("gpt-6.1-sol"), `compiled ${file}: translation retains GPT-6.1 Sol max`);
      assert(nativeMax.test("gpt-6-sol"));
      assert(!nativeMax.test("gpt-5-mini"));
      compiledTranslators++;
    }
    if (!bundle.includes("clampEffort:")) continue;
    const start = /if\((\w+)\)\{let e,t,r,o=\(i=(\w+),e=getEffectiveCodexEffortCap\(i\)/.exec(bundle);
    assert(start, `recognizes compiled Codex effort resolver in ${file}`);
    const end = bundle.indexOf("}}let", start.index);
    assert(end > start.index);
    const block = bundle.slice(start.index, end + 2);
    for (const [modelId, expected] of [["gpt-6.1-sol", "max"], ["gpt-5-mini", "high"], ["gpt-6-sol", "max"]]) {
      const compiledScope = vm.createContext({ a: {}, S: null, A: null, i: undefined,
        [start[1]]: "max", [start[2]]: modelId,
        O: { CODEX_EFFORT_ORDER }, console: { debug() {} } });
      const embedded = bundle.split("// END OMNI EFFECTIVE THINKING CONTROLS")[0];
      vm.runInContext(`${embedded}\n${block}`, compiledScope);
      assert.equal(compiledScope.a.reasoning.effort, expected, `compiled ${file}: ${modelId} max`);
    }
    compiledExecutors++;
  }
  assert(compiledExecutors > 0, "checks the installed server bundle as well as source");
  assert(compiledTranslators > 0);
  console.log(JSON.stringify({ installedPiExtension: "verified", repeatSync: true, picker: getSupportedThinkingLevels(model), sent,
    codex61RouterCap: "max", compiledExecutors, compiledTranslators, otherModelCapsPreserved: true, paidInference: false }));
} finally {
  if (previous === undefined) delete process.env.PI_HOME;
  else process.env.PI_HOME = previous;
  await new Promise((resolve) => server.close(resolve));
  rmSync(home, { recursive: true, force: true });
}
