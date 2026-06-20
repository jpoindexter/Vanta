import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorkflowTask,
  markWorkflowTask,
  listWorkflowTasks,
  formatWorkflowTasks,
  workflowTasksPath,
  type WorkflowTask,
} from "./task-store.js";

describe("workflow task-store", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-wftasks-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates a task in running status and lists it", async () => {
    const task = await createWorkflowTask(dir, "build pipeline", { id: () => "t1" });
    expect(task).toMatchObject({ id: "t1", name: "build pipeline", status: "running" });
    expect(task.startedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(task.finishedAt).toBeUndefined();

    const listed = await listWorkflowTasks(dir);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe("t1");
  });

  it("marks a task done with a result and stamps finishedAt", async () => {
    await createWorkflowTask(dir, "synthesis run", { id: () => "t2", now: () => new Date("2026-06-20T10:00:00Z") });
    const updated = await markWorkflowTask(dir, "t2", "done", { result: "3 steps, synthesized", now: () => new Date("2026-06-20T10:05:00Z") });

    expect(updated).toMatchObject({ id: "t2", status: "done", result: "3 steps, synthesized" });
    expect(updated!.finishedAt).toBe("2026-06-20T10:05:00.000Z");
    expect(updated!.error).toBeUndefined();

    const [stored] = await listWorkflowTasks(dir);
    expect(stored!.status).toBe("done");
    expect(stored!.result).toBe("3 steps, synthesized");
  });

  it("marks a task failed with an error", async () => {
    await createWorkflowTask(dir, "doomed run", { id: () => "t3" });
    const updated = await markWorkflowTask(dir, "t3", "failed", { error: "node n2 blocked by kernel" });

    expect(updated).toMatchObject({ status: "failed", error: "node n2 blocked by kernel" });
    expect(updated!.result).toBeUndefined();
    expect(updated!.finishedAt).toBeTruthy();
  });

  it("returns null when marking an unknown id (best-effort caller)", async () => {
    expect(await markWorkflowTask(dir, "nope", "done", { result: "x" })).toBeNull();
  });

  it("preserves other tasks when marking one", async () => {
    await createWorkflowTask(dir, "first", { id: () => "a" });
    await createWorkflowTask(dir, "second", { id: () => "b" });
    await markWorkflowTask(dir, "a", "done", { result: "ok" });

    const tasks = await listWorkflowTasks(dir);
    expect(tasks).toHaveLength(2);
    expect(tasks.find((t) => t.id === "a")!.status).toBe("done");
    expect(tasks.find((t) => t.id === "b")!.status).toBe("running");
  });

  it("tolerantly skips bad rows and a corrupt file", async () => {
    // valid row + a malformed row (missing required fields) + a non-object
    const good: WorkflowTask = { id: "ok1", name: "good", status: "running", startedAt: "2026-06-20T00:00:00.000Z" };
    await writeFile(
      workflowTasksPath(dir),
      JSON.stringify({ version: 1, tasks: [good, { id: "bad" }, 42, { name: "no-id", status: "running", startedAt: "x" }] }),
      "utf8",
    );
    const listed = await listWorkflowTasks(dir);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe("ok1");

    // a completely corrupt file degrades to empty, never throws
    await writeFile(workflowTasksPath(dir), "{ not json", "utf8");
    expect(await listWorkflowTasks(dir)).toEqual([]);
  });

  it("returns empty for a missing store", async () => {
    expect(await listWorkflowTasks(join(dir, "nonexistent"))).toEqual([]);
  });

  it("persists the {version, tasks} envelope", async () => {
    await createWorkflowTask(dir, "envelope", { id: () => "e1" });
    const raw = JSON.parse(await readFile(workflowTasksPath(dir), "utf8")) as { version: number; tasks: unknown[] };
    expect(raw.version).toBe(1);
    expect(raw.tasks).toHaveLength(1);
  });

  describe("formatWorkflowTasks", () => {
    it("renders empty state", () => {
      expect(formatWorkflowTasks([])).toContain("no workflow runs yet");
    });

    it("renders status badges, the outcome detail, and newest-first order", () => {
      const tasks: WorkflowTask[] = [
        { id: "1", name: "old run", status: "done", startedAt: "2026-06-20T09:00:00.000Z", finishedAt: "2026-06-20T09:01:00.000Z", result: "all good" },
        { id: "2", name: "new run", status: "failed", startedAt: "2026-06-20T10:00:00.000Z", finishedAt: "2026-06-20T10:01:00.000Z", error: "kernel blocked node n1" },
        { id: "3", name: "live run", status: "running", startedAt: "2026-06-20T08:00:00.000Z" },
      ];
      const out = formatWorkflowTasks(tasks);
      const lines = out.split("\n");

      // newest startedAt first
      expect(lines[0]).toContain("new run");
      expect(lines[0]).toContain("✗");
      expect(lines[0]).toContain("[failed]");
      expect(lines[0]).toContain("kernel blocked node n1");

      expect(out).toContain("✓ old run [done] — all good");
      expect(out).toContain("▶ live run [running]");
      // a running task shows no outcome suffix
      expect(lines.find((l) => l.includes("live run"))).not.toContain(" — ");
    });

    it("collapses whitespace and truncates a long detail", () => {
      const long = "x".repeat(200);
      const out = formatWorkflowTasks([
        { id: "1", name: "run", status: "done", startedAt: "2026-06-20T00:00:00.000Z", result: `line one\n${long}` },
      ]);
      expect(out).not.toContain("\n  x"); // newline in detail collapsed
      expect(out.length).toBeLessThan(120); // truncated to ~80 chars of detail
    });
  });
});
