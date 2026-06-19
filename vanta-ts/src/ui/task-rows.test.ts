import { describe, it, expect } from "vitest";
import {
  classifyTaskType,
  typeBadge,
  statusGlyph,
  formatElapsed,
  toTaskRow,
  detailLines,
  tasksKeyAction,
} from "./task-rows.js";
import type { WorkerTask } from "../team/tasks.js";

function task(overrides: Partial<WorkerTask> = {}): WorkerTask {
  const now = "2026-06-19T12:00:00.000Z";
  return {
    kind: "task",
    id: "t1",
    workerId: "worker-a",
    title: "Build the parser",
    status: "running",
    created: now,
    updated: now,
    ...overrides,
  };
}

describe("classifyTaskType", () => {
  it("classifies shell- workers as shell", () => {
    expect(classifyTaskType("shell-001")).toBe("shell");
    expect(classifyTaskType("SHELL:abc")).toBe("shell");
  });
  it("classifies remote- workers as remote", () => {
    expect(classifyTaskType("remote-gh-hook")).toBe("remote");
    expect(classifyTaskType("Remote:cron")).toBe("remote");
  });
  it("defaults everything else to agent", () => {
    expect(classifyTaskType("worker-a")).toBe("agent");
    expect(classifyTaskType("fleet-3")).toBe("agent");
  });
});

describe("typeBadge", () => {
  it("renders a distinct badge per type", () => {
    expect(typeBadge("agent")).toContain("agent");
    expect(typeBadge("shell")).toContain("shell");
    expect(typeBadge("remote")).toContain("remote");
  });
});

describe("statusGlyph", () => {
  it("maps each status to a glyph + color", () => {
    expect(statusGlyph("running").glyph).toBe("▶");
    expect(statusGlyph("done").glyph).toBe("✓");
    expect(statusGlyph("done").color).toBe("#83f2b0");
    expect(statusGlyph("removed").color).toBe("#ff6b7a");
    expect(statusGlyph("stopped").glyph).toBe("■");
  });
});

describe("formatElapsed", () => {
  const now = new Date("2026-06-19T12:01:30.000Z");
  it("uses now for an open task (updated === created)", () => {
    // created 90s before now, still open → 1m 30s
    expect(formatElapsed("2026-06-19T12:00:00.000Z", "2026-06-19T12:00:00.000Z", now)).toBe("1m 30s");
  });
  it("uses the updated timestamp for a terminal task", () => {
    // ran for 45s then finished
    expect(formatElapsed("2026-06-19T12:00:00.000Z", "2026-06-19T12:00:45.000Z", now)).toBe("45s");
  });
  it("formats hours and days", () => {
    const t0 = "2026-06-18T12:00:00.000Z";
    expect(formatElapsed(t0, "2026-06-18T14:30:00.000Z", now)).toBe("2h 30m");
    expect(formatElapsed(t0, "2026-06-19T15:00:00.000Z", now)).toBe("1d 3h");
  });
  it("returns — on unparseable input", () => {
    expect(formatElapsed("nope", "nope", now)).toBe("—");
  });
});

describe("toTaskRow", () => {
  const now = new Date("2026-06-19T12:00:30.000Z");
  it("shapes a worker task into a display row", () => {
    const row = toTaskRow(task({ id: "x", workerId: "shell-7", status: "running", title: "tail logs" }), now);
    expect(row.id).toBe("x");
    expect(row.type).toBe("shell");
    expect(row.statusGlyph).toBe("▶");
    expect(row.elapsed).toBe("30s");
    expect(row.title).toBe("tail logs");
  });
  it("clips a long title", () => {
    const long = "a".repeat(80);
    const row = toTaskRow(task({ title: long }), now);
    expect(row.title.length).toBeLessThanOrEqual(48);
    expect(row.title.endsWith("…")).toBe(true);
  });
});

describe("detailLines", () => {
  it("includes the result as the output log when present", () => {
    const lines = detailLines(task({ status: "done", result: "finished ok\nsecond line" }));
    const text = lines.join("\n");
    expect(text).toContain("status   done");
    expect(text).toContain("result:");
    expect(text).toContain("finished ok");
    expect(text).toContain("second line");
  });
  it("includes the blocker when blocked", () => {
    const lines = detailLines(task({ status: "blocked", blocker: "needs token" }));
    expect(lines.join("\n")).toContain("needs token");
  });
  it("shows a placeholder when there is no output yet", () => {
    const lines = detailLines(task({ status: "assigned" }));
    expect(lines.join("\n")).toContain("(no output recorded yet)");
  });
});

describe("tasksKeyAction", () => {
  const list = { detail: false, sel: 1, count: 3, current: { status: "running" as const } };

  it("Esc in the list closes the panel", () => {
    expect(tasksKeyAction("", { escape: true }, list)).toEqual({ kind: "close" });
  });
  it("Esc/Enter in the detail view returns to the list", () => {
    expect(tasksKeyAction("", { escape: true }, { ...list, detail: true })).toEqual({ kind: "closeDetail" });
    expect(tasksKeyAction("", { return: true }, { ...list, detail: true })).toEqual({ kind: "closeDetail" });
  });
  it("arrows move the selection within bounds", () => {
    expect(tasksKeyAction("", { upArrow: true }, list)).toEqual({ kind: "move", to: 0 });
    expect(tasksKeyAction("", { downArrow: true }, list)).toEqual({ kind: "move", to: 2 });
    expect(tasksKeyAction("", { downArrow: true }, { ...list, sel: 2 })).toEqual({ kind: "move", to: 2 });
    expect(tasksKeyAction("", { upArrow: true }, { ...list, sel: 0 })).toEqual({ kind: "move", to: 0 });
  });
  it("Enter opens the detail view when a task is selected", () => {
    expect(tasksKeyAction("", { return: true }, list)).toEqual({ kind: "openDetail" });
    expect(tasksKeyAction("", { return: true }, { ...list, current: undefined })).toEqual({ kind: "noop" });
  });
  it("s stops a stoppable task and rejects a terminal one", () => {
    expect(tasksKeyAction("s", {}, list)).toEqual({ kind: "stop" });
    expect(tasksKeyAction("s", {}, { ...list, current: { status: "done" } })).toEqual({ kind: "rejectStop", status: "done" });
  });
  it("r respawns a terminal task and rejects a running one", () => {
    expect(tasksKeyAction("r", {}, { ...list, current: { status: "done" } })).toEqual({ kind: "respawn" });
    expect(tasksKeyAction("r", {}, list)).toEqual({ kind: "rejectRespawn", status: "running" });
  });
  it("ignores unrelated keys", () => {
    expect(tasksKeyAction("z", {}, list)).toEqual({ kind: "noop" });
  });
});
