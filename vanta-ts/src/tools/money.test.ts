import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { moneyTool } from "./money.js";
import type { ToolContext } from "./types.js";

const ctx = {} as unknown as ToolContext;

describe("moneyTool", () => {
  let home: string;
  let prev: string | undefined;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-mt-"));
    prev = process.env.VANTA_HOME;
    process.env.VANTA_HOME = home;
  });
  afterEach(async () => {
    if (prev === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = prev;
    await rm(home, { recursive: true, force: true });
  });

  it("records an offer and shows it in review", async () => {
    const r = await moneyTool.execute({ action: "offer", id: "retainer", name: "Monthly Retainer", price: "$3k" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("Monthly Retainer");
    const rev = await moneyTool.execute({ action: "review" }, ctx);
    expect(rev.output).toContain("Offers on file: 1");
  });

  it("records revenue and shows total in review", async () => {
    await moneyTool.execute({ action: "revenue", amount: 2500, source: "client-x" }, ctx);
    await moneyTool.execute({ action: "revenue", amount: 1000 }, ctx);
    const rev = await moneyTool.execute({ action: "review" }, ctx);
    expect(rev.output).toContain("Revenue: $3500");
  });

  it("records a prospect and shows it in pipeline", async () => {
    await moneyTool.execute({ action: "prospect", id: "acme", name: "Acme Corp", stage: "lead" }, ctx);
    const rev = await moneyTool.execute({ action: "review" }, ctx);
    expect(rev.output).toContain("lead:1");
  });

  it("validates required fields for offer", async () => {
    const r = await moneyTool.execute({ action: "offer", id: "x" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("needs id, name");
  });

  it("validates required fields for prospect", async () => {
    const r = await moneyTool.execute({ action: "prospect", id: "y", name: "Someone" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("needs id, name, stage");
  });

  it("validates required fields for revenue", async () => {
    const r = await moneyTool.execute({ action: "revenue" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("needs amount");
  });

  it("describeForSafety returns money + action", () => {
    expect(moneyTool.describeForSafety?.({ action: "review" })).toBe("money review");
  });
});
