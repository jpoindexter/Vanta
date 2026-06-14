import { describe, it, expect } from "vitest";
import { formatTeam } from "./team-cmd.js";
import type { Worker } from "../team/store.js";
import type { WorkerTask } from "../team/tasks.js";

const workers: Worker[] = [
  { kind: "worker", id: "scraper", role: "web scraper", status: "idle", ts: "t1" },
  { kind: "worker", id: "analyst", role: "data analyst", status: "blocked", note: "awaiting data", ts: "t2" },
];

const noTasks: WorkerTask[] = [];

function task(id: string, workerId: string, status: WorkerTask["status"], title = "t"): WorkerTask {
  const now = new Date().toISOString();
  return { kind: "task", id, workerId, title, status, created: now, updated: now };
}

describe("formatTeam", () => {
  it("shows worker count, ids, roles, and statuses", () => {
    const out = formatTeam(workers, noTasks);
    expect(out).toContain("2 workers");
    expect(out).toContain("scraper · web scraper · idle");
    expect(out).toContain("analyst · data analyst · blocked");
  });

  it("includes the blocked warning when workers are blocked", () => {
    const out = formatTeam(workers, noTasks);
    expect(out).toContain("⚠ 1 blocked");
  });

  it("no blocked warning when no workers are blocked", () => {
    const none: Worker[] = [
      { kind: "worker", id: "w", role: "runner", status: "running", ts: "t1" },
    ];
    expect(formatTeam(none, noTasks)).not.toContain("blocked");
  });

  it("an empty roster prompts to define", () => {
    expect(formatTeam([], noTasks)).toContain("empty");
  });

  it("note is included in the row when present", () => {
    const out = formatTeam(workers, noTasks);
    expect(out).toContain("awaiting data");
  });

  it("applies last-write-wins before formatting (pure, no I/O)", () => {
    const duped: Worker[] = [
      { kind: "worker", id: "w1", role: "old", status: "idle", ts: "t1" },
      { kind: "worker", id: "w1", role: "new", status: "done", ts: "t2" },
    ];
    const out = formatTeam(duped, noTasks);
    expect(out).toContain("1 worker");
    expect(out).toContain("new");
    expect(out).not.toContain("old");
  });

  it("shows open task count for a worker with tasks", () => {
    const tasks = [task("t1", "scraper", "assigned"), task("t2", "scraper", "running", "scrape page")];
    const out = formatTeam(workers, tasks);
    expect(out).toContain("[2 open");
  });

  it("shows running task title inline", () => {
    const tasks = [task("t1", "scraper", "running", "scrape nytimes")];
    const out = formatTeam(workers, tasks);
    expect(out).toContain("▶ scrape nytimes");
  });

  it("does not show task hint when all tasks are done", () => {
    const tasks = [task("t1", "scraper", "done")];
    const out = formatTeam(workers, tasks);
    expect(out).not.toContain("[");
  });
});
