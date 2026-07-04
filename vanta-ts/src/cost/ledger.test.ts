import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSpend, listSpend, recordTurnSpend } from "./ledger.js";

describe("spend ledger store", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-spend-ledger-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("returns [] with no ledger file yet", async () => {
    expect(await listSpend(dir)).toEqual([]);
  });

  it("round-trips a full entry, defaulting ts to now", async () => {
    const before = Date.now();
    const e = await appendSpend(dir, {
      goal: 42, agent: "interactive", provider: "openai", model: "gpt-5",
      costUsd: 0.0123, inputTokens: 100, outputTokens: 50,
    });
    expect(Date.parse(e.ts)).toBeGreaterThanOrEqual(before);
    expect(await listSpend(dir)).toEqual([e]);
  });

  it("an explicit ts is honored verbatim (not overwritten by now)", async () => {
    const e = await appendSpend(dir, {
      ts: "2026-01-01T00:00:00.000Z", agent: "gateway", provider: "anthropic", model: "claude-sonnet",
      costUsd: 1, inputTokens: 1, outputTokens: 1,
    });
    expect(e.ts).toBe("2026-01-01T00:00:00.000Z");
  });

  it("goal is optional — omitted for a no-goal turn", async () => {
    const e = await appendSpend(dir, { agent: "interactive", provider: "openai", model: "gpt-5", costUsd: 0.01, inputTokens: 1, outputTokens: 1 });
    expect(e.goal).toBeUndefined();
  });

  it("drops a corrupt line without losing the rest of the ledger", async () => {
    await appendSpend(dir, { agent: "interactive", provider: "openai", model: "gpt-5", costUsd: 0.01, inputTokens: 1, outputTokens: 1 });
    await appendFile(join(dir, "spend-ledger.jsonl"), "garbage not json\n", "utf8");
    await appendSpend(dir, { agent: "interactive", provider: "openai", model: "gpt-5", costUsd: 0.02, inputTokens: 2, outputTokens: 2 });
    const all = await listSpend(dir);
    expect(all.map((e) => e.costUsd)).toEqual([0.01, 0.02]);
  });

  it("drops an entry that fails schema validation (e.g. negative cost)", async () => {
    await appendFile(join(dir, "spend-ledger.jsonl"), `${JSON.stringify({ ts: "x", agent: "a", provider: "p", model: "m", costUsd: -1, inputTokens: 1, outputTokens: 1 })}\n`, "utf8");
    expect(await listSpend(dir)).toEqual([]);
  });
});

describe("recordTurnSpend", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-spend-record-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("appends when cost is a positive number", async () => {
    await recordTurnSpend(dir, { costUsd: 0.5, provider: "openai", model: "gpt-5", inputTokens: 10, outputTokens: 5, agent: "interactive", goal: 7 });
    const all = await listSpend(dir);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ costUsd: 0.5, agent: "interactive", goal: 7 });
  });

  it("no-ops for null cost (unpriced model)", async () => {
    await recordTurnSpend(dir, { costUsd: null, provider: "ollama", model: "qwen2.5", inputTokens: 10, outputTokens: 5, agent: "interactive" });
    expect(await listSpend(dir)).toEqual([]);
  });

  it("no-ops for zero cost (local/free provider)", async () => {
    await recordTurnSpend(dir, { costUsd: 0, provider: "ollama", model: "qwen2.5", inputTokens: 10, outputTokens: 5, agent: "interactive" });
    expect(await listSpend(dir)).toEqual([]);
  });
});
