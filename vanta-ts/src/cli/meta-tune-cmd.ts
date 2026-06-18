import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { loadCorpus } from "../eval/corpus.js";
import { runEval } from "../eval/run.js";
import { buildRunner, evalRollouts } from "./eval-cmd.js";
import { withFrozen } from "../evolve/snapshot.js";
import { resolveVantaHome } from "../store/home.js";
import { runMetaTuneInstructions, type MetaTuneDeps } from "../meta-tune/loop.js";
import { formatMetaTuneRecord } from "../meta-tune/format.js";
import { MetaTuneOptionsSchema } from "../meta-tune/types.js";

type Deps = {
  log?: (line: string) => void;
  tuneDeps?: MetaTuneDeps;
};

function usage(log: (line: string) => void): number {
  log("Usage: vanta meta-tune instructions [--iters N] [--corpus dir] [--adopt]");
  return 1;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function withProgramOverride<T>(program: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.VANTA_PROGRAM_OVERRIDE;
  process.env.VANTA_PROGRAM_OVERRIDE = program;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.VANTA_PROGRAM_OVERRIDE;
    else process.env.VANTA_PROGRAM_OVERRIDE = prev;
  });
}

async function buildTuneDeps(repoRoot: string, corpus: string): Promise<MetaTuneDeps> {
  const tasks = loadCorpus(join(repoRoot, corpus));
  if (!tasks.length) throw new Error(`no eval tasks found in ${corpus}`);
  const run = buildRunner(repoRoot);
  const brainDir = join(resolveVantaHome(process.env), "brain");
  return {
    evalProgram: (program) => withProgramOverride(program, () => runEval({
      tasks,
      baseDir: join(repoRoot, ".vanta", "meta-tune-runs"),
      run,
      rollouts: evalRollouts(),
      isolateRollout: (fn) => withFrozen(brainDir, fn),
    })),
  };
}

async function approval(summary: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Adopt best PROGRAM.md variant?\n${summary}\nApprove? (y/n) `);
    return answer.trim().toLowerCase().startsWith("y");
  } finally {
    rl.close();
  }
}

export async function runMetaTuneCommand(repoRoot: string, rest: string[], deps: Deps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  if (rest[0] !== "instructions") return usage(log);
  const opts = MetaTuneOptionsSchema.parse({
    iters: Number(flag(rest, "--iters") ?? "3"),
    corpus: flag(rest, "--corpus") ?? "eval/tasks",
    blockPath: "PROGRAM.md",
    adopt: rest.includes("--adopt"),
  });
  const tuneDeps = deps.tuneDeps ?? await buildTuneDeps(repoRoot, opts.corpus);
  const record = await runMetaTuneInstructions({
    repoRoot,
    opts,
    deps: { ...tuneDeps, approve: tuneDeps.approve ?? approval },
  });
  log(formatMetaTuneRecord(record));
  return 0;
}
