import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { syncOmniModelsForAgentHome } from "../shared.ts";

// Failure modes: a sync loses explicit route controls; generic effort tiers invent
// unsupported choices; provider registration drops the map; repeat sync loses it.
test("preserves explicit thinking controls through HTTP sync, registration, and repeat sync", async () => {
  const home = mkdtempSync(join(tmpdir(), "omni-thinking-"));
  const savedMap = { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" };
  const catalogMap = { minimal: null, xhigh: "xhigh", max: null };
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [
      { id: "codex/custom", capabilities: { reasoning: true } },
      { id: "provider/known", reasoning: true, thinkingLevelMap: catalogMap },
      { id: "provider/unknown", reasoning: true, capabilities: { effort_tiers: ["high", "xhigh", "max"] } },
      { id: "future-provider/new-reasoner", reasoning: true, thinkingLevelMap: { max: null }, capabilities: {
        thinking_controls: { kind: "native", level_map: { off: null, minimal: null, low: "low", medium: null,
          high: "high", xhigh: "xhigh", max: "max" } },
      } },
    ] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const registrations: any[] = [];
  const pi = { registerProvider(_name: string, config: any) { registrations.push(config); },
    registerTool() {}, registerCommand() {}, on() {} };
  const previous = process.env.THINKING_TEST_HOME;
  process.env.THINKING_TEST_HOME = home;
  try {
    mkdirSync(join(home, "omniroute-agent-extension"));
    writeFileSync(join(home, "omniroute-agent-extension/config.json"), JSON.stringify({
      serverUrl: `http://127.0.0.1:${address.port}`, providerName: "omni", apiKey: "",
    }));
    writeFileSync(join(home, "models.json"), JSON.stringify({ providers: { omni: { models: [
      { id: "codex/custom", reasoning: true, thinkingLevelMap: savedMap },
    ] } } }));
    for (let attempt = 0; attempt < 2; attempt++) {
      await syncOmniModelsForAgentHome(pi, { homeEnvVar: "THINKING_TEST_HOME", defaultHome: home });
      const saved = JSON.parse(readFileSync(join(home, "models.json"), "utf8"));
      const byId = Object.fromEntries(saved.providers.omni.models.map((m: any) => [m.id, m]));
      assert.deepEqual(byId["codex/custom"].thinkingLevelMap, savedMap);
      assert.deepEqual(byId["provider/known"].thinkingLevelMap, catalogMap);
      assert.equal(byId["provider/unknown"].thinkingLevelMap, undefined);
      assert.deepEqual(byId["future-provider/new-reasoner"].thinkingLevelMap,
        { off: null, minimal: null, low: "low", medium: null, high: "high", xhigh: "xhigh", max: "max" },
        "effective controls from a new provider override stale legacy maps without client model rules");
      assert.deepEqual(registrations.at(-1).models, saved.providers.omni.models);
    }
    console.log(JSON.stringify({ thinkingSync: "verified", repeatSync: true, explicitMapPreserved: true, unknownTiersNotInvented: true }));
  } finally {
    if (previous === undefined) delete process.env.THINKING_TEST_HOME;
    else process.env.THINKING_TEST_HOME = previous;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(home, { recursive: true, force: true });
  }
});
