import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

// Failure modes: a documented Kiro profile silently loses effort; repeat sync erases controls; native
// tools/history are damaged; adaptive requests carry rejected sampling fields;
// Kiro Sonnet's output window is exceeded; compiled server still uses old gates.
const root = "/home/alecto/.npm-global/lib/node_modules/omniroute";
const host = "/home/alecto/.pi/agent/install/releases/1.2.0/node_modules/@earendil-works";
const { loadExtensions } = await import(`${host}/pi-coding-agent/dist/core/extensions/loader.js`);
const { getSupportedThinkingLevels } = await import(`${host}/pi-ai/dist/models.js`);
async function loadPure(path) {
  const code = stripTypeScriptTypes(readFileSync(path, "utf8"))
    .replace(/^import .*effectiveThinkingControls\.ts";$/m, `const KIRO_THINKING_PROFILES = ${JSON.stringify(controls.KIRO_THINKING_PROFILES)};`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const controlsCode = stripTypeScriptTypes(readFileSync(`${root}/src/shared/reasoning/effectiveThinkingControls.ts`, "utf8"));
const controls = await import(`data:text/javascript;base64,${Buffer.from(controlsCode).toString("base64")}`);
const adaptive = await loadPure(`${root}/open-sse/translator/request/openai-to-kiro/adaptiveThinking.ts`);
const messageHelpers = await loadPure(`${root}/open-sse/translator/request/openai-to-kiro/messageHelpers.ts`);
const uuid = await import(`${root}/node_modules/uuid/dist-node/index.js`);
const source = stripTypeScriptTypes(readFileSync(`${root}/open-sse/translator/request/openai-to-kiro.ts`, "utf8"))
  .replace(/^import[\s\S]*?;\n/gm, "").replace(/\bexport /g, "");
const scope = vm.createContext({ ...adaptive, ...messageHelpers, ...controls, uuidv4: uuid.v4, uuidv5: uuid.v5,
  FORMATS: { OPENAI: "openai", KIRO: "kiro" }, register() {},
  // Only capability DB wrappers are isolated; the installed translator and
  // all its message/tool/alias logic execute unchanged.
  capMaxOutputTokens: (_model, limit) => limit, capThinkingBudget: (_model, budget) => budget });
vm.runInContext(source + "\nglobalThis.translate = buildKiroPayload;", scope);
const home = mkdtempSync(join(tmpdir(), "pi-kiro-thinking-"));
const previousHome = process.env.PI_HOME;
process.env.PI_HOME = home;
// Expected route schemas from Kiro's documentation, independently of the
// implementation table. Opus 5.5 also has the earlier live acceptance proof.
const expectedProfiles = {
  "claude-opus-4.6": { levels: ["low", "medium", "high", "max"], cap: 64000 },
  "claude-opus-4.7": { levels: ["low", "medium", "high", "xhigh", "max"], cap: 64000 },
  "claude-opus-4.8": { levels: ["low", "medium", "high", "xhigh", "max"], cap: 128000 },
  "claude-opus-5": { levels: ["low", "medium", "high", "xhigh", "max"], cap: 128000 },
  "claude-opus-5.5": { levels: ["low", "medium", "high", "xhigh", "max"], cap: 128000 },
  "claude-sonnet-4.6": { levels: ["low", "medium", "high", "max"], cap: 64000 },
  "claude-sonnet-5": { levels: ["low", "medium", "high", "xhigh", "max"], cap: 128000 },
  "claude-sonnet-5.5": { levels: ["low", "medium", "high", "xhigh", "max"], cap: 64000 },
};
const modelIds = Object.keys(expectedProfiles);
const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ data: modelIds.map((id) => ({ id: `kiro/${id}`, max_output_tokens: 128000, capabilities: {
    reasoning: true, thinking_controls: controls.resolveEffectiveThinkingControls({ id: `kiro/${id}`, provider: "kiro", model: id, reasoning: true }),
  } })) }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  writeFileSync(join(home, "models.json"), JSON.stringify({ providers: { omni: {
    api: "omni-prompt-tools", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: "test-only",
    models: [],
  } } }));
  const loaded = await loadExtensions(["/home/alecto/.pi/agent/npm/node_modules/omniroute-pi-ext-integration/index.ts"], home);
  assert.deepEqual(loaded.errors, []);
  const notices = [];
  const ctx = { modelRegistry: { refresh() {} }, ui: { notify(message, kind) { notices.push({ message, kind }); }, setStatus() {} } };
  for (let i = 0; i < 2; i++) await loaded.extensions[0].commands.get("omni").handler("sync", ctx);
  assert(!notices.some((notice) => notice.kind === "error"));
  const registration = loaded.runtime.pendingProviderRegistrations.at(-1).config;
  const evidence = [];
  for (const id of modelIds) {
    const model = { ...registration.models.find((m) => m.id === `kiro/${id}`), provider: "omni", baseUrl: registration.baseUrl,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    assert.deepEqual(getSupportedThinkingLevels(model), expectedProfiles[id].levels);
    for (const effort of ["high", "xhigh", "max"].filter((level) => expectedProfiles[id].levels.includes(level))) {
      let wire;
      const result = await registration.streamSimple(model, {
        messages: [{ role: "user", content: "Inspect the result and explain the constraint.", timestamp: 1 }],
        tools: [{ name: "read", description: "Read a file", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } }],
      }, { apiKey: "test-only", reasoning: effort, fetch: async (_url, init) => {
        wire = JSON.parse(init.body);
        return new Response('data: {"id":"test","choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
      } }).result();
      assert.equal(result.stopReason, "stop", result.errorMessage);
      assert.equal(wire.reasoning_effort, effort);
      // Exercise the installed translator with a prior tool turn and a follow-up
      // request, rather than proving only an empty hello-world payload.
      wire.messages = [{ role: "user", content: "Read the file." },
        { role: "assistant", content: "", tool_calls: [{ id: "call_read", type: "function", function: { name: "read", arguments: '{"path":"config.json"}' } }] },
        { role: "tool", tool_call_id: "call_read", content: '{"mode":"max"}' },
        { role: "user", content: "Explain the constraint using that result." }];
      wire.max_completion_tokens = 128000;
      wire.temperature = 0.2;
      wire.top_p = 0.8;
      const payload = scope.translate(id, wire, true, {});
      const fields = payload.additionalModelRequestFields;
      assert.equal(fields?.output_config?.effort, effort, `${id} ${effort}: Kiro must receive adaptive effort`);
      assert.equal(fields.thinking.type, "adaptive");
      assert.equal(fields.max_tokens, expectedProfiles[id].cap);
      assert.equal(payload.inferenceConfig?.temperature, undefined);
      assert.equal(payload.inferenceConfig?.topP, undefined);
      assert(payload.conversationState.history.length >= 2);
      assert(payload.conversationState.currentMessage.userInputMessage.userInputMessageContext.tools.length > 0);
      evidence.push({ model: id, requested: effort, upstream: fields.output_config.effort, maxTokens: fields.max_tokens });
    }
  }
  assert.equal(adaptive.supportsKiroAdaptiveThinking("claude-sonnet-4.5"), false, "unsupported models stay gated");
  assert.equal(adaptive.supportsKiroAdaptiveThinking("claude-opus-5"), true);
  let compiledGates = 0;
  let compiledOutputCaps = 0;
  const chunks = `${root}/dist/.build/next/server/chunks`;
  for (const name of readdirSync(chunks).filter((n) => n.endsWith(".js"))) {
    const bundle = readFileSync(join(chunks, name), "utf8");
    if (bundle.includes("max_thinking_length")) {
      const cap = /let (\w+)=([^;]*capMaxOutputTokens[^;]*);\w+\.max_tokens=Math.max/.exec(bundle);
      if (cap) {
        const inputs = /\(0,(\w+)\.capMaxOutputTokens\)\((\w+),(\w+)\)/.exec(cap[2]);
        assert(inputs);
        for (const [model, { cap: expected }] of Object.entries(expectedProfiles)) {
          const context = vm.createContext({ [inputs[1]]: { capMaxOutputTokens: (_model, limit) => limit },
            [inputs[2]]: model, [inputs[3]]: 128000 });
          vm.runInContext(bundle.split("// END OMNI EFFECTIVE THINKING CONTROLS")[0], context);
          assert.equal(vm.runInContext(cap[2], context), expected, `compiled ${name} preserves Kiro ${model} output window`);
        }
        compiledOutputCaps++;
      }
    }
    if (!bundle.includes("Kiro agentic aliases are not supported")) continue;
    const match = bundle.match(/new Set\(Object\.keys\(KIRO_THINKING_PROFILES\)\)/);
    assert(match, `recognizes ${name} adaptive gate`);
    const context = vm.createContext({});
    vm.runInContext(bundle.split("// END OMNI EFFECTIVE THINKING CONTROLS")[0], context);
    const gate = vm.runInContext(match[0], context);
    assert(modelIds.every((id) => gate.has(id)), `compiled ${name} enables documented adaptive profiles`);
    assert(!gate.has("claude-sonnet-4.5"));
    compiledGates++;
  }
  assert(compiledGates > 0);
  assert(compiledOutputCaps > 0);
  console.log(JSON.stringify({ kiroThinking: "verified", repeatSync: true, compiledGates, compiledOutputCaps, toolHistoryPreserved: true, evidence, paidInference: false }));
} finally {
  if (previousHome === undefined) delete process.env.PI_HOME;
  else process.env.PI_HOME = previousHome;
  await new Promise((resolve) => server.close(resolve));
  rmSync(home, { recursive: true, force: true });
}
