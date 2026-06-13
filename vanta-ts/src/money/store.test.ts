import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendMoney, readMoney, latestProspects, offers, revenueTotal, pipelineByStage } from "./store.js";

describe("money store", () => {
  let env: NodeJS.ProcessEnv;
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-money-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it("appends + reads offers and revenue", async () => {
    await appendMoney({ kind: "offer", id: "consulting", name: "Consulting Retainer", price: "$5k/mo", ts: "t1" }, env);
    await appendMoney({ kind: "revenue", amount: 1000, source: "consulting", ts: "t2" }, env);
    const recs = await readMoney(env);
    expect(offers(recs)).toHaveLength(1);
    expect(revenueTotal(recs)).toBe(1000);
  });

  it("last-write-wins per prospect id (append-only)", async () => {
    await appendMoney({ kind: "prospect", id: "acme", name: "Acme Corp", stage: "lead", ts: "t1" }, env);
    await appendMoney({ kind: "prospect", id: "acme", name: "Acme Corp", stage: "contacted", ts: "t2" }, env);
    const prospects = latestProspects(await readMoney(env));
    expect(prospects).toHaveLength(1);
    expect(prospects[0]!.stage).toBe("contacted");
  });

  it("revenueTotal sums multiple revenue entries", async () => {
    await appendMoney({ kind: "revenue", amount: 500, ts: "t1" }, env);
    await appendMoney({ kind: "revenue", amount: 1500, ts: "t2" }, env);
    expect(revenueTotal(await readMoney(env))).toBe(2000);
  });

  it("pipelineByStage counts latest prospects per stage", async () => {
    await appendMoney({ kind: "prospect", id: "a", name: "Alice", stage: "lead", ts: "t1" }, env);
    await appendMoney({ kind: "prospect", id: "b", name: "Bob", stage: "contacted", ts: "t2" }, env);
    await appendMoney({ kind: "prospect", id: "a", name: "Alice", stage: "contacted", ts: "t3" }, env);
    const byStage = pipelineByStage(await readMoney(env));
    expect(byStage["lead"]).toBeUndefined();
    expect(byStage["contacted"]).toBe(2);
  });

  it("readMoney on a missing file returns []", async () => {
    expect(await readMoney(env)).toEqual([]);
  });
});
