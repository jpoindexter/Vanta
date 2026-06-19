import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadCorpus } from "../eval/corpus.js";
import { buildRunner } from "./eval-cmd.js";
import { runCompressCng } from "../eval/compress-run.js";
import { scopeRunnerToEnv } from "../eval/compress-runner.js";
import { renderCngDoc } from "../eval/compress-doc.js";
import { formatVerdict } from "../eval/compress-cng.js";
import { withFrozen } from "../evolve/snapshot.js";
import { resolveVantaHome } from "../store/home.js";

// `vanta eval compress` — pass-rate CNG. Runs the corpus baseline (all compression
// off) vs each dimension on, on the CONFIGURED provider, computes CNG per dimension,
// and records findings to docs/compression-cng.md. Intentionally capped to a small
// slice (few tasks, one rollout) so the live run finishes in minutes — a directional
// signal, not a marathon. A default is flipped ON only on a clear, sufficient signal.

const DEFAULT_CORPUS = "eval/tasks";
const RUNS_SUBDIR = join(".vanta", "eval-compress-runs");
const DOC_PATH = join("docs", "compression-cng.md");
const DEFAULT_TASK_CAP = 2;

/** Parse `--tasks N` from the trailing args (cap the corpus to a small slice). */
export function parseTaskCap(args: string[], fallback = DEFAULT_TASK_CAP): number {
  const i = args.indexOf("--tasks");
  if (i >= 0) { const n = parseInt(args[i + 1] ?? "", 10); if (Number.isFinite(n) && n > 0) return n; }
  return fallback;
}

/** Rollouts for the CNG run: default 1 (a fast directional probe); VANTA_EVAL_ROLLOUTS overrides. */
export function cngRollouts(env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(1, parseInt(env.VANTA_EVAL_ROLLOUTS ?? "1", 10) || 1);
}

export async function runEvalCompressCommand(repoRoot: string, rest: string[] = []): Promise<void> {
  const corpusDir = join(repoRoot, DEFAULT_CORPUS);
  const all = loadCorpus(corpusDir);
  if (!all.length) { console.error(`vanta eval compress: no tasks found in ${corpusDir}`); process.exit(1); }

  const cap = parseTaskCap(rest);
  const tasks = all.slice(0, cap);
  const rollouts = cngRollouts();
  const provider = process.env.VANTA_PROVIDER ?? "openai";
  const model = process.env.VANTA_MODEL ?? "(default)";
  console.log(`vanta eval compress: ${tasks.length}/${all.length} task(s) × ${rollouts} rollout(s) · provider ${provider} (${model})\n`);

  const brainDir = join(resolveVantaHome(process.env), "brain");
  const runForEnv = scopeRunnerToEnv(buildRunner(repoRoot));
  const report = await runCompressCng({
    tasks,
    baseDir: join(repoRoot, RUNS_SUBDIR),
    runForEnv,
    rollouts,
    isolateRollout: (fn) => withFrozen(brainDir, fn),
    onPhase: (label) => console.log(`  running ${label}…`),
  });

  console.log("");
  for (const d of report.dimensions) console.log(`  ${formatVerdict(d)}`);
  console.log("\nflip decisions:");
  for (const f of report.flips) console.log(`  ${f.flip ? "FLIP ON" : "keep"} — ${f.name}: ${f.reason}`);

  const doc = renderCngDoc({ report, provider, model, now: new Date().toISOString() });
  mkdirSync(join(repoRoot, "docs"), { recursive: true });
  writeFileSync(join(repoRoot, DOC_PATH), doc, "utf8");
  console.log(`\nfindings → ${DOC_PATH}`);
}
