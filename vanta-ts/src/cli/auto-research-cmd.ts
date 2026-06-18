import { createInterface } from "node:readline/promises";
import { buildSummarizer, prepareRun, approver } from "../session.js";
import type { AgentDeps } from "../agent.js";
import { runAutoResearch, type AutoResearchDeps } from "../auto-research/loop.js";
import { formatAutoResearchReport } from "../auto-research/format.js";
import { AutoResearchOptionsSchema, type AutoResearchOptions } from "../auto-research/types.js";

export type AutoResearchCommandDeps = {
  log?: (line: string) => void;
  prepare?: (repoRoot: string, instruction: string) => Promise<Awaited<ReturnType<typeof prepareRun>>>;
  hooks?: AutoResearchDeps;
};

function usage(log: (line: string) => void): number {
  log("Usage: vanta auto-research --objective <text> --metric <command> --bounds <text> [--iters N] [--stop-after-no-progress N]");
  return 1;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export function parseAutoResearchArgs(args: string[]): AutoResearchOptions {
  const raw = {
    objective: flag(args, "--objective"),
    metric: flag(args, "--metric"),
    bounds: flag(args, "--bounds"),
    maxIters: Number(flag(args, "--iters") ?? "3"),
    stopAfterNoProgress: Number(flag(args, "--stop-after-no-progress") ?? "1"),
  };
  return AutoResearchOptionsSchema.parse(raw);
}

async function buildDeps(repoRoot: string, opts: AutoResearchOptions, deps: AutoResearchCommandDeps): Promise<{ deps: AgentDeps; close: () => void }> {
  const setup = await (deps.prepare ?? prepareRun)(repoRoot, `auto-research: ${opts.objective}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    close: () => rl.close(),
    deps: {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root: repoRoot,
      requestApproval: approver(rl),
      maxIterations: Number(process.env.VANTA_AUTO_RESEARCH_AGENT_ITERS) || 30,
      summarize: buildSummarizer(setup.provider),
      getEffortLevel: () => setup.effortLevel,
      advisorProvider: setup.advisorProvider,
    },
  };
}

export async function runAutoResearchCommand(repoRoot: string, rest: string[], deps: AutoResearchCommandDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  let opts: AutoResearchOptions;
  try {
    opts = parseAutoResearchArgs(rest);
  } catch (err) {
    log(err instanceof Error ? err.message : String(err));
    return usage(log);
  }
  const built = await buildDeps(repoRoot, opts, deps);
  try {
    const report = await runAutoResearch({ repoRoot, opts, deps: built.deps, hooks: deps.hooks });
    log(formatAutoResearchReport(report));
    return 0;
  } finally {
    built.close();
  }
}
