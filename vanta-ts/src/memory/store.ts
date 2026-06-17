import { resolveMemoryStore } from "../store/memory-store.js";
import { scanForSecrets } from "../store/secret-scan.js";
import { annotateMemory } from "./freshness.js";

/** Home-relative path for a goal's memory file. */
const memoryPath = (goalId: number): string => `memories/${goalId}.md`;

const DEFAULT_MAX_PER_GOAL = 3;
// Upper bound on stored blocks per goal. Far above the injection cap — older
// blocks are pruned from the live file but remain in git history (capped, not
// lost). Override with VANTA_MEMORY_MAX_BLOCKS.
const DEFAULT_MAX_STORED_BLOCKS = 50;
const BLOCK_DELIM = "## ";

type AppendOptions = { env?: NodeJS.ProcessEnv; now?: string };
type RecentOptions = { env?: NodeJS.ProcessEnv; maxPerGoal?: number; now?: number };

/**
 * Append a timestamped summary block to a goal's memory file, then commit it
 * in the Vanta home. `now` is injected for deterministic tests; defaults to the
 * current ISO 8601 timestamp at runtime. Goes through the MemoryStore port.
 */
export async function appendMemory(
  goalId: number,
  summary: string,
  opts: AppendOptions = {},
): Promise<{ skipped: boolean; rules: string[] }> {
  const env = opts.env;
  // Secret scanner: never persist (or sync to the ~/.vanta git store) memory
  // content that contains a credential. Returns the matched rule ids for diagnosis.
  const rules = scanForSecrets(summary);
  if (rules.length > 0) return { skipped: true, rules };
  const store = resolveMemoryStore(env);
  await store.ensure();
  const now = opts.now ?? new Date().toISOString();
  const path = memoryPath(goalId);
  const block = `${BLOCK_DELIM}${now}\n${summary.trim()}\n\n`;
  await store.append(path, block);
  // Bound the stored file (capped memory): keep the most recent
  // blocks; older ones are pruned from the live file but preserved in git below.
  const cap = Number(env?.VANTA_MEMORY_MAX_BLOCKS) || DEFAULT_MAX_STORED_BLOCKS;
  const blocks = splitBlocks((await store.read(path)) ?? "");
  if (blocks.length > cap) {
    await store.write(path, `${blocks.slice(-cap).join("\n\n")}\n\n`);
  }
  await store.commit(path, `memory: goal ${goalId}`);
  return { skipped: false, rules: [] };
}

/** Read a goal's full memory file, or null if it has none yet. */
export async function readMemory(
  goalId: number,
  env?: NodeJS.ProcessEnv,
): Promise<string | null> {
  return resolveMemoryStore(env).read(memoryPath(goalId));
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

/** Memory freshness: prepend a staleness caveat to a block older than ~1 day. */
function annotateBlock(block: string, now: number): string {
  const header = (block.split("\n", 1)[0] ?? "").slice(BLOCK_DELIM.length).trim();
  const ts = Date.parse(header);
  if (Number.isNaN(ts)) return block; // unparseable timestamp — best-effort, never throw
  return annotateMemory(block, now - ts);
}

/**
 * Build a compact recent-memory string across goals for prompt injection. Takes
 * the last `maxPerGoal` blocks per goal, skips goals with no memory, and returns
 * "" when nothing is available. Stale blocks get a freshness caveat.
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
    const recent = blocks.slice(-maxPerGoal).map((b) => annotateBlock(b, now)).join("\n\n");
    sections.push(`Goal ${goalId}:\n${recent}`);
  }

  return sections.join("\n\n");
}
