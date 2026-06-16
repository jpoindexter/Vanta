import { runCheck } from "./verifier.js";
import { makeSandbox } from "./sandbox.js";
import type { EvalTask, EvalResult, EvalReport } from "./types.js";

// Orchestrate the corpus: per task → sandbox → run the agent → deterministic
// grade → result; aggregate to pass@1. The agent runner is INJECTED so the loop
// stays pure/testable (real impl wires prepareRun+runAgent; tests stub it).

/** Run one task's agent turn inside `root`; returns usage. */
export type TaskRunner = (instruction: string, root: string) => Promise<{ iterations?: number; outputTokens?: number }>;

/** Wrap each rollout so the harness can be frozen around it (controllability):
 * every rollout starts from the same component state, so the task agent's own
 * writes can't contaminate later rollouts. Default = identity (no isolation). */
export type Isolate = <T>(fn: () => Promise<T>) => Promise<T>;
const identityIsolate: Isolate = (fn) => fn();

/** Pure: roll per-task results into a report. pass@1 = mean of (passes/runs) per
 * task (k≥2 rollouts make this far less noisy than a single binary outcome). */
export function aggregate(results: EvalResult[]): EvalReport {
  const passed = results.filter((r) => r.pass).length;
  const outputTokens = results.reduce((n, r) => n + (r.outputTokens ?? 0), 0);
  const meanFrac = results.length
    ? results.reduce((s, r) => s + (r.runs ? r.passes / r.runs : 0), 0) / results.length
    : 0;
  return { total: results.length, passed, passAt1: Math.round(meanFrac * 1000) / 10, outputTokens, results };
}

/** Pure: the one-line score summary (per-task lines stream live during the run). */
export function formatReport(r: EvalReport): string {
  return `pass@1: ${r.passAt1}%  (${r.passed}/${r.total})   output tokens: ${r.outputTokens.toLocaleString()}`;
}

/** One rollout: fresh sandbox → agent turn → deterministic grade. */
async function rollout(task: EvalTask, baseDir: string, run: TaskRunner): Promise<{ pass: boolean; detail: string; outputTokens: number }> {
  const sb = makeSandbox(baseDir, task.seed);
  try {
    const usage = await run(`${task.instruction}\n\nWork only inside this directory: ${sb.root}`, sb.root);
    const check = runCheck(task.check, sb.root);
    return { pass: check.pass, detail: check.detail, outputTokens: usage.outputTokens ?? 0 };
  } catch (e) {
    return { pass: false, detail: `run error: ${(e as Error).message.split("\n")[0]}`, outputTokens: 0 };
  } finally {
    sb.cleanup();
  }
}

async function runOne(task: EvalTask, baseDir: string, run: TaskRunner, rollouts: number, isolate: Isolate): Promise<EvalResult> {
  let passes = 0, outputTokens = 0, lastDetail = "";
  for (let r = 0; r < rollouts; r++) {
    const out = await isolate(() => rollout(task, baseDir, run));
    if (out.pass) passes++;
    outputTokens += out.outputTokens;
    lastDetail = out.detail;
  }
  return { id: task.id, pass: passes === rollouts, passes, runs: rollouts, detail: `${passes}/${rollouts} — ${lastDetail}`, outputTokens };
}

export async function runEval(opts: {
  tasks: EvalTask[];
  baseDir: string;
  run: TaskRunner;
  rollouts?: number;
  isolateRollout?: Isolate;
  onResult?: (r: EvalResult) => void;
}): Promise<EvalReport> {
  const rollouts = Math.max(1, opts.rollouts ?? 1);
  const isolate = opts.isolateRollout ?? identityIsolate;
  const results: EvalResult[] = [];
  for (const task of opts.tasks) {
    const r = await runOne(task, opts.baseDir, opts.run, rollouts, isolate);
    results.push(r);
    opts.onResult?.(r);
  }
  return aggregate(results);
}
