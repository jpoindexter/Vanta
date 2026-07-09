import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createGoalSentinel,
  loadSentinels,
  retireSentinel,
  runSentinels,
  sentinelWakePath,
} from "./sentinel.js";

describe("standing goal sentinels", () => {
  it("records pass/fail history and wakes on violation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-sentinel-"));
    try {
      await createGoalSentinel(dir, { goalId: 7, goalText: "ship invariant", command: "true" });
      let results = await runSentinels(dir, new Date("2026-07-09T17:00:00.000Z"));
      expect(results[0]?.status).toBe("pass");

      await createGoalSentinel(dir, { goalId: 7, goalText: "ship invariant", command: "false" });
      results = await runSentinels(dir, new Date("2026-07-09T17:01:00.000Z"));
      expect(results[0]?.status).toBe("fail");
      expect((await loadSentinels(dir)).sentinels[0]?.history.map((h) => h.status)).toEqual(["pass", "fail"]);
      expect(await readFile(sentinelWakePath(dir), "utf8")).toContain("goal-7");
      expect(await readFile(join(dir, "trust-ledger.json"), "utf8")).toContain("standing-goal.sentinel.goal-7");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("requires an explicit note before retiring a predicate", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-sentinel-"));
    try {
      await createGoalSentinel(dir, { goalId: 8, goalText: "flaky goal", command: "true" });
      expect(await retireSentinel(dir, { id: "goal-8", reason: "" })).toBeNull();
      const retired = await retireSentinel(dir, { id: "goal-8", reason: "check was flaky on CI" });
      expect(retired?.status).toBe("retired");
      expect(retired?.retireReason).toBe("check was flaky on CI");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
