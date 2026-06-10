import { readFile, appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  memoriesDir,
  ensureVantaStore,
  commitInHome,
} from "../store/home.js";
import { annotateMemory } from "./freshness.js";

const DEFAULT_MAX_PER_GOAL = 3;
// Upper bound on stored blocks per goal. Far above the injection cap — older
// blocks are pruned from the live file but remain in git history (capped, not
// lost). Override with VANTA_MEMORY_MAX_BLOCKS.
const DEFAULT_MAX_STORED_BLOCKS = 50;
const BLOCK_DELIM = "## ";

type AppendOptions = { env?: NodeJS.ProcessEnv; now?: string };
type RecentOptions = {
  env?: NodeJS.ProcessEnv;
  maxPerGoal?: number;
  /** Reference time (ms) for staleness annotation. Defaults to Date.now(). */
  now?: number;
};

function memoryFile(goalId: number, env?: NodeJS.ProcessEnv): string {
  return join(memoriesDir(env), `${goalId}.md`);
}

/**
 * Append a timestamped summary block to a goal's memory file, then commit it
 * in the Vanta home. `now` is injected for deterministic tests; defaults to the
 * current ISO 8601 timestamp at runtime.
 */
export async function appendMemory(
  goalId: number,
  summary: string,
  opts: AppendOptions = {},
): Promise<void> {
  const env = opts.env;
  await ensureVantaStore(env);
  const now = opts.now ?? new Date().toISOString();
  const file = memoryFile(goalId, env);
  const block = `${BLOCK_DELIM}${now}\n${summary.trim()}\n\n`;
  await appendFile(file, block, "utf8");
  // Bound the stored file (capped memory): keep the most recent
  // blocks; older ones are pruned from the live file but preserved in git below.
  const cap = Number(env?.VANTA_MEMORY_MAX_BLOCKS) || DEFAULT_MAX_STORED_BLOCKS;
  const blocks = splitBlocks(await readFile(file, "utf8").catch(() => ""));
  if (blocks.length > cap) {
    await writeFile(file, `${blocks.slice(-cap).join("\n\n")}\n\n`, "utf8");
  }
  await commitInHome(join("memories", `${goalId}.md`), `memory: goal ${goalId}`, env);
}

/** Read a goal's full memory file, or null if it has none yet. */
export async function readMemory(
  goalId: number,
  env?: NodeJS.ProcessEnv,
): Promise<string | null> {
  try {
    return await readFile(memoryFile(goalId, env), "utf8");
  } catch {
    return null;
  }
}

/**
 * Split a memory file into its `## ...` blocks, preserving the leading delimiter
 * on each. Leading content before the first block (there should be none) is
 * dropped.
 */
function splitBlocks(content: string): string[] {
  const parts = content.split(new RegExp(`(?=^${BLOCK_DELIM})`, "m"));
  return parts
    .map((p) => p.trim())
    .filter((p) => p.startsWith(BLOCK_DELIM));
}

/**
 * Annotate a single `## <ISO>\n...` block with a staleness caveat when it is
 * older than the fresh window. Best-effort: an unparseable timestamp yields the
 * block unchanged (never throws). `now` is the reference time in ms.
 */
function annotateBlock(block: string, now: number): string {
  const header = (block.split("\n", 1)[0] ?? "").slice(BLOCK_DELIM.length).trim();
  const ts = Date.parse(header);
  if (Number.isNaN(ts)) return block;
  return annotateMemory(block, now - ts);
}

/**
 * Build a compact recent-memory string across goals for prompt injection. Takes
 * the last `maxPerGoal` blocks per goal, skips goals with no memory, and returns
 * "" when nothing is available. Stale blocks (older than today/yesterday) are
 * prefixed with a freshness caveat so the agent re-verifies before trusting
 * point-in-time observations.
 */
export async function recentMemory(
  goalIds: number[],
  opts: RecentOptions = {},
): Promise<string> {
  const env = opts.env;
  const maxPerGoal = opts.maxPerGoal ?? DEFAULT_MAX_PER_GOAL;
  const now = opts.now ?? Date.now();
  const sections: string[] = [];

  for (const goalId of goalIds) {
    const content = await readMemory(goalId, env);
    if (!content) continue;
    const blocks = splitBlocks(content);
    if (blocks.length === 0) continue;
    const recent = blocks
      .slice(-maxPerGoal)
      .map((b) => annotateBlock(b, now))
      .join("\n\n");
    sections.push(`Goal ${goalId}:\n${recent}`);
  }

  return sections.join("\n\n");
}
