import { describe, expect, it } from "vitest";
import { formatFleetDigest, formatFleetReview, formatFleetStatus } from "./format.js";
import type { FleetReport } from "./types.js";

const report: FleetReport = {
  id: "fleet-digest",
  created: "2026-07-09T00:00:00.000Z",
  updated: "2026-07-09T00:01:00.000Z",
  workers: [
    {
      id: "fleet-digest-a",
      taskId: "fleet-digest:a",
      title: "Build auth",
      status: "done",
      branch: "fleet/a",
      worktreePath: "/tmp/a",
      result: "Implemented auth flow and added tests.",
      diff: "2 files changed",
      runtimeServices: [{
        id: "fleet-digest-a-preview-1",
        kind: "preview",
        command: "npm run dev",
        port: 5173,
        url: "http://127.0.0.1:5173/",
        status: "running",
        startedAt: "2026-07-09T00:01:00.000Z",
        worktreePath: "/tmp/a",
      }],
      updated: "2026-07-09T00:01:00.000Z",
    },
    {
      id: "fleet-digest-b",
      taskId: "fleet-digest:b",
      title: "Build billing",
      status: "blocked",
      branch: "fleet/b",
      worktreePath: "/tmp/b",
      blocker: "Stripe fixture missing",
      updated: "2026-07-09T00:01:00.000Z",
    },
  ],
};

describe("formatFleetDigest", () => {
  it("summarizes findings, blockers, and operator decisions", () => {
    const out = formatFleetDigest(report);
    expect(out).toContain("fleet digest fleet-digest");
    expect(out).toContain("1 done, 1 blocked");
    expect(out).toContain("fleet-digest-a: done — Implemented auth flow");
    expect(out).toContain("fleet-digest-b: blocked — Stripe fixture missing");
    expect(out).toContain("Conflicts / blockers");
    expect(out).toContain("unblock or retire fleet-digest-b");
    expect(out).toContain("accept or reject fleet-digest-a");
    expect(out).toContain("preview: http://127.0.0.1:5173/");
  });

  it("surfaces preview URLs in status and review output", () => {
    expect(formatFleetStatus(report)).toContain("preview: http://127.0.0.1:5173/");
    expect(formatFleetReview(report)).toContain("preview http://127.0.0.1:5173/");
  });
});
