import { dirname, join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { listSessions, loadSession, type Session } from "../sessions/store.js";
import { exportTrajectoryBatch, trainTrajectorySft, type TrajectoryExport } from "../training/export.js";
import type { RunLoraTrainOutcome } from "../meta-tune/lora-train.js";

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function integerFlag(args: string[], flag: string, fallback: number, min: number, max: number): number | null {
  const raw = flagValue(args, flag);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function stamp(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

export type TrajectoryCommandDeps = {
  log?: (line: string) => void;
  sessions?: () => Promise<Session[]>;
  exportBatch?: (sessions: readonly Session[], outDir: string, limit: number, toolsOnly: boolean) => Promise<TrajectoryExport>;
  train?: (path: string, opts: { outputDir?: string; baseModel?: string; steps?: number; maxLength?: number }) => Promise<RunLoraTrainOutcome>;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
};

async function loadAllSessions(env: NodeJS.ProcessEnv): Promise<Session[]> {
  const metas = await listSessions(env);
  return (await Promise.all(metas.map((meta) => loadSession(meta.id, env)))).filter((session): session is Session => Boolean(session));
}

function reportTrain(outcome: RunLoraTrainOutcome, log: (line: string) => void): number {
  if (!outcome.ok) { log(`✗ ${outcome.reason}`); return 1; }
  if (!outcome.result.ok) { log(`✗ training failed: ${outcome.result.error}`); return 1; }
  const result = outcome.result;
  log(`✓ trajectory LoRA trained on ${result.device}: ${result.examples} examples · ${result.trainableLoraParams} trainable params · adapter ${result.adapterDir}`);
  return result.adapterSaved ? 0 : 1;
}

export async function runTrajectoryCommand(rest: string[], deps: TrajectoryCommandDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const env = deps.env ?? process.env;
  const [sub = "export", ...args] = rest;
  if (sub === "export") {
    const limit = integerFlag(args, "--limit", 100, 1, 10_000);
    if (limit === null) { log("trajectory --limit must be an integer from 1 to 10000"); return 1; }
    const outDir = flagValue(args, "--out") ?? join(resolveVantaHome(env), "training", `trajectories-${stamp(deps.now?.())}`);
    const sessions = await (deps.sessions ?? (() => loadAllSessions(env)))();
    const toolsOnly = args.includes("--tools-only");
    const result = await (deps.exportBatch ?? exportTrajectoryBatch)(sessions, outDir, limit, toolsOnly);
    if (!result.batch.stats.examples) { log("✗ no complete user/assistant turns found to export"); return 1; }
    const stats = result.batch.stats;
    log(`✓ exported ${stats.examples} trajectories from ${stats.sessions} sessions → ${result.outDir}`);
    log(`  tools: ${stats.toolCalls} calls / ${stats.toolResults} results · compressed ${stats.compressedResults} · ${stats.tokensBefore}→${stats.tokensAfter} tool-result tokens`);
    log(`  LoRA SFT: ${result.loraPath}`);
    return 0;
  }
  if (sub === "train") {
    const path = args[0];
    if (!path || path.startsWith("--")) { log("usage: vanta trajectory train <lora-sft.jsonl> [--base-model <id>] [--steps N] [--out <dir>]"); return 1; }
    const steps = integerFlag(args, "--steps", 4, 1, 10_000);
    if (steps === null) { log("trajectory --steps must be an integer from 1 to 10000"); return 1; }
    const maxLength = integerFlag(args, "--max-length", 2_048, 128, 32_768);
    if (maxLength === null) { log("trajectory --max-length must be an integer from 128 to 32768"); return 1; }
    const outputDir = flagValue(args, "--out") ?? join(dirname(path), "adapter");
    const outcome = await (deps.train ?? trainTrajectorySft)(path, { outputDir, baseModel: flagValue(args, "--base-model"), steps, maxLength });
    return reportTrain(outcome, log);
  }
  log("usage: vanta trajectory export [--tools-only] [--limit N] [--out <dir>] | trajectory train <lora-sft.jsonl> [--base-model <id>] [--steps N] [--out <dir>]");
  return 1;
}
