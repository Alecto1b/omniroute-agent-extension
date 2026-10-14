import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { syncOmniModelsForAgentHome } from "../shared.ts";

// Failure modes: unconfigured/alias catalog, non-chat output discarded by normalization,
// lost variants/metadata, destructive empty sync, unrelated providers overwritten, error fallback.
test("syncs configured canonical chat models without replacing the catalog on unusable responses", async () => {
  const agentHome = mkdtempSync(join(tmpdir(), "omni-catalog-"));
  const requests: string[] = [];
  let status = 200;
  let body: unknown = { data: [
    { id: "openai/gpt-5", name: "GPT 5", owned_by: "openai", input_modalities: ["text", "image"],
      output_modalities: ["text", "audio"], context_length: 200000, max_output_tokens: 8000,
      capabilities: { reasoning: true }, pricing: { input: 3, output: 15, cached: 0.3, cache_creation: 3.75 } },
    ...["low", "high", "max", "fast"].map((tier) => ({ id: `openai/gpt-5-${tier}`, reasoning: true })),
    { id: "anthropic/claude", input_modalities: ["text"] },
    { id: "no-think/claude" }, { id: "auto/custom" }, "openai/legacy",
    { id: "openai/unknown", output: ["future-modality"] },
    { id: "google/gemini" }, { id: "openai/deprecated-old" },
    ...["image", "video", "audio", "classifier", "embedding"].map((type) => ({ id: `openai/${type}`, type })),
    ...["video", "audio", "image"].map((output) => ({ id: `openai/output-${output}`, output: [output] })),
    { id: "openai/output-mixed", output_modalities: ["IMAGE", " VIDEO ", "audio"] },
  ] };
  const server = createServer((req, res) => {
    requests.push(req.url!);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const registrations: Array<{ name: string; config: any }> = [];
  const pi = {
    registerProvider(name: string, config: any) { registrations.push({ name, config }); },
    registerTool() {}, registerCommand() {}, on() {},
  };
  const opts = { homeEnvVar: "CATALOG_TEST_HOME", defaultHome: agentHome };
  const previousHome = process.env.CATALOG_TEST_HOME;
  process.env.CATALOG_TEST_HOME = agentHome;
  try {
    mkdirSync(join(agentHome, "omniroute-agent-extension"), { recursive: true });
    writeFileSync(join(agentHome, "omniroute-agent-extension", "config.json"), JSON.stringify({
      serverUrl: `http://127.0.0.1:${address.port}`, apiKey: "", providerName: "omni",
      includeModels: ["openai/*", "anthropic/*", "no-think/*", "auto/*"], excludeModels: ["*/deprecated*"],
    }));
    const modelsPath = join(agentHome, "models.json");
    const other = { api: "openai-completions", models: [{ id: "keep-me" }] };
    writeFileSync(modelsPath, JSON.stringify({ providers: { other, omni: { models: [{ id: "old" }] } } }));

    await syncOmniModelsForAgentHome(pi, opts);
    assert.deepEqual(requests, ["/v1/models?configuredOnly=true&prefix=canonical"]);
    const saved = JSON.parse(readFileSync(modelsPath, "utf8"));
    assert.deepEqual(saved.providers.other, other);
    assert.deepEqual(registrations.at(-1), { name: "omni", config: saved.providers.omni });
    const byId = Object.fromEntries(saved.providers.omni.models.map((m: any) => [m.id, m]));
    for (const id of ["auto", "auto/coding", "auto/custom", "no-think/claude", "anthropic/claude",
      "openai/gpt-5", "openai/gpt-5-low", "openai/gpt-5-high", "openai/gpt-5-max", "openai/gpt-5-fast",
      "openai/legacy", "openai/unknown"]) assert(byId[id], `keeps ${id}`);
    for (const id of ["google/gemini", "openai/deprecated-old", "openai/image", "openai/video", "openai/audio",
      "openai/classifier", "openai/embedding", "openai/output-video", "openai/output-audio",
      "openai/output-image", "openai/output-mixed"]) assert(!byId[id], `excludes ${id}`);
    assert.deepEqual(byId["openai/gpt-5"], {
      id: "openai/gpt-5", name: "GPT 5", api: "openai-completions", reasoning: true, input: ["text", "image"],
      contextWindow: 200000, maxTokens: 8000, cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    });

    const before = readFileSync(modelsPath, "utf8");
    for (const unusable of [{}, { data: {} }, { data: [] }, { data: [null, {}, { id: "" }] },
      { data: [{ id: "openai/video", output: ["video"] }] }]) {
      body = unusable;
      await assert.rejects(syncOmniModelsForAgentHome(pi, opts), /catalog.*(invalid|empty|no chat)/i);
      assert.equal(readFileSync(modelsPath, "utf8"), before);
      assert.equal(registrations.length, 1, "does not replace the registered catalog on failure");
    }
    status = 503;
    body = { error: "catalog unavailable" };
    const callsBefore = requests.length;
    await assert.rejects(syncOmniModelsForAgentHome(pi, opts), /503/);
    assert.equal(requests.length, callsBefore + 1, "does not fall back to the full catalog");
    assert.equal(readFileSync(modelsPath, "utf8"), before);
    // Bounded, sanitized integration evidence in the Node test report; no prompts or keys.
    console.log(JSON.stringify({ catalogSync: "verified", query: requests[0],
      models: saved.providers.omni.models.length,
      prefixes: [...new Set(Object.keys(byId).map((id) => id.split("/")[0]))].sort(),
      preservedOtherProvider: true, rejectedUnusableResponses: 5, noFullCatalogFallback: true }));
  } finally {
    if (previousHome === undefined) delete process.env.CATALOG_TEST_HOME;
    else process.env.CATALOG_TEST_HOME = previousHome;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(agentHome, { recursive: true, force: true });
  }
});
