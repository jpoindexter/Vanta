import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compress, usage } from "./context-cmds.js";
import type { ReplCtx } from "./types.js";
import type { Message } from "../types.js";
import type { LLMProvider } from "../providers/interface.js";
import { beginTurnContext, prepareCallMessages, resetSavingsHistory } from "../agent/context-pipeline.js";

// PCLIP-COST-ATTRIBUTION: `/usage` stays session-scoped by default; `/usage
// breakdown [--since <ISO>]` reads the persisted cross-session spend ledger.
describe("/usage", () => {
  let dataDir: string;
  beforeEach(async () => { dataDir = join(await mkdtemp(join(tmpdir(), "vanta-usage-cmd-")), ".vanta"); });
  afterEach(async () => { await rm(dataDir, { recursive: true, force: true }); });

  function ctx(): ReplCtx {
    return {
      convo: { messages: [{ role: "user", content: "hi" }] },
      setup: { provider: { modelId: () => "gpt-5", contextWindow: () => 200_000 } },
      dataDir,
      state: { turnIndex: 3, sessionCost: undefined },
      env: {},
      now: () => new Date("2026-07-04T00:00:00Z"),
    } as unknown as ReplCtx;
  }

  it("bare /usage stays the session view + points at breakdown", async () => {
    const r = await usage("", ctx());
    expect(r.output).toContain("turn(s)");
    expect(r.output).toContain("gpt-5");
    expect(r.output).toContain("/usage breakdown");
  });

  it("/usage breakdown reports no spend when the ledger is empty/missing", async () => {
    const r = await usage("breakdown", ctx());
    expect(r.output).toContain("No priced spend recorded");
  });

  it("/usage breakdown summarizes real ledger entries by goal/agent/provider/model", async () => {
    await mkdir(dataDir, { recursive: true });
    const entries = [
      { ts: "2026-07-01T00:00:00.000Z", goal: 1, agent: "interactive", provider: "openai", model: "gpt-5", costUsd: 1, inputTokens: 10, outputTokens: 5 },
      { ts: "2026-07-02T00:00:00.000Z", goal: 2, agent: "gateway", provider: "anthropic", model: "claude-sonnet", costUsd: 2, inputTokens: 10, outputTokens: 5 },
    ];
    await appendFile(join(dataDir, "spend-ledger.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");

    const r = await usage("breakdown", ctx());
    expect(r.output).toContain("Total: $3.00 across 2 priced turns");
    expect(r.output).toContain("gateway");
    expect(r.output).toContain("claude-sonnet");
  });

  it("/usage breakdown --since scopes to a cutoff date", async () => {
    await mkdir(dataDir, { recursive: true });
    const entries = [
      { ts: "2026-01-01T00:00:00.000Z", agent: "interactive", provider: "openai", model: "gpt-5", costUsd: 1, inputTokens: 1, outputTokens: 1 },
      { ts: "2026-07-01T00:00:00.000Z", agent: "interactive", provider: "openai", model: "gpt-5", costUsd: 2, inputTokens: 1, outputTokens: 1 },
    ];
    await appendFile(join(dataDir, "spend-ledger.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");

    const r = await usage("breakdown --since 2026-06-01", ctx());
    expect(r.output).toContain("Total: $2.00 across 1 priced turn");
  });

  it("/usage breakdown rejects an unparseable --since date", async () => {
    const r = await usage("breakdown --since not-a-date", ctx());
    expect(r.output).toContain("invalid --since date");
  });
});

describe("/compact after automatic suppression", () => {
  it("still runs a focused manual compaction after two real-headroom strikes", async () => {
    const messages: Message[] = [
      { role: "system", content: "large fixed system floor" },
      ...Array.from({ length: 14 }, (_, index): Message => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `message ${index} ${"x".repeat(2_000)}`,
      })),
    ];
    const complete = vi.fn(async (_messages: Message[]) => ({
      text: "focused decisions",
      toolCalls: [],
      finishReason: "stop",
    }));
    const provider: LLMProvider = {
      complete,
      modelId: () => "test-model",
      contextWindow: () => 1_000,
      countTokens: async () => 900,
    };
    const deps = { provider, root: "/tmp", currentTools: [] };
    const tc = beginTurnContext(messages, deps);
    resetSavingsHistory(messages);

    await prepareCallMessages(messages, deps, 2, tc);
    await prepareCallMessages(messages, deps, 2, tc);
    await prepareCallMessages(messages, deps, 2, tc); // automatic pass suppressed
    const before = messages.length;

    const result = await compress("decisions", {
      convo: { messages },
      setup: { provider },
      dataDir: "/tmp/.vanta",
      state: { sessionId: "s", started: "2026-07-12T00:00:00Z", turnIndex: 1 },
      env: {},
      now: () => new Date("2026-07-12T00:00:00Z"),
    } as unknown as ReplCtx);

    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[0]?.[0]?.content).toMatch(/focus especially on: decisions/i);
    expect(messages.length).toBeLessThan(before);
    expect(result.output).toMatch(/compressed 15 →/);
  });
});
