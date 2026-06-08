import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// MODEL-BENCH: personal model scorecard.
// Records latency, cost, and quality notes per model/task type from real runs.
// Feeds AUX-MAP and AUTO-ROUTER with observed data instead of vibes.

export const TASK_KINDS = ["coding", "vision", "summarize", "planning", "tool-use", "chat"] as const;
export type TaskKind = typeof TASK_KINDS[number];

export const BenchResultSchema = z.object({
  model: z.string(),
  provider: z.string(),
  taskKind: z.enum(TASK_KINDS),
  latencyMs: z.number(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  costUsd: z.number().optional(),
  qualityNote: z.string().optional(),
  recordedAt: z.string(),
});
export type BenchResult = z.infer<typeof BenchResultSchema>;

const BenchFileSchema = z.array(BenchResultSchema);

function benchPath(env?: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "model-bench.json");
}

export async function loadBenchResults(env?: NodeJS.ProcessEnv): Promise<BenchResult[]> {
  if (!existsSync(benchPath(env))) return [];
  try { return BenchFileSchema.parse(JSON.parse(await readFile(benchPath(env), "utf8"))); }
  catch { return []; }
}

export async function saveBenchResult(result: BenchResult, env?: NodeJS.ProcessEnv): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  const existing = await loadBenchResults(env);
  existing.push(result);
  await writeFile(benchPath(env), JSON.stringify(existing, null, 2) + "\n", "utf8");
}

/** Format a scorecard from accumulated results. Pure. */
export function formatBenchScorecard(results: BenchResult[]): string {
  if (!results.length) return "  (no benchmark results yet — run: vanta models bench)";

  // Group by model+provider
  const byModel = new Map<string, BenchResult[]>();
  for (const r of results) {
    const key = `${r.provider}/${r.model}`;
    if (!byModel.has(key)) byModel.set(key, []);
    byModel.get(key)!.push(r);
  }

  const lines: string[] = ["Model Scorecard:"];
  for (const [key, runs] of byModel) {
    const avgLatency = Math.round(runs.reduce((s, r) => s + r.latencyMs, 0) / runs.length);
    const avgCost = runs.some((r) => r.costUsd != null)
      ? (runs.reduce((s, r) => s + (r.costUsd ?? 0), 0) / runs.length).toFixed(4)
      : "?";
    const byKind = Object.fromEntries(TASK_KINDS.map((k) => [k, runs.filter((r) => r.taskKind === k).length]));
    const kindSummary = Object.entries(byKind).filter(([, c]) => c > 0).map(([k, c]) => `${k}:${c}`).join(" ");
    lines.push(`  ${key}`);
    lines.push(`    avg latency: ${avgLatency}ms · avg cost: $${avgCost}/turn · ${runs.length} run(s)`);
    if (kindSummary) lines.push(`    tasks: ${kindSummary}`);
  }

  // Routing recommendations
  const recommendations = buildRoutingRecommendations(results);
  if (recommendations.length) {
    lines.push("", "Routing recommendations:");
    for (const rec of recommendations) lines.push(`  ${rec}`);
  }

  return lines.join("\n");
}

/** Build routing recommendations from benchmark data. Pure. */
export function buildRoutingRecommendations(results: BenchResult[]): string[] {
  if (!results.length) return [];
  const recs: string[] = [];

  // Find fastest model per task kind
  for (const kind of TASK_KINDS) {
    const kindResults = results.filter((r) => r.taskKind === kind);
    if (!kindResults.length) continue;
    kindResults.sort((a, b) => a.latencyMs - b.latencyMs);
    const fastest = kindResults[0];
    if (fastest) {
      recs.push(`${kind}: fastest = ${fastest.provider}/${fastest.model} (${fastest.latencyMs}ms)`);
    }
  }
  return recs;
}

/** Quick benchmark: run a prompt against the current provider and record the result. */
export async function quickBench(opts: {
  provider: string;
  model: string;
  taskKind: TaskKind;
  prompt: string;
  run: (prompt: string) => Promise<{ text: string; latencyMs: number; inputTokens?: number; outputTokens?: number; costUsd?: number }>;
  env?: NodeJS.ProcessEnv;
}): Promise<BenchResult> {
  const { provider, model, taskKind, prompt, run, env } = opts;
  const result = await run(prompt);
  const bench: BenchResult = {
    model,
    provider,
    taskKind,
    latencyMs: result.latencyMs,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    qualityNote: result.text.slice(0, 100),
    recordedAt: new Date().toISOString(),
  };
  await saveBenchResult(bench, env);
  return bench;
}
