import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRadar, readRadar, latestOpportunities, score, ranked, byStatus } from "./store.js";
import type { Opportunity } from "./store.js";

describe("radar store", () => {
  let env: NodeJS.ProcessEnv;
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-radar-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  const opp = (id: string, overrides: Partial<Opportunity> = {}): Opportunity => ({
    kind: "opportunity", id, title: `Title ${id}`, status: "new", ts: new Date().toISOString(), ...overrides,
  });

  it("appends + reads opportunities", async () => {
    await appendRadar(opp("a"), env);
    await appendRadar(opp("b"), env);
    const recs = await readRadar(env);
    expect(latestOpportunities(recs)).toHaveLength(2);
  });

  it("latest-write-wins per id (append-only)", async () => {
    await appendRadar(opp("x", { title: "Old" }), env);
    await appendRadar(opp("x", { title: "New" }), env);
    expect(latestOpportunities(await readRadar(env))[0]!.title).toBe("New");
  });

  it("score = pain + buyer", () => {
    expect(score(opp("a", { pain: 0.6, buyer: 0.4 }))).toBeCloseTo(1.0);
    expect(score(opp("b"))).toBe(0);
  });

  it("ranked sorts by score descending", async () => {
    await appendRadar(opp("low", { pain: 0.1, buyer: 0.1 }), env);
    await appendRadar(opp("high", { pain: 0.9, buyer: 0.8 }), env);
    await appendRadar(opp("mid", { pain: 0.5, buyer: 0.3 }), env);
    const r = ranked(await readRadar(env));
    expect(r.map((o) => o.id)).toEqual(["high", "mid", "low"]);
  });

  it("byStatus filters correctly", async () => {
    await appendRadar(opp("a", { status: "new" }), env);
    await appendRadar(opp("b", { status: "validated" }), env);
    await appendRadar(opp("c", { status: "new" }), env);
    const recs = await readRadar(env);
    expect(byStatus(recs, "new")).toHaveLength(2);
    expect(byStatus(recs, "validated")).toHaveLength(1);
    expect(byStatus(recs, "dropped")).toHaveLength(0);
  });

  it("readRadar on a missing file returns []", async () => {
    expect(await readRadar(env)).toEqual([]);
  });
});
