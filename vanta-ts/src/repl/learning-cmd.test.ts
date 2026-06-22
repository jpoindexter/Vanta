import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatLearning, learning } from "./learning-cmd.js";
import { recordLearning } from "../learning/ledger.js";
import { learningStats } from "../learning/ledger.js";
import type { ReplCtx } from "./types.js";

describe("formatLearning", () => {
  it("shows an inviting empty state before any cycle", () => {
    expect(formatLearning(learningStats([]), [])).toMatch(/no cycles yet/);
  });
  it("renders the metric block once there are cycles", () => {
    const out = formatLearning(
      learningStats([
        { ts: "", skill: "a", kind: "minted", adopted: true, reason: "ok" },
        { ts: "", skill: "a", kind: "refined", adopted: true, reason: "ok" },
        { ts: "", skill: "b", kind: "minted", adopted: false, reason: "refusal" },
        { ts: "", skill: "a", kind: "reused", adopted: true, reason: "recalled during a task" },
      ]),
      ["✓ a (refined) — ok"],
    );
    expect(out).toMatch(/cycles    3/); // reuse events are not propose cycles
    expect(out).toMatch(/minted    2/);
    expect(out).toMatch(/refined 1/);
    expect(out).toMatch(/reused 1/);
    expect(out).toMatch(/adoption rate 67%/);
    expect(out).toMatch(/✓ a \(refined\)/);
  });
});

describe("/learning handler", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "learning-cmd-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads the project ledger and reports the stats", async () => {
    await recordLearning(dir, { ts: "2026-06-22T00:00:00Z", skill: "debug-vitest", kind: "minted", adopted: true, reason: "ok" });
    const res = await learning("", { dataDir: dir } as ReplCtx);
    expect(res.output).toMatch(/cycles    1/);
    expect(res.output).toMatch(/debug-vitest/);
  });
});
