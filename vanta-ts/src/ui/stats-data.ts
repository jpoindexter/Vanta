import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { listSessions, type SessionMeta } from "../sessions/store.js";
import { estimateCostUsd } from "../pricing.js";

// Aggregate usage stats for the /stats overlay: total sessions / turns / tool
// calls, the most-used tools, and a rough token+cost estimate. Distinct from the
// per-turn cost footer — this is account-wide history.
//
// Two sources, both best-effort:
//  - listSessions(): session count + turn count (one row per saved session).
//  - .vanta/events.jsonl: the kernel event log. Tool calls land as `name: output`
//    lines; `session_config` lines carry provider/model/promptChars, which give
//    a coarse token+cost estimate (model from the table in pricing.ts).
//
// aggregateStats is PURE (takes sessions + raw event lines) so it's unit-testable
// with fixtures; gatherStats does the live FS reads, then delegates.

export type ToolCount = { name: string; count: number };

export type UsageStats = {
  sessions: number;
  turns: number;
  toolCalls: number;
  /** Most-used tools, highest first. */
  topTools: ToolCount[];
  /** Coarse token estimate (sum of logged session prompt sizes). */
  tokens: number;
  /** Coarse cost estimate in USD, or null when no priced model was seen. */
  costUsd: number | null;
};

export const EMPTY_STATS: UsageStats = {
  sessions: 0,
  turns: 0,
  toolCalls: 0,
  topTools: [],
  tokens: 0,
  costUsd: null,
};

const TOP_TOOLS_LIMIT = 8;
/** ~4 chars per token — the same coarse ratio used elsewhere for budgeting. */
const CHARS_PER_TOKEN = 4;

type EventLine = { kind?: string; event?: string; model?: string; promptChars?: number };

/** A tool-call event line is `name: output`; pull the tool name (else null). */
function toolNameFromEvent(event: string | undefined): string | null {
  if (!event) return null;
  const idx = event.indexOf(": ");
  if (idx <= 0) return null;
  const name = event.slice(0, idx);
  // Tool names are bare identifiers (snake_case); reject prose prefixes.
  return /^[a-z][a-z0-9_]*$/.test(name) ? name : null;
}

/** Rank tool names by frequency, highest first, capped. */
function rankTools(counts: Map<string, number>): ToolCount[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, TOP_TOOLS_LIMIT);
}

/** Fold one `session_config` line into the running token+cost estimate. */
function foldConfigCost(line: EventLine, acc: { tokens: number; cost: number; priced: boolean }): void {
  const chars = line.promptChars ?? 0;
  if (chars <= 0) return;
  const tokens = Math.round(chars / CHARS_PER_TOKEN);
  acc.tokens += tokens;
  const usd = line.model ? estimateCostUsd(line.model, tokens, 0) : null;
  if (usd !== null) {
    acc.cost += usd;
    acc.priced = true;
  }
}

/**
 * Aggregate usage stats from already-loaded sessions + raw event-log lines.
 * Pure: malformed JSON lines are skipped, never thrown on.
 */
export function aggregateStats(sessions: SessionMeta[], eventLines: string[]): UsageStats {
  const toolCounts = new Map<string, number>();
  const costAcc = { tokens: 0, cost: 0, priced: false };
  let toolCalls = 0;
  for (const raw of eventLines) {
    if (!raw) continue;
    let line: EventLine;
    try {
      line = JSON.parse(raw) as EventLine;
    } catch {
      continue;
    }
    if (line.kind === "session_config") {
      foldConfigCost(line, costAcc);
      continue;
    }
    const tool = toolNameFromEvent(line.event);
    if (tool) {
      toolCalls++;
      toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
    }
  }
  return {
    sessions: sessions.length,
    turns: sessions.reduce((sum, s) => sum + s.turns, 0),
    toolCalls,
    topTools: rankTools(toolCounts),
    tokens: costAcc.tokens,
    costUsd: costAcc.priced ? costAcc.cost : null,
  };
}

/** Read the kernel event log into raw lines (best-effort; missing → []). */
async function readEventLines(dataDir: string): Promise<string[]> {
  try {
    const raw = await readFile(join(dataDir, "events.jsonl"), "utf8");
    return raw.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Gather live usage stats for the /stats overlay. Never throws. */
export async function gatherStats(deps: { repoRoot: string; env?: NodeJS.ProcessEnv }): Promise<UsageStats> {
  const dataDir = join(deps.repoRoot, ".vanta");
  const [sessions, lines] = await Promise.all([
    listSessions(deps.env).catch(() => []),
    readEventLines(dataDir),
  ]);
  return aggregateStats(sessions, lines);
}
