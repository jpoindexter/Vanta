import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadCorpus } from "../eval/corpus.js";
import { runEval, formatReport, type TaskRunner } from "../eval/run.js";

// `vanta eval` — run the task corpus through the real agent in isolated sandboxes
// and report a pass@1 baseline. This is the reward signal the self-improving loop
// (factory) optimizes toward. Sandboxes live under .vanta/ (kernel scope); the
// agent's file tools are rooted there while the kernel binary stays the repo's.

const DEFAULT_CORPUS = "eval/tasks";
const RUNS_SUBDIR = join(".vanta", "eval-runs");
const BASELINE = join(".vanta", "eval-baseline.json");
const MAX_ITER = 40;

/** Real runner: kernel at repoRoot (binary + scope), tools rooted in the sandbox. */
function buildRunner(repoRoot: string): TaskRunner {
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

export async function runEvalCommand(repoRoot: string, rest: string[] = []): Promise<void> {
  const corpusDir = join(repoRoot, rest[0] ?? DEFAULT_CORPUS);
  const tasks = loadCorpus(corpusDir);
  if (!tasks.length) {
    console.error(`vanta eval: no tasks found in ${corpusDir} (add *.json tasks or pass a dir)`);
    process.exit(1);
  }
  console.log(`vanta eval: ${tasks.length} task(s) from ${corpusDir}\n`);
  const report = await runEval({
    tasks,
    baseDir: join(repoRoot, RUNS_SUBDIR),
    run: buildRunner(repoRoot),
    onResult: (r) => console.log(`  ${r.pass ? "✓" : "✗"} ${r.id} — ${r.detail}`),
  });
  console.log(`\n${formatReport(report)}`);
  mkdirSync(join(repoRoot, ".vanta"), { recursive: true });
  writeFileSync(join(repoRoot, BASELINE), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`baseline → ${BASELINE}`);
}
