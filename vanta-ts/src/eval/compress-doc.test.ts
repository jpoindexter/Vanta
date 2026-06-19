import { describe, it, expect } from "vitest";
import { renderCngDoc } from "./compress-doc.js";
import type { CompressCngReport } from "./compress-run.js";
import type { EvalReport } from "./types.js";

function rep(passAt1: number, outputTokens: number): EvalReport {
  return { total: 1, passed: 1, passAt1, outputTokens, results: [{ id: "t", pass: true, passes: 1, runs: 1, detail: "", outputTokens }] };
}

const REPORT: CompressCngReport = {
  corpusSize: 2,
  rollouts: 1,
  baseline: rep(100, 1000),
  dimensions: [
    { name: "skill-subset", baseline: rep(100, 1000), treatment: rep(100, 700), verdict: { tokensSaved: 300, passDelta: 0, netPositive: true } },
    { name: "prune", baseline: rep(100, 1000), treatment: rep(90, 600), verdict: { tokensSaved: 400, passDelta: -10, netPositive: false } },
  ],
  flips: [
    { name: "skill-subset", flip: false, reason: "insufficient signal (2 obs < 6) — record only, do not flip" },
    { name: "prune", flip: false, reason: "CNG not net-positive (pass@1 regressed -10pp)" },
  ],
};

describe("renderCngDoc", () => {
  const doc = renderCngDoc({ report: REPORT, provider: "codex", model: "gpt-5.5", now: "2026-06-19T00:00:00.000Z" });

  it("records the provider, model, and corpus size", () => {
    expect(doc).toContain("provider `codex`");
    expect(doc).toContain("model `gpt-5.5`");
    expect(doc).toContain("2 task(s) × 1 rollout(s)");
  });

  it("renders a per-dimension table row with token + pass deltas", () => {
    expect(doc).toContain("| skill-subset | 1,000 | 700 | 300 | 100% | 100% | 0 | yes |");
    expect(doc).toContain("| prune | 1,000 | 600 | 400 | 100% | 90% | -10 | no |");
  });

  it("records every flip decision and the small-N caveat", () => {
    expect(doc).toContain("keep current default");
    expect(doc).toContain("SMALL-N directional signal");
  });
});
