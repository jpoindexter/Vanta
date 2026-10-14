import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendRouteUsage,
  formatRouteUsage,
  listRouteUsage,
  summarizeRouteUsage,
} from "./route-ledger.js";

describe("route usage ledger", () => {
  let dataDir: string;
  beforeEach(async () => { dataDir = await mkdtemp(join(tmpdir(), "vanta-route-ledger-")); });
  afterEach(async () => { await rm(dataDir, { recursive: true, force: true }); });

  it("retains included and local calls at zero cost", async () => {
    await appendRouteUsage(dataDir, {
      callId: "included-1", sessionId: "s", agent: "interactive",
      route: { provider: "codex", model: "gpt-5.5", baseRoute: "subscription://openai-codex", billingMode: "included" },
      usage: { inputTokens: 10, outputTokens: 5, cacheTokens: 3, reasoningTokens: 2 },
    });
    await appendRouteUsage(dataDir, {
      callId: "local-1", sessionId: "s", agent: "interactive",
      route: { provider: "ollama", model: "qwen", baseRoute: "http://localhost:11434/v1", billingMode: "local" },
      usage: { inputTokens: 20, outputTokens: 7 },
    });

    const rows = await listRouteUsage(dataDir);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.billingStatus, row.costUsd])).toEqual([["included", 0], ["local", 0]]);
    expect(summarizeRouteUsage(rows)).toMatchObject({ apiCalls: 2, inputTokens: 30, outputTokens: 12, cacheTokens: 3, reasoningTokens: 2, knownCostUsd: 0 });
  });

  it("deduplicates migrated/replayed call ids and skips corrupt rows", async () => {
    const row = await appendRouteUsage(dataDir, {
      callId: "same", sessionId: "old", agent: "interactive",
      route: { provider: "openai", model: "gpt-4o", baseRoute: "https://api.openai.com/v1", billingMode: "metered" },
      usage: { inputTokens: 100, outputTokens: 10 },
    });
    await appendFile(join(dataDir, "route-usage-ledger.jsonl"), `${JSON.stringify(row)}\nnot-json\n`, "utf8");
    expect(await listRouteUsage(dataDir)).toEqual([row]);
  });

  it("formats exact route totals without dropping unknown cost", async () => {
    await appendRouteUsage(dataDir, {
      callId: "unknown", sessionId: "s", agent: "gateway",
      route: { provider: "custom", model: "unpriced", baseRoute: "https://models.example/v1", billingMode: "unknown", fallbackDepth: 1 },
      usage: { inputTokens: 8, outputTokens: 2 },
    });
    const report = formatRouteUsage(summarizeRouteUsage(await listRouteUsage(dataDir)));
    expect(report).toContain("Model calls: 1");
    expect(report).toContain("custom/unpriced");
    expect(report).toContain("fallback:1");
    expect(report).toContain("+~?");
  });

  it("parses ledger rows written before the purpose field existed as main-agent calls", async () => {
    const legacy = {
      version: 1, callId: "legacy-1", ts: "2026-10-01T00:00:00.000Z", sessionId: "old", agent: "interactive",
      provider: "openai", model: "gpt-4o", baseRoute: "https://api.openai.com/v1", billingMode: "metered", billingStatus: "estimated",
      fallbackDepth: 0, apiCalls: 1, inputTokens: 10, outputTokens: 2, cacheTokens: 0, reasoningTokens: 0, costUsd: 0.001,
    };
    await appendFile(join(dataDir, "route-usage-ledger.jsonl"), `${JSON.stringify(legacy)}\n`, "utf8");
    const rows = await listRouteUsage(dataDir);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.purpose).toBe("main");
  });

  it("records the purpose per call, defaults to main, and rejects unknown purposes on read", async () => {
    const route = { provider: "openai", model: "gpt-4o", baseRoute: "https://api.openai.com/v1", billingMode: "metered" as const };
    await appendRouteUsage(dataDir, { callId: "a", sessionId: "s", agent: "interactive", route });
    await appendRouteUsage(dataDir, { callId: "b", sessionId: "s", agent: "interactive", route, purpose: "learn" });
    await appendFile(join(dataDir, "route-usage-ledger.jsonl"), `${JSON.stringify({ ...(await listRouteUsage(dataDir))[0], callId: "c", purpose: "bogus" })}\n`, "utf8");
    expect((await listRouteUsage(dataDir)).map((r) => [r.callId, r.purpose])).toEqual([["a", "main"], ["b", "learn"]]);
  });

  it("summarizes by purpose and only prints the purpose line when a non-main call exists", async () => {
    const route = { provider: "openai", model: "gpt-4o", baseRoute: "https://api.openai.com/v1", billingMode: "local" as const };
    await appendRouteUsage(dataDir, { callId: "m", sessionId: "s", agent: "interactive", route });
    expect(formatRouteUsage(summarizeRouteUsage(await listRouteUsage(dataDir)))).not.toContain("by purpose");
    await appendRouteUsage(dataDir, { callId: "l", sessionId: "s", agent: "interactive", route, purpose: "learn" });
    const summary = summarizeRouteUsage(await listRouteUsage(dataDir));
    expect(summary.byPurpose.map((p) => [p.purpose, p.apiCalls])).toEqual([["main", 1], ["learn", 1]]);
    expect(formatRouteUsage(summary)).toContain("by purpose: main 1");
  });
});
