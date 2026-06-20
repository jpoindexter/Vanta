import { evaluateOutput } from "../verify/check.js";
import type { Lock } from "../verify/store.js";

// The self-correction loop: confirm a failure reproduces, drive a (kernel-gated)
// fix, rerun the failing input, and on success lock a regression so the bug can
// never silently return — one loop. Every side effect (run / fix / lock) is
// injected, so the orchestration is fully testable without a kernel, provider,
// or shell; the tool layer wires the real ones.

export type Failure = { command: string; expect: string };
export type RunResult = { exitCode: number; output: string };
export type FixOutcome = { summary: string };

export type SelfCorrectDeps = {
  run: (command: string) => Promise<RunResult>;
  /** Diagnose + propose + apply a fix (a kernel-gated subagent). Returns a summary. */
  fix: (failure: Failure, failureOutput: string) => Promise<FixOutcome>;
  lock: (lock: Lock) => void;
  now: () => number;
};

export type SelfCorrectStage = "no-failure" | "fix-error" | "still-failing" | "fixed";
export type SelfCorrectResult = {
  stage: SelfCorrectStage;
  detail: string;
  fixSummary?: string;
  lockId?: string;
};

function passes(run: RunResult, expect: string): boolean {
  return run.exitCode === 0 && evaluateOutput(expect, run.output);
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "fix";
}

function makeLock(failure: Failure, now: number): Lock {
  return {
    id: slug(failure.command),
    claim: `${failure.command} → output contains "${failure.expect}"`,
    command: failure.command,
    expect: failure.expect,
    status: "locked",
    created: now,
    updated: now,
  };
}

export async function selfCorrect(failure: Failure, deps: SelfCorrectDeps): Promise<SelfCorrectResult> {
  const before = await deps.run(failure.command);
  if (passes(before, failure.expect)) {
    return { stage: "no-failure", detail: "command already passes — nothing to correct" };
  }
  let fixSummary: string;
  try {
    fixSummary = (await deps.fix(failure, before.output)).summary;
  } catch (err) {
    return { stage: "fix-error", detail: err instanceof Error ? err.message : String(err) };
  }
  const after = await deps.run(failure.command);
  if (!passes(after, failure.expect)) {
    return { stage: "still-failing", detail: "rerun still fails after the fix", fixSummary };
  }
  const lock = makeLock(failure, deps.now());
  deps.lock(lock);
  return { stage: "fixed", detail: `fixed + locked regression "${lock.id}"`, fixSummary, lockId: lock.id };
}
