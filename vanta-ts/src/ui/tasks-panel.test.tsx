import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { TasksPanel } from "./tasks-panel.js";
import type { WorkerTask } from "../team/tasks.js";

// The test-render harness joins all writes and does NOT reflect post-input
// re-renders (see quick-open.test). So: assert static rendering of each view via
// props, and assert interactivity via the onClose callback. The keypress→action
// logic is covered purely in task-rows.test.ts (tasksKeyAction).

function task(overrides: Partial<WorkerTask> = {}): WorkerTask {
  const created = new Date(Date.now() - 90_000).toISOString();
  return { kind: "task", id: "t1", workerId: "worker-a", title: "Build the parser", status: "running", created, updated: created, ...overrides };
}

describe("TasksPanel — list view", () => {
  it("shows the header with a task count", async () => {
    const inst = renderUi(h(TasksPanel, { tasks: [task()], onClose: () => {} }));
    await tick();
    expect(inst.lastFrame()).toContain("Agents · 1 task");
    inst.unmount();
  });

  it("renders a task's type badge, status, elapsed, and title", async () => {
    const inst = renderUi(h(TasksPanel, { tasks: [task({ workerId: "shell-1", title: "tail logs" })], onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("shell");
    expect(out).toContain("running");
    expect(out).toContain("tail logs");
    expect(out).toMatch(/1m \d+s/); // elapsed since created ~90s ago
    inst.unmount();
  });

  it("classifies agent / shell / remote across rows", async () => {
    const tasks = [
      task({ id: "a", workerId: "worker-a", title: "agent task" }),
      task({ id: "b", workerId: "shell-2", title: "shell task" }),
      task({ id: "c", workerId: "remote-gh", title: "remote task" }),
    ];
    const inst = renderUi(h(TasksPanel, { tasks, onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("agent");
    expect(out).toContain("shell");
    expect(out).toContain("remote");
    inst.unmount();
  });

  it("shows the empty state when there are no tasks", async () => {
    const inst = renderUi(h(TasksPanel, { tasks: [], onClose: () => {} }));
    await tick();
    expect(inst.lastFrame()).toContain("(no background tasks");
    inst.unmount();
  });

  it("shows the keybinding footer", async () => {
    const inst = renderUi(h(TasksPanel, { tasks: [task()], onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("⏎ detail");
    expect(out).toContain("s stop");
    expect(out).toContain("r respawn");
    inst.unmount();
  });

  it("closes on Esc", async () => {
    const onClose = vi.fn();
    const inst = renderUi(h(TasksPanel, { tasks: [task()], onClose }));
    await tick();
    inst.input("\x1b"); // Esc — Ink debounces escape, so flush twice
    await tick();
    await tick();
    expect(onClose).toHaveBeenCalled();
    inst.unmount();
  });
});

describe("TasksPanel — detail view", () => {
  it("renders the full output log when opened on a task", async () => {
    const inst = renderUi(h(TasksPanel, { tasks: [task({ status: "done", result: "finished ok\nsecond line" })], onClose: () => {}, initialDetail: true }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Task t1");
    expect(out).toContain("status   done");
    expect(out).toContain("result:");
    expect(out).toContain("finished ok");
    expect(out).toContain("second line");
    expect(out).toContain("Esc back");
    inst.unmount();
  });

  it("shows the blocker output for a blocked task", async () => {
    const inst = renderUi(h(TasksPanel, { tasks: [task({ status: "blocked", blocker: "needs token" })], onClose: () => {}, initialDetail: true }));
    await tick();
    expect(inst.lastFrame()).toContain("needs token");
    inst.unmount();
  });
});
