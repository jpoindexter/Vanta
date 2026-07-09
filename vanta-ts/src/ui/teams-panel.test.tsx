import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { TeamsPanel } from "./teams-panel.js";
import { renderUi, tick, waitForFrame, waitUntil } from "./test-render.js";
import type { Worker } from "../team/store.js";
import type { WorkerTask } from "../team/tasks.js";

const worker: Worker = { kind: "worker", id: "analyst", role: "research", status: "idle", note: "market", ts: "t" };
const task: WorkerTask = {
  kind: "task",
  id: "t1",
  workerId: "analyst",
  title: "Map the market",
  status: "running",
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
};

describe("TeamsPanel", () => {
  it("renders team state and opens worker detail", async () => {
    const inst = renderUi(h(TeamsPanel, { data: { workers: [worker], tasks: [task] }, onClose: vi.fn() }));
    await waitForFrame(inst, "Teams · 1 worker · 1 open task");
    expect(inst.lastFrame()).toContain("analyst");
    expect(inst.lastFrame()).toContain("Map the market");

    inst.input("\r");
    await waitForFrame(inst, "Worker analyst");
    expect(inst.lastFrame()).toContain("research");
    inst.unmount();
  });

  it("closes on escape", async () => {
    const onClose = vi.fn();
    const inst = renderUi(h(TeamsPanel, { data: { workers: [], tasks: [] }, onClose }));
    await tick();
    inst.input("\x1b");
    await waitUntil(() => onClose.mock.calls.length > 0);
    expect(onClose).toHaveBeenCalled();
    inst.unmount();
  });
});
