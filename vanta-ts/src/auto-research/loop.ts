import { join } from "node:path";
import type { AgentDeps, AgentOutcome } from "../agent.js";
import { createWorktree, mergeWorktreeBranch, cleanupWorktree } from "../worktree/manager.js";
import { spawnSubagent } from "../subagent/spawn.js";
import { runMetric, type MetricResult } from "./metric.js";
import { commitAll, type CommitResult } from "./vcs.js";
import { appendAutoResearchJournal } from "./journal.js";
import type { AutoResearchIteration, AutoResearchOptions, AutoResearchReport } from "./types.js";

type Worktree = Awaited<ReturnType<typeof createWorktree>>;

export type AutoResearchDeps = {
  metric?: (command: string, cwd: string) => Promise<MetricResult>;
  createWorktree?: (repoRoot: string, prefix: string, baseDir: string) => Promise<Worktree>;
  spawn?: (opts: { instruction: string; deps: AgentDeps }) => Promise<AgentOutcome>;
  commit?: (cwd: string, message: string) => Promise<CommitResult>;
  merge?: (repoRoot: string, branch: string, message: string) => Promise<{ ok: boolean; message: string }>;
  cleanup?: (repoRoot: string, path: string, branch: string) => Promise<void>;
  journal?: (iteration: AutoResearchIteration) => void;
};

function instruction(opts: AutoResearchOptions, baseline: number): string {
  return [
    `Objective: ${opts.objective}`,
    `Metric command: ${opts.metric}`,
    `Current baseline score: ${baseline}`,
    `Bounds: ${opts.bounds}`,
    "",
    "Make the smallest code change that can improve the metric. Verify locally before finishing.",
  ].join("\n");
}

function commitMessage(iter: number): string {
  return `auto-research candidate ${iter}`;
}

async function mergeIfKept(args: {
  kept: boolean; hooks: AutoResearchDeps; repoRoot: string; branch: string;
}): Promise<void> {
  if (!args.kept) return;
  const merged = await (args.hooks.merge ?? mergeWorktreeBranch)(args.repoRoot, args.branch, `merge ${args.branch}`);
  if (!merged.ok) throw new Error(merged.message);
}

async function candidate(args: {
  repoRoot: string; opts: AutoResearchOptions; deps: AgentDeps; hooks: AutoResearchDeps; best: number; iter: number;
}): Promise<AutoResearchIteration> {
  const create = args.hooks.createWorktree ?? createWorktree;
  const handle = await create(args.repoRoot, "auto-research", join(args.repoRoot, ".vanta", "auto-research-worktrees"));
  try {
    const workerDeps = { ...args.deps, root: handle.path };
    const spawn = args.hooks.spawn ?? ((o) => spawnSubagent({ goal: args.opts.objective, instruction: o.instruction, deps: o.deps }));
    await spawn({ instruction: instruction(args.opts, args.best), deps: workerDeps });
    const commit = await (args.hooks.commit ?? commitAll)(handle.path, commitMessage(args.iter));
    const metric = await (args.hooks.metric ?? runMetric)(args.opts.metric, handle.path);
    const delta = metric.score - args.best;
    const kept = Boolean(commit.sha) && delta > 0;
    await mergeIfKept({ kept, hooks: args.hooks, repoRoot: args.repoRoot, branch: handle.branch });
    return {
      iter: args.iter,
      baseline: args.best,
      candidate: metric.score,
      delta,
      kept,
      branch: handle.branch,
      commit: commit.sha ?? undefined,
      note: `${kept ? "kept" : "rejected"} ${args.best}->${metric.score} (${commit.summary})`.slice(0, 200),
    };
  } finally {
    await (args.hooks.cleanup ?? cleanupWorktree)(args.repoRoot, handle.path, handle.branch);
  }
}

export async function runAutoResearch(args: {
  repoRoot: string; opts: AutoResearchOptions; deps: AgentDeps; hooks?: AutoResearchDeps;
}): Promise<AutoResearchReport> {
  const hooks = args.hooks ?? {};
  let best = (await (hooks.metric ?? runMetric)(args.opts.metric, args.repoRoot)).score;
  const baseline = best;
  const iterations: AutoResearchIteration[] = [];
  let noProgress = 0;

  for (let iter = 1; iter <= args.opts.maxIters; iter++) {
    const result = await candidate({ ...args, hooks, best, iter });
    iterations.push(result);
    (hooks.journal ?? ((it) => appendAutoResearchJournal(args.repoRoot, it, new Date().toISOString())))(result);
    if (result.kept) { best = result.candidate; noProgress = 0; }
    else noProgress++;
    if (noProgress >= args.opts.stopAfterNoProgress) {
      return { ...args.opts, baseline, final: best, iterations, stoppedReason: "no-progress" };
    }
  }
  return { ...args.opts, baseline, final: best, iterations, stoppedReason: "max-iters" };
}
