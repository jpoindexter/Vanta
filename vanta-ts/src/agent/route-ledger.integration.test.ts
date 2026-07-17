import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConversation } from "../agent.js";
import { listRouteUsage, summarizeRouteUsage } from "../cost/route-ledger.js";
import { listRuntimeResourceUsage } from "../cost/resource-ledger.js";
import { FallbackChain } from "../providers/fallback.js";
import { withProviderRoute } from "../providers/route.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { LLMProvider } from "../providers/interface.js";
import type { AgentDeps } from "./agent-types.js";

function provider(model: string, complete: LLMProvider["complete"], route: { provider: string; baseRoute: string; billingMode: "metered" | "included" | "local" }): LLMProvider {
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

  it("links a completed local call to a separate resource receipt with the same call id", async () => {
    const local = provider("qwen", vi.fn(async () => ({ text: "local", toolCalls: [], finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10 } })), {
      provider: "ollama", baseRoute: "http://127.0.0.1:11434/v1", billingMode: "local",
    });
    const deps: AgentDeps = { provider: local, safety: { logEvent: async () => {} } as unknown as AgentDeps["safety"], registry: new InMemoryToolRegistry(), root, sessionId: "local-session", usageAgent: "interactive", usageTaskId: "goal-1", requestApproval: async () => true };
    await createConversation("sys", deps).send("local call");
    const routeRows = await listRouteUsage(join(root, ".vanta"));
    const resourceRows = await listRuntimeResourceUsage(join(root, ".vanta"));
    expect(resourceRows).toHaveLength(1);
    expect(resourceRows[0]).toMatchObject({ callId: routeRows[0]?.callId, sessionId: "local-session", taskId: "goal-1", provider: "ollama", billingMode: "local", inputTokens: 20, outputTokens: 10 });
    expect(resourceRows[0]?.requestLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("keeps a classified resource receipt when a local provider call fails", async () => {
    const local = provider("broken", vi.fn(async () => { throw new Error("secret transport detail"); }), {
      provider: "lmstudio", baseRoute: "http://127.0.0.1:1234/v1", billingMode: "local",
    });
    const deps: AgentDeps = { provider: local, safety: { logEvent: async () => {} } as unknown as AgentDeps["safety"], registry: new InMemoryToolRegistry(), root, sessionId: "failed-session", usageAgent: "gateway", requestApproval: async () => true };
    await expect(createConversation("sys", deps).send("fail locally")).rejects.toThrow("secret transport detail");
    const rows = await listRuntimeResourceUsage(join(root, ".vanta"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessionId: "failed-session", failureClass: "provider_call_failed", inputTokens: null, outputTokens: null });
    expect(JSON.stringify(rows[0])).not.toContain("secret transport detail");
  });
});
