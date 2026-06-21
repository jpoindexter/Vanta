import { describe, it, expect } from "vitest";
import {
  BETA_PATHS,
  runBetaProof,
  formatBetaReport,
  type BetaPath,
  type BetaProofDeps,
} from "./beta-proof.js";

const allPass: BetaProofDeps = { run: async (p) => ({ ok: true, evidence: `${p.id} ok` }) };

describe("BETA_PATHS", () => {
  it("covers install, does-a-task, multi-step, safe, reach, media, scheduled", () => {
    const ids = BETA_PATHS.map((p) => p.id);
    expect(ids).toEqual(["install", "does-a-task", "multi-step", "safe", "reaches-you", "media", "scheduled"]);
  });
  it("marks the live-only paths as gated, the headless ones as not", () => {
    const gated = BETA_PATHS.filter((p) => p.gated).map((p) => p.id);
    expect(gated).toEqual(["install", "reaches-you", "media", "scheduled"]);
    const headless = BETA_PATHS.filter((p) => !p.gated).map((p) => p.id);
    expect(headless).toEqual(["does-a-task", "multi-step", "safe"]);
  });
});

describe("runBetaProof", () => {
  it("runs every non-gated path and records gated ones without running them", async () => {
    let ran = 0;
    const deps: BetaProofDeps = { run: async (p) => { ran++; return { ok: true, evidence: p.id }; } };
    const report = await runBetaProof(BETA_PATHS, deps);
    expect(ran).toBe(3); // only the 3 non-gated paths were run
    expect(report.proven.map((r) => r.id)).toEqual(["does-a-task", "multi-step", "safe"]);
    expect(report.gated.map((r) => r.id)).toEqual(["install", "reaches-you", "media", "scheduled"]);
    expect(report.ready).toBe(true);
  });

  it("is not ready when a non-gated path fails", async () => {
    const deps: BetaProofDeps = {
      run: async (p) => ({ ok: p.id !== "safe", evidence: p.id }), // 'safe' fails
    };
    const report = await runBetaProof(BETA_PATHS, deps);
    expect(report.ready).toBe(false);
    expect(report.proven.find((r) => r.id === "safe")!.ok).toBe(false);
  });

  it("a thrown check becomes a failed path (errors-as-values)", async () => {
    const deps: BetaProofDeps = { run: async () => { throw new Error("kernel down"); } };
    const report = await runBetaProof([BETA_PATHS[1]!], deps); // does-a-task
    expect(report.ready).toBe(false);
    expect(report.proven[0]!.evidence).toBe("kernel down");
  });

  it("never silently passes a gated path", async () => {
    const report = await runBetaProof(BETA_PATHS, allPass);
    for (const g of report.gated) {
      expect(g.ok).toBe(false);
      expect(g.evidence).toMatch(/needs:/);
    }
  });
});

describe("formatBetaReport", () => {
  it("renders proven + gated sections with the readiness verdict", async () => {
    const report = await runBetaProof(BETA_PATHS, allPass);
    const md = formatBetaReport(report, "2026-06-22");
    expect(md).toContain("All headless-provable paths green");
    expect(md).toContain("## Proven on this machine");
    expect(md).toContain("## Still gated");
    expect(md).toContain("Telegram bot token");
    expect(md).toContain("✅ **Does a real task**");
    expect(md).toContain("🔒 **Reaches you on a channel**");
  });
});
