import { join } from "node:path";
import { loadCorpus } from "../eval/corpus.js";
import { runEval } from "../eval/run.js";
import { buildRunner } from "./eval-cmd.js";
import { evolve, type Proposal } from "../evolve/loop.js";
import { snapshotDir } from "../evolve/snapshot.js";
import { appendJournal } from "../evolve/journal.js";
import { resolveVantaHome } from "../store/home.js";
import type { EvalReport } from "../eval/types.js";

// `vanta evolve [iters]` — the self-improving loop (AHE Phase 2), built on the
// factory's safety model. Each iteration: snapshot the brain → an agent turn
// edits the brain (memory compartment, L5) to fix the failing eval tasks →
// re-run `vanta eval` → keep on score lift, rollback on drop → journal it.

const DEFAULT_CORPUS = "eval/tasks";
const RUNS_SUBDIR = join(".vanta", "eval-runs");
const JOURNAL = join(".vanta", "evolve-journal.jsonl");
const PROPOSE_MAX_ITER = 20;

/** One evolve edit: an agent turn that writes durable guidance into the brain. */
async function proposeEdit(repoRoot: string, current: EvalReport): Promise<Proposal> {
  const { createConversation } = await import("../agent.js");
  const { prepareRun, buildSummarizer } = await import("../session.js");
  const failing = current.results.filter((r) => !r.pass).map((r) => `- ${r.id}: ${r.detail}`).join("\n");
  const instruction = [
    "You are improving Vanta's OWN harness through its long-term memory (the `brain` tool).",
    "These benchmark tasks are currently FAILING when you attempt them:",
    failing || "(none — try to make the harness more robust)",
    "",
    "Use the `brain` tool to record durable, GENERAL guidance that would help future attempts succeed",
    "(e.g. how to reliably create/edit files, count lines, fix broken code, verify your own work).",
    "Keep it concise and transferable — operator discipline, not task-specific answers.",
    "End with a one-line summary of what guidance you added.",
  ].join("\n");
  const setup = await prepareRun(repoRoot, instruction);
  const convo = createConversation(setup.systemPrompt, {
    provider: setup.provider,
    safety: setup.safety,
    registry: setup.registry,
    root: repoRoot,
    requestApproval: async () => true, // self-edit of the brain (outside repo scope) is intentional
    maxIterations: PROPOSE_MAX_ITER,
    summarize: buildSummarizer(setup.provider),
  });
  const outcome = await convo.send(instruction);
  return { predictedFix: [], summary: (outcome.finalText.split("\n").pop() ?? "").slice(0, 120) };
}

export async function runEvolveCommand(repoRoot: string, rest: string[] = []): Promise<void> {
  const iters = Math.max(1, parseInt(rest[0] ?? "3", 10));
  const tasks = loadCorpus(join(repoRoot, DEFAULT_CORPUS));
  if (!tasks.length) {
    console.error(`vanta evolve: no eval tasks in ${join(repoRoot, DEFAULT_CORPUS)} — add a corpus first (vanta eval)`);
    process.exit(1);
  }
  const baseDir = join(repoRoot, RUNS_SUBDIR);
  const run = buildRunner(repoRoot);
  const brainDir = join(resolveVantaHome(process.env), "brain");
  const journal = join(repoRoot, JOURNAL);
  console.log(`vanta evolve: ${iters} iteration(s) over ${tasks.length} task(s) · target = brain (${brainDir})\n`);
  const out = await evolve(iters, {
    evalOnce: () => runEval({ tasks, baseDir, run }),
    propose: (cur) => proposeEdit(repoRoot, cur),
    snapshot: () => snapshotDir(brainDir),
    onIteration: (it) => {
      const reg = it.regressions.length ? ` [regressions: ${it.regressions.join(", ")}]` : "";
      console.log(`  iter ${it.iter}: ${it.note}${reg}`);
      appendJournal(journal, it, new Date().toISOString());
    },
  });
  const kept = out.iterations.filter((i) => i.kept).length;
  console.log(`\nbaseline ${out.baselineScore}% → final ${out.finalScore}%  (${kept}/${iters} edits kept)`);
  console.log(`journal → ${JOURNAL}`);
}
