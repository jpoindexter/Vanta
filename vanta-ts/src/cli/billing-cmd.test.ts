import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendSpend } from "../cost/ledger.js";
import { setBudgetLimit, recordSpend } from "../budget/store.js";
import { formatBillingStatus, readBillingStatus } from "../billing/status.js";
import { runBillingCommand } from "./billing-cmd.js";

const NOW = new Date("2026-07-09T12:00:00.000Z");

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vanta-billing-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readBillingStatus", () => {
  it("fails open when provider-reported billing is unavailable", async () => {
    const status = await readBillingStatus(dir);
    expect(status.providerReported).toMatchObject({
      available: false,
      reason: "no provider-reported billing adapter configured",
      balanceUsdMicros: null,
      quotaUsdMicros: null,
      resetWindow: null,
      failOpen: true,
    });
  });

  it("summarizes estimated spend with integer money aggregation", async () => {
    await appendSpend(dir, {
      ts: "2026-07-09T10:00:00.000Z",
      agent: "interactive",
      provider: "openai",
      model: "gpt-5",
      costUsd: 0.0149,
      inputTokens: 1000,
      outputTokens: 200,
    });
    await appendSpend(dir, {
      ts: "2026-07-09T10:01:00.000Z",
      agent: "gateway",
      provider: "anthropic",
      model: "claude-sonnet",
      costUsd: 0.021,
      inputTokens: 50,
      outputTokens: 10,
    });

    const status = await readBillingStatus(dir);
    expect(status.estimated).toMatchObject({
      pricedTurns: 2,
      spendUsdMicros: 35900,
      inputTokens: 1050,
      outputTokens: 210,
      firstTs: "2026-07-09T10:00:00.000Z",
      lastTs: "2026-07-09T10:01:00.000Z",
    });
    expect(status.estimated.providers).toEqual(["anthropic/claude-sonnet", "openai/gpt-5"]);
  });

  it("summarizes budget posture", async () => {
    await setBudgetLimit(dir, { scope: "session", limitUsd: 10, now: NOW });
    await recordSpend(dir, "session", 8.5, NOW);
    await setBudgetLimit(dir, { scope: "loop:nightly", limitUsd: 1, now: NOW });
    await recordSpend(dir, "loop:nightly", 2, NOW);

    const status = await readBillingStatus(dir);
    expect(status.budgets).toMatchObject({
      count: 2,
      limitUsdMicros: 11000000,
      spentUsdMicros: 10500000,
      remainingUsdMicros: 1500000,
      byStatus: { active: 0, warning: 1, exceeded: 1 },
    });
  });
});

describe("formatBillingStatus", () => {
  it("renders the unavailable provider fields and empty local estimates", async () => {
    const text = formatBillingStatus(await readBillingStatus(dir));
    expect(text).toContain("provider reported: unavailable");
    expect(text).toContain("balance / quota / reset: unknown / unknown / unknown");
    expect(text).toContain("fail-open: yes");
    expect(text).toContain("estimated spend: no priced turns recorded");
    expect(text).toContain("budgets: no scoped budgets configured");
  });
});

describe("runBillingCommand", () => {
  it("prints status and exits 0", async () => {
    const lines: string[] = [];
    await appendSpend(dir, {
      agent: "interactive",
      provider: "openai",
      model: "gpt-5",
      costUsd: 0.01,
      inputTokens: 1,
      outputTokens: 2,
    }, NOW);

    await expect(runBillingCommand(dir, ["status"], (line) => lines.push(line))).resolves.toBe(0);
    expect(lines.join("\n")).toContain("Billing status");
    expect(lines.join("\n")).toContain("estimated spend: $0.01");
  });

  it("prints JSON for automation", async () => {
    const lines: string[] = [];
    await expect(runBillingCommand(dir, ["json"], (line) => lines.push(line))).resolves.toBe(0);
    expect(JSON.parse(lines.join("\n")).providerReported.failOpen).toBe(true);
  });

  it("rejects unknown subcommands with usage", async () => {
    const lines: string[] = [];
    await expect(runBillingCommand(dir, ["bogus"], (line) => lines.push(line))).resolves.toBe(1);
    expect(lines.join("\n")).toContain("usage: vanta billing");
  });
});
