import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCompressCng, baselineEnv, DIMENSIONS } from "./compress-run.js";
import type { TaskRunner } from "./run.js";
import type { EvalTask } from "./types.js";

const TASKS: EvalTask[] = [{ id: "w", instruction: "make out.txt", check: { kind: "file_contains", path: "out.txt", text: "DONE" } }];

// Every run satisfies the check (writes out.txt) so pass@1 stays 100% across phases;
// the stub returns DIFFERENT token counts per env overlay so we can prove the harness
// (a) ran a baseline with all dims off, and (b) measured each treatment in isolation.
function stubRunForEnv(tokensByOverlay: (overlay: Record<string, string>) => number): (overlay: Record<string, string>) => TaskRunner {
  return (overlay) => async (_instruction, root) => {
    writeFileSync(join(root, "out.txt"), "DONE", "utf8");
    return { outputTokens: tokensByOverlay(overlay) };
  };
}

describe("baselineEnv", () => {
  it("forces every dimension OFF", () => {
    expect(baselineEnv()).toEqual({ VANTA_SKILL_DISTILLED: "0", VANTA_SKILL_SUBSET: "0", VANTA_COMPRESS: "0" });
  });
});

describe("runCompressCng", () => {
  let baseDir: string;
  beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), "vanta-cng-")); });
  afterEach(() => { rmSync(baseDir, { recursive: true, force: true }); });

  it("runs a baseline + one treatment per dimension and computes per-dimension CNG", async () => {
    // baseline (no treatment key on) = 1000 tokens; each treatment shaves 100.
    const runForEnv = stubRunForEnv((overlay) => {
      if (overlay.VANTA_SKILL_DISTILLED === "1") return 900;
      if (overlay.VANTA_SKILL_SUBSET === "1") return 800;
      if (overlay.VANTA_COMPRESS === "1") return 700;
      return 1000; // baseline
    });
    const report = await runCompressCng({ tasks: TASKS, baseDir, runForEnv, rollouts: 1 });

    expect(report.dimensions).toHaveLength(DIMENSIONS.length);
    expect(report.baseline.outputTokens).toBe(1000);
    expect(report.baseline.passAt1).toBe(100);

    const subset = report.dimensions.find((d) => d.name === "skill-subset")!;
    expect(subset.treatment.outputTokens).toBe(800);
    expect(subset.verdict.tokensSaved).toBe(200);
    expect(subset.verdict.passDelta).toBe(0);
    expect(subset.verdict.netPositive).toBe(true);

    const prune = report.dimensions.find((d) => d.name === "prune")!;
    expect(prune.verdict.tokensSaved).toBe(300);
    expect(prune.verdict.netPositive).toBe(true);
  });

  it("marks a token-neutral dimension NOT net-positive", async () => {
    const runForEnv = stubRunForEnv(() => 1000); // every phase identical
    const report = await runCompressCng({ tasks: TASKS, baseDir, runForEnv, rollouts: 1 });
    for (const d of report.dimensions) expect(d.verdict.netPositive).toBe(false);
    for (const f of report.flips) expect(f.flip).toBe(false);
  });

  it("does NOT flip on a small-N (1 task / 1 rollout) signal even when net-positive", async () => {
    const runForEnv = stubRunForEnv((overlay) => (Object.values(overlay).includes("1") ? 500 : 1000));
    const report = await runCompressCng({ tasks: TASKS, baseDir, runForEnv, rollouts: 1 });
    for (const d of report.dimensions) expect(d.verdict.netPositive).toBe(true);
    for (const f of report.flips) {
      expect(f.flip).toBe(false);
      expect(f.reason).toContain("insufficient signal");
    }
  });

  it("flips a net-positive dimension once the signal is sufficient", async () => {
    const tasks: EvalTask[] = Array.from({ length: 3 }, (_, i) => ({ id: `w${i}`, instruction: "make out.txt", check: { kind: "file_contains" as const, path: "out.txt", text: "DONE" } }));
    const runForEnv = stubRunForEnv((overlay) => (overlay.VANTA_COMPRESS === "1" ? 600 : 1000));
    const report = await runCompressCng({ tasks, baseDir, runForEnv, rollouts: 2 }); // 3 × 2 = 6 obs
    const prune = report.flips.find((f) => f.name === "prune")!;
    expect(prune.flip).toBe(true);
  });
});
