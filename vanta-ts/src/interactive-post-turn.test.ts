import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordTurnCost } from "./interactive-post-turn.js";
import { listSpend } from "./cost/ledger.js";
import type { TurnDeps } from "./interactive-turn.js";

// PCLIP-COST-ATTRIBUTION: recordTurnCost is the extracted, exported helper that
// wires a priced turn into the spend ledger. Full runPostTurnPipeline pulls in
// too many unrelated subsystems (review/session-memory/brain/critic/gates) to
// mock cheaply, so this tests the actual new logic directly.
describe("recordTurnCost", () => {
  let repoRoot: string;
  const prevProvider = process.env.VANTA_PROVIDER;
  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "vanta-turn-cost-"));
    process.env.VANTA_PROVIDER = "openai";
  });
  afterEach(async () => {
    if (prevProvider === undefined) delete process.env.VANTA_PROVIDER;
    else process.env.VANTA_PROVIDER = prevProvider;
    await rm(repoRoot, { recursive: true, force: true });
  });

  function deps(goals: { id: number; text: string; status: "active" | "done" }[] = []): TurnDeps {
    return {
      setup: { provider: { modelId: () => "gpt-5", contextWindow: () => 200_000 }, goals },
      state: { sessionCost: undefined },
      repoRoot,
    } as unknown as TurnDeps;
  }

  it("no-ops (no ledger entry, no throw) when the turn reported no usage", async () => {
    await recordTurnCost({ finalText: "done" } as never, Date.now(), deps());
    expect(await listSpend(join(repoRoot, ".vanta"))).toEqual([]);
  });

  it("persists a priced turn attributed to agent=interactive and the active goal id", async () => {
    const outcome = { finalText: "done", usage: { inputTokens: 1000, outputTokens: 500 } } as never;
    await recordTurnCost(outcome, Date.now() - 100, deps([{ id: 7, text: "ship it", status: "active" }]));
    const entries = await listSpend(join(repoRoot, ".vanta"));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ agent: "interactive", goal: 7, provider: "openai", model: "gpt-5", inputTokens: 1000, outputTokens: 500 });
    expect(entries[0]?.costUsd).toBeGreaterThan(0);
  });

  it("omits goal when there is no active goal", async () => {
    const outcome = { finalText: "done", usage: { inputTokens: 100, outputTokens: 50 } } as never;
    await recordTurnCost(outcome, Date.now(), deps([{ id: 1, text: "old", status: "done" }]));
    expect((await listSpend(join(repoRoot, ".vanta")))[0]?.goal).toBeUndefined();
  });

  it("does not persist an entry for an unpriced model (cost estimates to null)", async () => {
    const outcome = { finalText: "done", usage: { inputTokens: 100, outputTokens: 50 } } as never;
    const d = { setup: { provider: { modelId: () => "some-unknown-model", contextWindow: () => 8192 }, goals: [] }, state: { sessionCost: undefined }, repoRoot } as unknown as TurnDeps;
    await recordTurnCost(outcome, Date.now(), d);
    expect(await listSpend(join(repoRoot, ".vanta"))).toEqual([]);
  });
});
