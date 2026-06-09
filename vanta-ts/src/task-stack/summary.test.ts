import { describe, it, expect } from "vitest";
import { taskStackSummary } from "./summary.js";
import type { OperatorTask, TaskStack } from "./types.js";

function makeTask(overrides: Partial<OperatorTask> & { id: string; title: string }): OperatorTask {
  return {
    status: "pending",
    source: "user",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    why: "test",
    ...overrides,
  };
}

function stack(...tasks: OperatorTask[]): TaskStack {
  return { tasks };
}

describe("taskStackSummary", () => {
  it("returns a one-line message for an empty stack", () => {
    const s = taskStackSummary(stack());
    expect(s).toContain("no active tasks");
    expect(s.split("\n")).toHaveLength(1);
  });

  it("shows the active task title and nextAction", () => {
    const s = taskStackSummary(
      stack(makeTask({ id: "1", title: "EF-TASKSTACK", status: "active", nextAction: "add store tests", why: "w" })),
    );
    expect(s).toContain("Active:");
    expect(s).toContain("EF-TASKSTACK");
    expect(s).toContain("add store tests");
  });

  it("shows blocked count and names", () => {
    const s = taskStackSummary(
      stack(
        makeTask({ id: "1", title: "Active task", status: "active", why: "w" }),
        makeTask({ id: "2", title: "Blocked task", status: "blocked", why: "w" }),
      ),
    );
    expect(s).toContain("Blocked (1):");
    expect(s).toContain("Blocked task");
  });

  it("shows 'Blocked: none.' when no blocked tasks", () => {
    const s = taskStackSummary(
      stack(makeTask({ id: "1", title: "T", status: "active", why: "w" })),
    );
    expect(s).toContain("Blocked: none.");
  });

  it("shows top-3 pending, not more", () => {
    const s = taskStackSummary(
      stack(
        makeTask({ id: "0", title: "Active", status: "active", why: "w" }),
        makeTask({ id: "1", title: "P1", status: "pending", why: "w" }),
        makeTask({ id: "2", title: "P2", status: "pending", why: "w" }),
        makeTask({ id: "3", title: "P3", status: "pending", why: "w" }),
        makeTask({ id: "4", title: "P4", status: "pending", why: "w" }),
      ),
    );
    expect(s).toContain("P1");
    expect(s).toContain("P2");
    expect(s).toContain("P3");
    // 4th pending omitted but overflow count shown
    expect(s).toContain("+1 more");
    expect(s).not.toContain("P4,");
  });

  it("shows 'Pending: none.' when no pending tasks", () => {
    const s = taskStackSummary(
      stack(makeTask({ id: "1", title: "Active only", status: "active", why: "w" })),
    );
    expect(s).toContain("Pending: none.");
  });

  it("shows next-up from selectNextTask when no active task", () => {
    const s = taskStackSummary(
      stack(
        makeTask({ id: "1", title: "Pending task", status: "pending", priority: "high", why: "w" }),
      ),
    );
    expect(s).toContain("next up: Pending task");
  });

  it("handles multiple active tasks without crashing", () => {
    const s = taskStackSummary(
      stack(
        makeTask({ id: "1", title: "Alpha", status: "active", why: "w" }),
        makeTask({ id: "2", title: "Beta", status: "active", why: "w" }),
      ),
    );
    expect(s).toContain("Active (2):");
    expect(s).toContain("Alpha");
    expect(s).toContain("Beta");
  });

  it("omits closed/parked tasks from active/pending/blocked counts", () => {
    const s = taskStackSummary(
      stack(
        makeTask({ id: "1", title: "Closed", status: "closed", why: "w" }),
        makeTask({ id: "2", title: "Parked", status: "parked", why: "w" }),
        makeTask({ id: "3", title: "Active", status: "active", why: "w" }),
      ),
    );
    expect(s).not.toContain("Closed");
    expect(s).not.toContain("Parked");
    expect(s).toContain("Active: Active");
  });

  it("starts with 'Operator task stack:'", () => {
    const s = taskStackSummary(
      stack(makeTask({ id: "1", title: "T", status: "active", why: "w" })),
    );
    expect(s.startsWith("Operator task stack:")).toBe(true);
  });
});
