import { runCheck } from "./verifier.js";
import { makeSandbox } from "./sandbox.js";
import type { EvalTask, EvalResult, EvalReport } from "./types.js";

// Orchestrate the corpus: per task → sandbox → run the agent → deterministic
// grade → result; aggregate to pass@1. The agent runner is INJECTED so the loop
// stays pure/testable (real impl wires prepareRun+runAgent; tests stub it).

/** Run one task's agent turn inside `root`; returns usage. */
export type TaskRunner = (instruction: string, root: string) => Promise<{ iterations?: number; outputTokens?: number }>;

/** Pure: roll per-task results into a report (pass@1 = passed/total %). */
export function aggregate(results: EvalResult[]): EvalReport {
  const passed = results.filter((r) => r.pass).length;
  const outputTokens = results.reduce((n, r) => n + (r.outputTokens ?? 0), 0);
  const passAt1 = results.length ? Math.round((passed / results.length) * 1000) / 10 : 0;
  return { total: results.length, passed, passAt1, outputTokens, results };
}

/** Pure: the one-line score summary (per-task lines stream live during the run). */
export function formatReport(r: EvalReport): string {
  return `pass@1: ${r.passAt1}%  (${r.passed}/${r.total})   output tokens: ${r.outputTokens.toLocaleString()}`;
}

async function runOne(task: EvalTask, baseDir: string, run: TaskRunner): Promise<EvalResult> {
  const sb = makeSandbox(baseDir, task.seed);
  try {
    const usage = await run(`${task.instruction}\n\nWork only inside this directory: ${sb.root}`, sb.root);
    const check = runCheck(task.check, sb.root);
    return { id: task.id, pass: check.pass, detail: check.detail, iterations: usage.iterations, outputTokens: usage.outputTokens };
  } catch (e) {
    return { id: task.id, pass: false, detail: `run error: ${(e as Error).message.split("\n")[0]}` };
  } finally {
    sb.cleanup();
  }
}

export async function runEval(opts: {
  tasks: EvalTask[];
  baseDir: string;
  run: TaskRunner;
  onResult?: (r: EvalResult) => void;
}): Promise<EvalReport> {
  const results: EvalResult[] = [];
  for (const task of opts.tasks) {
    const r = await runOne(task, opts.baseDir, opts.run);
    results.push(r);
    opts.onResult?.(r);
  }
  return aggregate(results);
}
