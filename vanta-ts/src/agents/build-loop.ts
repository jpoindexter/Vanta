// VANTA-A2A-BUILD-LOOP — the cofounder loop: delegate a build to another agent, VERIFY the
// result, and re-delegate a targeted fix if it fails — up to maxIters — instead of one shot
// and hope. Pure orchestration: delegate + verify are injected, so it's fully unit-tested
// (the tool wires delegate=call_agent(coding) and verify=expected-files/command).

export type BuildAttempt = { ok: boolean; output: string };
export type VerifyResult = { ok: boolean; detail: string };

export type BuildLoopDeps = {
  delegate: (instruction: string) => Promise<BuildAttempt>;
  verify: () => Promise<VerifyResult>;
  maxIters?: number;
  onStep?: (msg: string) => void;
};

export type BuildLoopResult = { ok: boolean; iterations: number; log: string[] };

/** Re-delegation prompt that carries the concrete failure back to the builder. */
function fixPrompt(task: string, problem: string): string {
  return `Continue this task: "${task}". It is NOT done yet — ${problem.slice(0, 400)}. Fix that and finish.`;
}

/** Run delegate → verify → (fix → verify)… until verify passes or maxIters is hit. */
export async function runBuildLoop(task: string, deps: BuildLoopDeps): Promise<BuildLoopResult> {
  const max = Math.max(1, deps.maxIters ?? 3);
  const log: string[] = [];
  let instruction = task;
  for (let i = 1; i <= max; i++) {
    deps.onStep?.(`build attempt ${i}/${max}`);
    const built = await deps.delegate(instruction);
    log.push(`attempt ${i}: ${built.output.slice(0, 100).replace(/\s+/g, " ").trim()}`);
    if (!built.ok) {
      instruction = fixPrompt(task, `the agent reported a failure: ${built.output}`);
      continue;
    }
    const v = await deps.verify();
    log.push(`verify ${i}: ${v.ok ? "PASS" : `FAIL — ${v.detail.slice(0, 150)}`}`);
    if (v.ok) return { ok: true, iterations: i, log };
    instruction = fixPrompt(task, v.detail);
  }
  return { ok: false, iterations: max, log };
}
