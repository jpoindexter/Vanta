import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { teamTool } from "./team.js";
import { appendTask, type WorkerTask } from "../team/tasks.js";
import { recordWorkProduct, writeWorkProducts } from "../cofounder/work-products.js";
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

  // run guards return before resolving a provider or spawning a worker, so they
  // are deterministic and need no live LLM (the spawn path runs in real use).
  it("run requires a taskId", async () => {
    const res = await teamTool.execute({ action: "run" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("needs taskId");
  });

  it("run rejects an unknown taskId", async () => {
    const res = await teamTool.execute({ action: "run", taskId: "ghost" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("unknown task id");
  });

  it("run refuses an already-done task", async () => {
    const now = new Date().toISOString();
    await appendTask({ kind: "task", id: "t-done", workerId: "w1", title: "ship", status: "done", created: now, updated: now });
    const res = await teamTool.execute({ action: "run", taskId: "t-done" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("already done");
  });

  // ENFORCED-OUTCOME-WIRE — the outcome gate at the live advance-to-done site.
  describe("advance — outcome gate", () => {
    async function runningTask(id: string, outcome?: WorkerTask["outcome"]): Promise<void> {
      const now = new Date().toISOString();
      await appendTask({ kind: "task", id, workerId: "w1", title: "t", status: "running", created: now, updated: now, outcome });
    }

    it("DEFAULT-PERMISSIVE: a task with NO required outcome advances to done unchanged", async () => {
      await runningTask("t-free");
      const res = await teamTool.execute({ action: "advance", taskId: "t-free", taskStatus: "done", detail: "shipped" }, ctx);
      expect(res.ok).toBe(true);
      expect(res.output).toContain("→ done");
    });

    it("required outcome + NO recorded artifact: advance to done is REFUSED with a reason", async () => {
      await runningTask("t-gated", { expectedOutput: "document" });
      const res = await teamTool.execute({ action: "advance", taskId: "t-gated", taskStatus: "done", detail: "claiming done" }, ctx);
      expect(res.ok).toBe(false);
      expect(res.output).toMatch(/cannot close/);
      expect(res.output).toMatch(/document/);
    });

    it("required outcome + a recorded work-product: advance to done is allowed", async () => {
      await runningTask("t-evidenced", { expectedOutput: "document" });
      const made = recordWorkProduct([], {
        artifact: "the produced spec",
        sourceTaskId: "t-evidenced",
        departmentId: "eng",
        producedBy: "w1",
      });
      expect(made.ok).toBe(true);
      if (!made.ok) return;
      await writeWorkProducts([made.value], { VANTA_HOME: home } as NodeJS.ProcessEnv);
      const res = await teamTool.execute({ action: "advance", taskId: "t-evidenced", taskStatus: "done", detail: "shipped" }, ctx);
      expect(res.ok).toBe(true);
      expect(res.output).toContain("→ done");
    });

    it("a gated task can still advance to a NON-done status (gate is done-only)", async () => {
      await runningTask("t-block", { expectedOutput: "document" });
      const res = await teamTool.execute({ action: "advance", taskId: "t-block", taskStatus: "blocked", detail: "waiting" }, ctx);
      expect(res.ok).toBe(true);
      expect(res.output).toContain("→ blocked");
    });
  });
});
