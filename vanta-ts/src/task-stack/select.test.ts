import { describe, it, expect } from "vitest";
import { selectNextTask } from "./select.js";
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

describe("selectNextTask", () => {
  it("returns null for an empty stack", () => {
    expect(selectNextTask(stack())).toBeNull();
  });

  it("returns null when all tasks are blocked/parked/closed", () => {
    const s = stack(
      makeTask({ id: "1", title: "B", status: "blocked" }),
      makeTask({ id: "2", title: "P", status: "parked" }),
      makeTask({ id: "3", title: "C", status: "closed" }),
    );
    expect(selectNextTask(s)).toBeNull();
  });

  it("prefers active over pending", () => {
    const s = stack(
      makeTask({ id: "1", title: "Pending", status: "pending", priority: "high" }),
      makeTask({ id: "2", title: "Active", status: "active", priority: "low" }),
    );
    expect(selectNextTask(s)!.title).toBe("Active");
  });

  it("breaks active tie by priority", () => {
    const s = stack(
      makeTask({ id: "1", title: "Low active", status: "active", priority: "low" }),
      makeTask({ id: "2", title: "High active", status: "active", priority: "high" }),
    );
    expect(selectNextTask(s)!.title).toBe("High active");
  });

  it("breaks pending tie by priority: high > medium > low", () => {
    const s = stack(
      makeTask({ id: "1", title: "Low", status: "pending", priority: "low" }),
      makeTask({ id: "2", title: "Medium", status: "pending", priority: "medium" }),
      makeTask({ id: "3", title: "High", status: "pending", priority: "high" }),
    );
    expect(selectNextTask(s)!.title).toBe("High");
  });

  it("tasks with missing priority sort below low", () => {
    const s = stack(
      makeTask({ id: "1", title: "No priority", status: "pending" }),
      makeTask({ id: "2", title: "Low", status: "pending", priority: "low" }),
    );
    expect(selectNextTask(s)!.title).toBe("Low");
  });

  it("breaks priority tie by oldest lastTouchedAt (ascending)", () => {
    const s = stack(
      makeTask({
        id: "1", title: "Recent", status: "pending", priority: "high",
        updatedAt: "2026-01-02T00:00:00.000Z",
        lastTouchedAt: "2026-06-01T00:00:00.000Z",
      }),
      makeTask({
        id: "2", title: "Older", status: "pending", priority: "high",
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastTouchedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(selectNextTask(s)!.title).toBe("Older");
  });

  it("falls back to updatedAt when lastTouchedAt is absent", () => {
    const s = stack(
      makeTask({ id: "1", title: "Newer updated", status: "pending", updatedAt: "2026-06-01T00:00:00.000Z" }),
      makeTask({ id: "2", title: "Older updated", status: "pending", updatedAt: "2026-01-01T00:00:00.000Z" }),
    );
    expect(selectNextTask(s)!.title).toBe("Older updated");
  });

  it("skips blocked, parked, and closed tasks even when higher priority", () => {
    const s = stack(
      makeTask({ id: "1", title: "Blocked high", status: "blocked", priority: "high" }),
      makeTask({ id: "2", title: "Parked high", status: "parked", priority: "high" }),
      makeTask({ id: "3", title: "Closed high", status: "closed", priority: "high" }),
      makeTask({ id: "4", title: "Pending low", status: "pending", priority: "low" }),
    );
    expect(selectNextTask(s)!.title).toBe("Pending low");
  });

  it("returns the sole active task", () => {
    const s = stack(
      makeTask({ id: "1", title: "Only", status: "active" }),
    );
    expect(selectNextTask(s)!.title).toBe("Only");
  });

  it("does not mutate the original stack", () => {
    const tasks = [
      makeTask({ id: "1", title: "A", status: "pending", priority: "low" }),
      makeTask({ id: "2", title: "B", status: "pending", priority: "high" }),
    ];
    const s = stack(...tasks);
    selectNextTask(s);
    // Original order preserved
    expect(s.tasks[0]!.title).toBe("A");
    expect(s.tasks[1]!.title).toBe("B");
  });
});
