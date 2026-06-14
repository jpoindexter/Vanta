import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { worldTool } from "./world.js";
import type { ToolContext } from "./types.js";

const ctx = {} as unknown as ToolContext; // worldTool.execute reads the store directly

describe("worldTool", () => {
  let home: string;
  let prev: string | undefined;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-wt-"));
    prev = process.env.VANTA_HOME;
    process.env.VANTA_HOME = home;
  });
  afterEach(async () => {
    if (prev === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = prev;
    await rm(home, { recursive: true, force: true });
  });

  it("records an entity, then finds it via query", async () => {
    const rec = await worldTool.execute({ action: "record", id: "indx", type: "project", name: "Indx" }, ctx);
    expect(rec.ok).toBe(true);
    const q = await worldTool.execute({ action: "query", q: "indx" }, ctx);
    expect(q.output).toContain("project:indx");
  });

  it("relates two entities and shows the edge on query (cited)", async () => {
    await worldTool.execute({ action: "record", id: "jason", type: "person", name: "Jason" }, ctx);
    await worldTool.execute({ action: "relate", from: "jason", to: "indx", rel: "owns" }, ctx);
    const q = await worldTool.execute({ action: "query", q: "jason" }, ctx);
    // cited format (slice 4): "jason —owns→ indx  [certain · 100% · source:<ts>]"
    expect(q.output).toContain("—owns→");
    expect(q.output).toContain("source:");
    expect(q.output).toMatch(/\[(certain|likely|uncertain|stale) · \d+% · source:/);
  });

  it("validates required fields for record", async () => {
    expect((await worldTool.execute({ action: "record", id: "x" }, ctx)).output).toContain("needs id, type, name");
  });

  it("conflicts returns none when world is empty", async () => {
    const r = await worldTool.execute({ action: "conflicts" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("no conflicts");
  });

  it("conflicts detects a contradiction", async () => {
    await worldTool.execute({ action: "relate", from: "jason", to: "indx", rel: "owns" }, ctx);
    await worldTool.execute({ action: "relate", from: "jason", to: "brutal", rel: "owns" }, ctx);
    const r = await worldTool.execute({ action: "conflicts" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("⚠");
    expect(r.output).toContain("jason");
    expect(r.output).toContain("owns");
  });
});
