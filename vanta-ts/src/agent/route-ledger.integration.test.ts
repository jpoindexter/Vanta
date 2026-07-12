import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConversation } from "../agent.js";
import { listRouteUsage, summarizeRouteUsage } from "../cost/route-ledger.js";
import { FallbackChain } from "../providers/fallback.js";
import { withProviderRoute } from "../providers/route.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { LLMProvider } from "../providers/interface.js";
import type { AgentDeps } from "./agent-types.js";

function provider(model: string, complete: LLMProvider["complete"], route: { provider: string; baseRoute: string; billingMode: "metered" | "included" }): LLMProvider {
  return withProviderRoute({ complete, modelId: () => model, contextWindow: () => 10_000 }, route);
}

describe("served-route ledger production path", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-route-integration-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("attributes a fallback and a model switch to the routes that actually served them", async () => {
    const primary = provider("primary-model", vi.fn(async () => { throw new Error("503 overloaded"); }), {
      provider: "primary", baseRoute: "https://primary.example/v1", billingMode: "metered",
    });
    const fallback = provider("gpt-5.5", vi.fn(async () => ({
      text: "fallback served", toolCalls: [], finishReason: "stop", usage: { inputTokens: 100, outputTokens: 20, cacheTokens: 10, reasoningTokens: 5 },
    })), { provider: "codex", baseRoute: "subscription://openai-codex", billingMode: "included" });
    const switched = provider("gpt-4o", vi.fn(async () => ({
      text: "switched served", toolCalls: [], finishReason: "stop", usage: { inputTokens: 50, outputTokens: 10 },
    })), { provider: "openai", baseRoute: "https://api.openai.com/v1", billingMode: "metered" });
    const safety = { logEvent: async () => {} } as unknown as AgentDeps["safety"];
    const deps: AgentDeps = {
      provider: new FallbackChain([primary, fallback]),
      safety,
      registry: new InMemoryToolRegistry(),
      root,
      sessionId: "route-session",
      usageAgent: "interactive",
      requestApproval: async () => true,
    };
    const convo = createConversation("sys", deps);

    await convo.send("first call");
    convo.setProvider(switched);
    await convo.send("second call");

    const rows = await listRouteUsage(join(root, ".vanta"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ provider: "codex", model: "gpt-5.5", billingStatus: "included", fallbackDepth: 1, costUsd: 0 });
    expect(rows[1]).toMatchObject({ provider: "openai", model: "gpt-4o", billingStatus: "estimated", fallbackDepth: 0 });
    expect(summarizeRouteUsage(rows)).toMatchObject({ apiCalls: 2, inputTokens: 150, outputTokens: 30, cacheTokens: 10, reasoningTokens: 5 });
  });
});
