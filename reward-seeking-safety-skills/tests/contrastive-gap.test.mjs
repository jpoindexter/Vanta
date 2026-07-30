import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { analyzeContrastiveGap } from "../scripts/contrastive-gap.mjs";

test("computes a deterministic positive gap for 87 versus 9", () => {
  const input = {
    conditionA: { successes: 87, trials: 100 },
    conditionB: { successes: 9, trials: 100 },
    samples: 5000,
    seed: 7,
  };
  const first = analyzeContrastiveGap(input);
  const second = analyzeContrastiveGap(input);
  assert.deepEqual(first, second);
  assert.equal(first.rawPosteriorRateGap, 0.764706);
  assert.ok(first.logOddsGap > 4);
  assert.ok(first.credibleInterval95[0] > 0);
});

test("rejects impossible counts", () => {
  assert.throws(() => analyzeContrastiveGap({
    conditionA: { successes: 2, trials: 1 },
    conditionB: { successes: 0, trials: 1 },
  }), /exceeds trials/);
});

test("runs when invoked through a symlinked temporary path", () => {
  const directory = mkdtempSync(join(tmpdir(), "reward-safety-gap-"));
  const linkedScript = join(directory, "contrastive-gap.mjs");
  symlinkSync(
    realpathSync(new URL("../scripts/contrastive-gap.mjs", import.meta.url)),
    linkedScript,
  );
  const input = JSON.stringify({
    conditionA: { successes: 87, trials: 100 },
    conditionB: { successes: 9, trials: 100 },
    samples: 1000,
  });
  const output = execFileSync(process.execPath, [linkedScript], {
    encoding: "utf8",
    input,
  });
  assert.equal(JSON.parse(output).rawPosteriorRateGap, 0.764706);
});
