import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideAutonomy, DEFAULT_AUTONOMY_CONTRACT } from "./contract.js";
import { formatPendingAutonomy, loadPendingAutonomy, resolvePendingAutonomy, surfaceAutonomyDecision } from "./surface.js";

describe("autonomy operator surface", () => {
  it("persists queued decisions and clears them after the same workflow earns auto", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-autonomy-surface-"));
    try {
      const queued = decideAutonomy(DEFAULT_AUTONOMY_CONTRACT, { kind: "watch.repo", source: "repo-a", summary: "review repo", risk: "medium" });
      await surfaceAutonomyDecision(dir, queued, { now: () => new Date("2026-07-10T10:00:00Z") });
      expect(formatPendingAutonomy(await loadPendingAutonomy(dir))).toContain("watch.repo:repo-a");

      await surfaceAutonomyDecision(dir, { ...queued, lane: "acts-alone", ruleId: "earned", reason: "earned trust" }, { now: () => new Date("2026-07-10T11:00:00Z") });
      expect(await loadPendingAutonomy(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("awaits an operator notification for wakes-me decisions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-autonomy-surface-"));
    const notify = vi.fn(async () => {});
    try {
      const decision = decideAutonomy(DEFAULT_AUTONOMY_CONTRACT, { kind: "shell.mutate", summary: "delete files", risk: "high" });
      await surfaceAutonomyDecision(dir, decision, { notify, cwd: "/repo" });
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({
        title: "Vanta · action needs you",
        message: expect.stringContaining("delete files"),
        dataDir: dir,
        cwd: "/repo",
        notificationType: "autonomy_wake",
      }));
      expect((await loadPendingAutonomy(dir))[0]?.lane).toBe("wakes-me");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resolves a pending decision with a note and reopens on a later decision", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-autonomy-surface-"));
    const queued = decideAutonomy(DEFAULT_AUTONOMY_CONTRACT, { kind: "watch.repo", source: "repo-a", summary: "review repo", risk: "medium" });
    try {
      await surfaceAutonomyDecision(dir, queued, { now: () => new Date("2026-07-10T10:00:00Z") });
      expect(await resolvePendingAutonomy(dir, "watch.repo:repo-a", "reviewed manually", () => new Date("2026-07-10T10:30:00Z"))).toMatchObject({ note: "reviewed manually" });
      expect(await loadPendingAutonomy(dir)).toEqual([]);
      expect(await resolvePendingAutonomy(dir, "watch.repo:repo-a", "already gone")).toBeNull();

      await surfaceAutonomyDecision(dir, queued, { now: () => new Date("2026-07-10T11:00:00Z") });
      expect(await loadPendingAutonomy(dir)).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
