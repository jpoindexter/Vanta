import { describe, expect, it } from "vitest";
import { attachRuntimeService, latestPreviewUrl, previewUrl } from "./runtime.js";
import type { FleetReport } from "./types.js";

const report: FleetReport = {
  id: "fleet-runtime",
  created: "2026-07-09T00:00:00.000Z",
  updated: "2026-07-09T00:00:00.000Z",
  workers: [{
    id: "worker-a",
    taskId: "task-a",
    title: "Build UI",
    status: "running",
    branch: "fleet/a",
    worktreePath: "/tmp/worktree-a",
    updated: "2026-07-09T00:00:00.000Z",
  }],
};

describe("fleet runtime services", () => {
  it("attaches a preview URL to a worker worktree", () => {
    const result = attachRuntimeService(report, {
      workerId: "worker-a",
      command: "npm run dev -- --host 127.0.0.1",
      port: 5173,
      pid: 1234,
      now: new Date("2026-07-09T00:01:00.000Z"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.service).toMatchObject({
      id: "worker-a-preview-1",
      url: "http://127.0.0.1:5173/",
      worktreePath: "/tmp/worktree-a",
      pid: 1234,
    });
    expect(latestPreviewUrl(result.report, "worker-a")).toBe("http://127.0.0.1:5173/");
    expect(result.report.workers[0]?.runtimeServices).toHaveLength(1);
  });

  it("increments preview service ids", () => {
    const first = attachRuntimeService(report, { workerId: "worker-a", command: "one", port: 3001 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = attachRuntimeService(first.report, { workerId: "worker-a", command: "two", port: 3002 });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.service.id).toBe("worker-a-preview-2");
    expect(latestPreviewUrl(second.report, "worker-a")).toBe("http://127.0.0.1:3002/");
  });

  it("rejects unknown workers and bad ports", () => {
    expect(attachRuntimeService(report, { workerId: "missing", command: "npm run dev", port: 5173 })).toMatchObject({ ok: false });
    expect(attachRuntimeService(report, { workerId: "worker-a", command: "npm run dev", port: 0 })).toMatchObject({ ok: false });
  });

  it("builds preview URLs with an explicit host", () => {
    expect(previewUrl(8080, "localhost")).toBe("http://localhost:8080/");
  });
});
