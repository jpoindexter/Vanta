import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadCorpus } from "../eval/corpus.js";
import { runEval, formatReport, type TaskRunner } from "../eval/run.js";
import { withFrozen } from "../evolve/snapshot.js";
import { resolveVantaHome } from "../store/home.js";

// `vanta eval` — run the task corpus through the real agent in isolated sandboxes
// and report a pass@1 baseline. This is the reward signal the self-improving loop
// (factory) optimizes toward. Sandboxes live under .vanta/ (kernel scope); the
// agent's file tools are rooted there while the kernel binary stays the repo's.

const DEFAULT_CORPUS = "eval/tasks";
const RUNS_SUBDIR = join(".vanta", "eval-runs");
const BASELINE = join(".vanta", "eval-baseline.json");
const MAX_ITER = 40;
/** k≥2 rollouts/task stabilizes the noisy single-rollout signal (override: VANTA_EVAL_ROLLOUTS). */
export const evalRollouts = (env: NodeJS.ProcessEnv = process.env): number => Math.max(1, parseInt(env.VANTA_EVAL_ROLLOUTS ?? "2", 10) || 2);

/** Real runner: kernel at repoRoot (binary + scope), tools rooted in the sandbox.
 * Exported so the evolve loop reuses the exact same eval path. */
export function buildRunner(repoRoot: string): TaskRunner {
  return async (instruction, sandboxRoot) => {
    const { createConversation } = await import("../agent.js");
    const { prepareRun, buildSummarizer } = await import("../session.js");
    const setup = await prepareRun(repoRoot, instruction);
    const convo = createConversation(setup.systemPrompt, {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root: sandboxRoot,
      requestApproval: async () => true, // eval is non-interactive; kernel Block floor still applies
      maxIterations: MAX_ITER,
      summarize: buildSummarizer(setup.provider),
    });
    const outcome = await convo.send(instruction);
    return { iterations: outcome.iterations, outputTokens: outcome.usage?.outputTokens };
  };
}

/** `vanta eval mem` — memory-recall evals over the fixture or public datasets. */
async function runMemEvalCommand(repoRoot: string, rest: string[]): Promise<void> {
  if (rest[1] === "formation") {
    const { runFormationEval } = await import("../mem-eval/formation.js");
    const { formatFormationReport, recordFormationReport } = await import("../mem-eval/formation-report.js");
    const dataDir = rest[2] ?? join(repoRoot, ".vanta", "mem-eval-public-data");
    const publicCaseLimit = Math.max(1, Number(process.env.VANTA_MEM_FORMATION_PUBLIC_CASES) || 50);
    console.log(`vanta eval mem formation: comparing ADD-only vs crystallization; public data dir ${dataDir}; public cases ≤${publicCaseLimit}\n`);
    const report = runFormationEval({ dataDir, publicCaseLimit });
    console.log(formatFormationReport(report));
    const path = recordFormationReport(repoRoot, report);
    console.log(`\ndecision → ${path}`);
    return;
  }
  if (rest[1] === "public") {
    const { runPublicMemEval } = await import("../mem-eval/public-run.js");
    const { formatPublicMemReport, recordPublicMemReport } = await import("../mem-eval/public-report.js");
    const dataDir = rest[2] ?? join(repoRoot, ".vanta", "mem-eval-public-data");
    console.log(`vanta eval mem public: scoring public datasets in ${dataDir}\n`);
    const report = await runPublicMemEval({ dataDir });
    console.log(formatPublicMemReport(report));
    const path = recordPublicMemReport(repoRoot, report);
    console.log(`\nresults → ${path}`);
    return;
  }
  const { runMemEval } = await import("../mem-eval/run.js");
  const { formatMemReport, recordMemReport } = await import("../mem-eval/report.js");
  console.log("vanta eval mem: scoring lexical / semantic / hybrid over the fixture corpus…\n");
  const report = await runMemEval();
  console.log(formatMemReport(report));
  const path = recordMemReport(repoRoot, report);
  console.log(`\nbaseline → ${path}`);
}

export async function runEvalCommand(repoRoot: string, rest: string[] = []): Promise<void> {
  if (rest[0] === "mem") return runMemEvalCommand(repoRoot, rest);
  if (rest[0] === "compress") {
    const { runEvalCompressCommand } = await import("./eval-compress-cmd.js");
    return runEvalCompressCommand(repoRoot, rest);
  }
  if (rest[0] === "ccr") {
    const { runEvalCcrCommand } = await import("./eval-ccr-cmd.js");
    return runEvalCcrCommand(repoRoot);
  }
  const corpusDir = join(repoRoot, rest[0] ?? DEFAULT_CORPUS);
  const tasks = loadCorpus(corpusDir);
  if (!tasks.length) {
    console.error(`vanta eval: no tasks found in ${corpusDir} (add *.json tasks or pass a dir)`);
    process.exit(1);
  }
  const rollouts = evalRollouts();
  console.log(`vanta eval: ${tasks.length} task(s) × ${rollouts} rollout(s) from ${corpusDir}\n`);
  // Freeze the brain around EACH rollout so the task agent's own "keep learning"
  // writes can't drift the harness mid-eval (controllability — reproducible score).
  const brainDir = join(resolveVantaHome(process.env), "brain");
  const report = await runEval({
    tasks,
    baseDir: join(repoRoot, RUNS_SUBDIR),
    run: buildRunner(repoRoot),
    rollouts,
    isolateRollout: (fn) => withFrozen(brainDir, fn),
    onResult: (r) => console.log(`  ${r.pass ? "✓" : r.passes > 0 ? "~" : "✗"} ${r.id} — ${r.detail}`),
  });
  console.log(`\n${formatReport(report)}`);
  mkdirSync(join(repoRoot, ".vanta"), { recursive: true });
  writeFileSync(join(repoRoot, BASELINE), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`baseline → ${BASELINE}`);
}
