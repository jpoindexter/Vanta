import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { estimateCostUsd, formatUsd } from "../pricing.js";
import type { BillingMode, ProviderRoute, Usage } from "../providers/interface.js";

const BillingStatusSchema = z.enum(["estimated", "actual", "included", "local", "unknown"]);

const RouteUsageSchema = z.object({
  version: z.literal(1),
  callId: z.string().min(1),
  ts: z.string(),
  sessionId: z.string(),
  agent: z.string(),
  provider: z.string(),
  model: z.string(),
  baseRoute: z.string(),
  billingMode: z.enum(["metered", "included", "local", "unknown"]),
  billingStatus: BillingStatusSchema,
  fallbackDepth: z.number().int().nonnegative(),
  apiCalls: z.number().int().positive(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().nullable(),
});

export type RouteUsageEntry = z.infer<typeof RouteUsageSchema>;

function pathFor(dataDir: string): string {
  return join(dataDir, "route-usage-ledger.jsonl");
}

/** Old sessions simply have no route ledger; duplicate call ids are read once. */
export async function listRouteUsage(dataDir: string): Promise<RouteUsageEntry[]> {
  let raw: string;
  try {
    raw = await readFile(pathFor(dataDir), "utf8");
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const rows: RouteUsageEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = RouteUsageSchema.safeParse(JSON.parse(line));
      if (!parsed.success || seen.has(parsed.data.callId)) continue;
      seen.add(parsed.data.callId);
      rows.push(parsed.data);
    } catch { /* one corrupt row cannot hide later usage */ }
  }
  return rows;
}

function billing(route: ProviderRoute, usage: Usage): Pick<RouteUsageEntry, "billingStatus" | "costUsd"> {
  if (route.billingMode === "local") return { billingStatus: "local", costUsd: 0 };
  if (route.billingMode === "included") return { billingStatus: "included", costUsd: 0 };
  const estimate = estimateCostUsd(route.model, usage.inputTokens, usage.outputTokens);
  if (route.billingMode === "metered" && estimate !== null) return { billingStatus: "estimated", costUsd: estimate };
  return { billingStatus: "unknown", costUsd: estimate };
}

export async function appendRouteUsage(
  dataDir: string,
  input: {
    callId?: string;
    ts?: string;
    sessionId: string;
    agent: string;
    route: ProviderRoute;
    usage?: Usage;
  },
): Promise<RouteUsageEntry> {
  const usage = input.usage ?? { inputTokens: 0, outputTokens: 0 };
  const charge = billing(input.route, usage);
  const row: RouteUsageEntry = {
    version: 1,
    callId: input.callId ?? randomUUID(),
    ts: input.ts ?? new Date().toISOString(),
    sessionId: input.sessionId,
    agent: input.agent,
    provider: input.route.provider,
    model: input.route.model,
    baseRoute: input.route.baseRoute,
    billingMode: input.route.billingMode,
    billingStatus: charge.billingStatus,
    fallbackDepth: input.route.fallbackDepth ?? 0,
    apiCalls: 1,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheTokens: usage.cacheTokens ?? 0,
    reasoningTokens: usage.reasoningTokens ?? 0,
    costUsd: charge.costUsd,
  };
  await mkdir(dataDir, { recursive: true });
  await appendFile(pathFor(dataDir), `${JSON.stringify(row)}\n`, "utf8");
  return row;
}

export async function recordProviderCall(
  dataDir: string,
  input: Parameters<typeof appendRouteUsage>[1],
): Promise<void> {
  try {
    await appendRouteUsage(dataDir, input);
  } catch { /* usage durability is best-effort and never breaks a response */ }
}

export type RouteUsageSummary = {
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  reasoningTokens: number;
  knownCostUsd: number;
  hasUnknownCost: boolean;
  byRoute: Array<{ key: string; apiCalls: number; inputTokens: number; outputTokens: number; costUsd: number; hasUnknownCost: boolean }>;
};

export function summarizeRouteUsage(rows: RouteUsageEntry[]): RouteUsageSummary {
  const byRoute = new Map<string, RouteUsageSummary["byRoute"][number]>();
  const total: RouteUsageSummary = { apiCalls: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0, reasoningTokens: 0, knownCostUsd: 0, hasUnknownCost: false, byRoute: [] };
  for (const row of rows) {
    total.apiCalls += row.apiCalls;
    total.inputTokens += row.inputTokens;
    total.outputTokens += row.outputTokens;
    total.cacheTokens += row.cacheTokens;
    total.reasoningTokens += row.reasoningTokens;
    if (row.costUsd === null) total.hasUnknownCost = true;
    else total.knownCostUsd += row.costUsd;
    const key = `${row.provider}/${row.model} @ ${row.baseRoute} [${row.billingStatus}]${row.fallbackDepth ? ` fallback:${row.fallbackDepth}` : ""}`;
    const current = byRoute.get(key) ?? { key, apiCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, hasUnknownCost: false };
    current.apiCalls += row.apiCalls;
    current.inputTokens += row.inputTokens;
    current.outputTokens += row.outputTokens;
    if (row.costUsd === null) current.hasUnknownCost = true;
    else current.costUsd += row.costUsd;
    byRoute.set(key, current);
  }
  total.byRoute = [...byRoute.values()].sort((a, b) => b.apiCalls - a.apiCalls || a.key.localeCompare(b.key));
  return total;
}

export function formatRouteUsage(summary: RouteUsageSummary): string {
  if (summary.apiCalls === 0) return "No model calls recorded for this window.";
  const cost = `${formatUsd(summary.knownCostUsd)}${summary.hasUnknownCost ? "+~?" : ""}`;
  return [
    `Model calls: ${summary.apiCalls} · ${summary.inputTokens} in / ${summary.outputTokens} out / ${summary.cacheTokens} cached / ${summary.reasoningTokens} reasoning · ${cost}`,
    ...summary.byRoute.map((row) => `  ${row.key}: ${row.apiCalls} call${row.apiCalls === 1 ? "" : "s"} · ${row.inputTokens} in / ${row.outputTokens} out · ${formatUsd(row.costUsd)}${row.hasUnknownCost ? "+~?" : ""}`),
  ].join("\n");
}
