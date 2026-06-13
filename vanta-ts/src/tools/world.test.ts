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

  it("relates two entities and shows the edge on query", async () => {
    await worldTool.execute({ action: "record", id: "jason", type: "person", name: "Jason" }, ctx);
    await worldTool.execute({ action: "relate", from: "jason", to: "indx", rel: "owns" }, ctx);
    const q = await worldTool.execute({ action: "query", q: "jason" }, ctx);
    expect(q.output).toContain("owns→indx");
  });

  it("validates required fields for record", async () => {
    expect((await worldTool.execute({ action: "record", id: "x" }, ctx)).output).toContain("needs id, type, name");
  });
});
