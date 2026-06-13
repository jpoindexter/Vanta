import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { teamTool } from "./team.js";
import type { ToolContext } from "./types.js";

const ctx = {} as unknown as ToolContext; // teamTool reads/writes via process.env.VANTA_HOME

describe("teamTool", () => {
  let home: string;
  let prev: string | undefined;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-tt-"));
    prev = process.env.VANTA_HOME;
    process.env.VANTA_HOME = home;
  });
  afterEach(async () => {
    if (prev === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = prev;
    await rm(home, { recursive: true, force: true });
  });

  it("defines a worker then lists it", async () => {
    const def = await teamTool.execute({ action: "define", id: "scraper", role: "web scraper" }, ctx);
    expect(def.ok).toBe(true);
    const list = await teamTool.execute({ action: "list" }, ctx);
    expect(list.ok).toBe(true);
    expect(list.output).toContain("scraper");
    expect(list.output).toContain("web scraper");
  });

  it("define then set status blocked — list shows it blocked", async () => {
    await teamTool.execute({ action: "define", id: "analyst", role: "data analyst" }, ctx);
    await teamTool.execute({ action: "status", id: "analyst", status: "blocked" }, ctx);
    const list = await teamTool.execute({ action: "list" }, ctx);
    expect(list.output).toContain("blocked");
  });

  it("status on unknown worker returns error", async () => {
    const res = await teamTool.execute({ action: "status", id: "ghost", status: "done" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("ghost");
  });

  it("define requires id and role", async () => {
    const res = await teamTool.execute({ action: "define", id: "x" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("needs id, role");
  });

  it("invalid action fails validation gracefully", async () => {
    const res = await teamTool.execute({ action: "nope" }, ctx);
    expect(res.ok).toBe(false);
  });

  it("list on empty roster prompts to define", async () => {
    const res = await teamTool.execute({ action: "list" }, ctx);
    expect(res.output).toContain("empty");
  });

  it("describeForSafety returns team + action", () => {
    expect(teamTool.describeForSafety?.({ action: "define" })).toBe("team define");
    expect(teamTool.describeForSafety?.({ action: "list" })).toBe("team list");
  });
});
