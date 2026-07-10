import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Session } from "../sessions/store.js";
import { runLoraTrain, type RunLoraTrainOutcome } from "../meta-tune/lora-train.js";
import { buildTrajectoryBatch, type TrajectoryBatch } from "./trajectory.js";

export type TrajectoryExport = { outDir: string; trajectoriesPath: string; loraPath: string; manifestPath: string; batch: TrajectoryBatch };

async function privateWrite(path: string, content: string): Promise<void> {
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function exportTrajectoryBatch(sessions: readonly Session[], outDir: string, limit = 100, toolsOnly = false): Promise<TrajectoryExport> {
  const batch = buildTrajectoryBatch(sessions, limit, toolsOnly);
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  const trajectoriesPath = join(outDir, "trajectories.jsonl");
  const loraPath = join(outDir, "lora-sft.jsonl");
  const manifestPath = join(outDir, "manifest.json");
  await privateWrite(trajectoriesPath, batch.examples.map((example) => JSON.stringify(example)).join("\n") + (batch.examples.length ? "\n" : ""));
  await privateWrite(loraPath, batch.sft.map((example) => JSON.stringify(example)).join("\n") + (batch.sft.length ? "\n" : ""));
  await privateWrite(manifestPath, `${JSON.stringify({ schema: "vanta.trajectory-batch.v1", createdAt: new Date().toISOString(), ...batch.stats }, null, 2)}\n`);
  return { outDir, trajectoriesPath, loraPath, manifestPath, batch };
}

const SftRowSchema = z.object({ prompt: z.string().min(1), chosen: z.string().min(1), rejected: z.string().optional() }).passthrough();

export type TrajectoryTrainRow = { prompt: string; chosen: string; rejected: "" };

export async function readTrajectorySft(path: string): Promise<TrajectoryTrainRow[]> {
  const rows: TrajectoryTrainRow[] = [];
  for (const line of (await readFile(path, "utf8")).split("\n").filter(Boolean)) {
    const parsed = SftRowSchema.parse(JSON.parse(line));
    rows.push({ prompt: parsed.prompt, chosen: parsed.chosen, rejected: "" });
  }
  return rows;
}

async function privatizeTree(dir: string): Promise<void> {
  await chmod(dir, 0o700);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await privatizeTree(path);
    else if (entry.isFile()) await chmod(path, 0o600);
  }
}

export async function trainTrajectorySft(path: string, opts: { outputDir?: string; baseModel?: string; steps?: number; maxLength?: number; train?: typeof runLoraTrain } = {}): Promise<RunLoraTrainOutcome> {
  const rows = await readTrajectorySft(path);
  const outcome = (opts.train ?? runLoraTrain)({
    pairs: rows.map((row) => ({ prompt: row.prompt, chosen: row.chosen, rejected: "" })),
    minPairs: 1,
    outputDir: opts.outputDir,
    baseModel: opts.baseModel,
    steps: opts.steps,
    maxLength: opts.maxLength,
  });
  if (outcome.ok && outcome.result.ok && opts.outputDir) await privatizeTree(opts.outputDir);
  return outcome;
}
