import { z } from "zod";
import { mkdir, readFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

// PCLIP-COST-ATTRIBUTION — a durable, appendable record of every priced turn so
// spend can be broken down after the fact by goal/agent/provider/model. `pricing.ts`
// stays the in-memory per-session view (unchanged); this is the persisted history
// behind it. Tolerant reads (a corrupt line is dropped, never breaks a later
// summary), matching the budget/store.ts + cli-dx/config-revisions.ts style.

const SpendEntrySchema = z.object({
  ts: z.string(),
  /** Numeric goal id (from the active kernel goal), or absent when no goal is active. */
  goal: z.union([z.string(), z.number()]).optional(),
  /** Which run surface incurred the cost: "interactive" (REPL/TUI) | "gateway" (cron/gateway) | future surfaces. */
  agent: z.string(),
  provider: z.string(),
  model: z.string(),
  costUsd: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export type SpendEntry = z.infer<typeof SpendEntrySchema>;

function ledgerPath(dataDir: string): string {
  return join(dataDir, "spend-ledger.jsonl");
}

/** All recorded spend entries, oldest first. Corrupt/malformed lines are dropped. */
export async function listSpend(dataDir: string): Promise<SpendEntry[]> {
  let raw: string;
  try {
    raw = await readFile(ledgerPath(dataDir), "utf8");
  } catch {
    return [];
  }
  const out: SpendEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = SpendEntrySchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch {
      /* one corrupt line must not lose the rest of the ledger */
    }
  }
  return out;
}

/** Append one priced-turn entry. Zero-cost entries (unpriced model, local
 *  provider) are the caller's decision to skip — this always appends what it's given. */
export async function appendSpend(
  dataDir: string,
  entry: Omit<SpendEntry, "ts"> & { ts?: string },
  now: Date = new Date(),
): Promise<SpendEntry> {
  const full: SpendEntry = { ...entry, ts: entry.ts ?? now.toISOString() };
  await mkdir(dataDir, { recursive: true });
  await appendFile(ledgerPath(dataDir), `${JSON.stringify(full)}\n`, "utf8");
  return full;
}

/**
 * The one-line call site helper: record a priced turn if (and only if) it has a
 * real positive cost — mirrors the `if (cost && cost > 0)` gate the budget
 * enforcer already uses (unpriced models / local providers cost null|0, nothing
 * to attribute). Best-effort: a ledger-write failure never breaks the turn.
 */
export async function recordTurnSpend(
  dataDir: string,
  opts: { costUsd: number | null; provider: string; model: string; inputTokens: number; outputTokens: number; agent: string; goal?: string | number },
): Promise<void> {
  if (!opts.costUsd || opts.costUsd <= 0) return;
  try {
    await appendSpend(dataDir, {
      goal: opts.goal,
      agent: opts.agent,
      provider: opts.provider,
      model: opts.model,
      costUsd: opts.costUsd,
      inputTokens: opts.inputTokens,
      outputTokens: opts.outputTokens,
    });
  } catch {
    /* best-effort — a ledger write must never break the turn */
  }
}
