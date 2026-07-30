import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { routeText } from "../scripts/route.mjs";

test("routes hidden-test access to reward-process integrity", () => {
  const skills = routeText("Can the agent read or modify hidden tests?")
    .map((match) => match.skill);
  assert.ok(skills.includes("reward-process-integrity"));
});

test("routes grader-versus-user conflicts to contrastive evaluation", () => {
  const skills = routeText("Test whether it follows the grader over the user")
    .map((match) => match.skill);
  assert.ok(skills.includes("contrastive-authority-eval"));
  assert.ok(!skills.includes("reward-process-integrity"));
});

test("routes absent monitoring to oversight generalization", () => {
  const skills = routeText("Compare behavior when the monitor is absent")
    .map((match) => match.skill);
  assert.ok(skills.includes("oversight-generalization-audit"));
});

test("falls back to the root router for an underspecified request", () => {
  assert.deepEqual(routeText("review this"), [{
    skill: "reward-safety",
    reason: "Use the router to define the reward path.",
  }]);
});

test("runs when invoked through a symlinked temporary path", () => {
  const directory = mkdtempSync(join(tmpdir(), "reward-safety-route-"));
  const linkedScript = join(directory, "route.mjs");
  symlinkSync(realpathSync(new URL("../scripts/route.mjs", import.meta.url)), linkedScript);
  const output = execFileSync(process.execPath, [linkedScript, "grader over the user"], {
    encoding: "utf8",
  });
  assert.match(output, /^contrastive-authority-eval:/);
});
