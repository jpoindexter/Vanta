import { describe, it, expect } from "vitest";
import { formatTasks, handleTasks, type TasksDeps } from "./bgtasks-cmd.js";
import type { BgTask } from "../tools/bg-tasks.js";

function task(over: Partial<BgTask> = {}): BgTask {
  return {
    id: "bg-1",
    command: "npm test",
    startedAt: "2026-06-20T10:00:00.000Z",
    status: "running",
    pid: 1234,
    ...over,
  };
}

describe("formatTasks", () => {
  it("returns a placeholder when there are no tasks", () => {
    expect(formatTasks([])).toBe("  (no background tasks)");
  });

  it("renders one row per task with status and id and label", () => {
    const out = formatTasks([task({ id: "bg-a", command: "sleep 5", status: "running" })]);
    expect(out).toContain("bg-a");
    expect(out).toContain("[running]");
    expect(out).toContain("sleep 5");
  });

  it("renders a row per task in order", () => {
    const out = formatTasks([
      task({ id: "bg-a", status: "running" }),
      task({ id: "bg-b", status: "done" }),
      task({ id: "bg-c", status: "failed" }),
    ]);
    expect(out.split("\n")).toHaveLength(3);
    expect(out).toContain("[done] bg-b");
    expect(out).toContain("[failed] bg-c");
  });

  it("truncates a long command label to 60 chars", () => {
    const long = "x".repeat(200);
    const out = formatTasks([task({ command: long })]);
    expect(out).toContain("x".repeat(60));
    expect(out).not.toContain("x".repeat(61));
  });
});

describe("handleTasks", () => {
  function deps(over: Partial<TasksDeps> = {}): TasksDeps {
    return {
      listTasks: async () => [task({ id: "bg-1" }), task({ id: "bg-2", status: "done" })],
      stopTask: async (id) => ({ ok: true, task: task({ id }) }),
      ...over,
    };
  }

  it("lists tasks with their status when given no arg", async () => {
    const { output } = await handleTasks("", deps());
    expect(output).toContain("bg-1");
    expect(output).toContain("[running]");
    expect(output).toContain("[done] bg-2");
  });

  it("lists tasks for the explicit `list` subcommand", async () => {
    const { output } = await handleTasks("list", deps());
    expect(output).toContain("bg-1");
    expect(output).toContain("bg-2");
  });

  it("shows the empty placeholder when there are no tasks", async () => {
    const { output } = await handleTasks("", deps({ listTasks: async () => [] }));
    expect(output).toBe("  (no background tasks)");
  });

  it("stops the matching task by id", async () => {
    let stopped = "";
    const { output } = await handleTasks("stop bg-2", deps({
      stopTask: async (id) => {
        stopped = id;
        return { ok: true, task: task({ id }) };
      },
    }));
    expect(stopped).toBe("bg-2");
    expect(output).toContain("stopped bg-2");
  });

  it("returns an error for an unknown id", async () => {
    const { output } = await handleTasks("stop nope", deps({
      stopTask: async () => ({ ok: false, error: "no background task matching 'nope'" }),
    }));
    expect(output).toContain("✗");
    expect(output).toContain("nope");
  });

  it("asks for an id when stop has no argument", async () => {
    const { output } = await handleTasks("stop", deps());
    expect(output).toContain("Usage: /bgtasks stop <id>");
  });

  it("rejects an unknown subcommand", async () => {
    const { output } = await handleTasks("frobnicate", deps());
    expect(output).toContain("Unknown subcommand 'frobnicate'");
  });
});
