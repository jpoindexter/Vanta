import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { teamTool } from "../tools/team.js";
import { bySourceTask, recordWorkProduct } from "../cofounder/work-products.js";
import type { ToolContext } from "../tools/types.js";

// PCLIP-WORK-PRODUCTS — a completed task carries linked artifacts, viewable
// without the transcript (team artifact/artifacts actions + listing counts).

let prev: string | undefined;

beforeEach(async () => {
  prev = process.env.VANTA_HOME;
  process.env.VANTA_HOME = await mkdtemp(join(tmpdir(), "vanta-wp-"));
});

afterEach(() => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
});

const ctx = {} as ToolContext;
const run = (args: Record<string, unknown>) => teamTool.execute(args, ctx);

describe("bySourceTask", () => {
  it("filters artifacts to one task", () => {
    const mk = (taskId: string) =>
      recordWorkProduct([], { artifact: `a-${taskId}`, sourceTaskId: taskId, departmentId: "team", producedBy: "w" });
    const a = mk("t1");
    const b = mk("t2");
    if (!a.ok || !b.ok) throw new Error("setup");
    expect(bySourceTask([a.value, b.value], "t1").map((p) => p.artifact)).toEqual(["a-t1"]);
  });
});

describe("team artifact/artifacts actions", () => {
  it("records an artifact on a task and lists it back, with counts in the task listing", async () => {
    await run({ action: "dispatch", taskId: "t1", workerId: "w1", title: "build the page" });
    const rec = await run({ action: "artifact", taskId: "t1", artifact: "dist/index.html", artifactKind: "code" });
    expect(rec.ok).toBe(true);
    const view = await run({ action: "artifacts", taskId: "t1" });
    expect(view.ok).toBe(true);
    expect(view.output).toContain("[code]");
    expect(view.output).toContain("dist/index.html");
    expect(view.output).toContain("by w1");
    const listing = await run({ action: "tasks" });
    expect(listing.output).toContain("1 artifact(s)");
  });

  it("refuses an artifact on an unknown task; empty view says so", async () => {
    const rec = await run({ action: "artifact", taskId: "ghost", artifact: "x" });
    expect(rec.ok).toBe(false);
    await run({ action: "dispatch", taskId: "t2", workerId: "w1", title: "bare" });
    const view = await run({ action: "artifacts", taskId: "t2" });
    expect(view.output).toContain("no linked artifacts");
  });

  it("multiple artifacts (file + preview + deploy refs) all link to the task", async () => {
    await run({ action: "dispatch", taskId: "t3", workerId: "w1", title: "ship" });
    await run({ action: "artifact", taskId: "t3", artifact: "src/app.ts", artifactKind: "code" });
    await run({ action: "artifact", taskId: "t3", artifact: "https://preview.example.com/t3", artifactKind: "asset" });
    await run({ action: "artifact", taskId: "t3", artifact: "https://prod.example.com (deploy)", artifactKind: "report" });
    const view = await run({ action: "artifacts", taskId: "t3" });
    expect(view.output?.split("\n")).toHaveLength(3);
  });
});
