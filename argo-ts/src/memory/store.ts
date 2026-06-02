import { readFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import {
  memoriesDir,
  ensureArgoStore,
  commitInHome,
} from "../store/home.js";

const DEFAULT_MAX_PER_GOAL = 3;
const BLOCK_DELIM = "## ";

type AppendOptions = { env?: NodeJS.ProcessEnv; now?: string };
type RecentOptions = { env?: NodeJS.ProcessEnv; maxPerGoal?: number };

function memoryFile(goalId: number, env?: NodeJS.ProcessEnv): string {
  return join(memoriesDir(env), `${goalId}.md`);
}

/**
 * Append a timestamped summary block to a goal's memory file, then commit it
 * in the Argo home. `now` is injected for deterministic tests; defaults to the
 * current ISO 8601 timestamp at runtime.
 */
export async function appendMemory(
  goalId: number,
  summary: string,
  opts: AppendOptions = {},
): Promise<void> {
  const env = opts.env;
  await ensureArgoStore(env);
  const now = opts.now ?? new Date().toISOString();
  const block = `${BLOCK_DELIM}${now}\n${summary.trim()}\n\n`;
  await appendFile(memoryFile(goalId, env), block, "utf8");
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
 * Build a compact recent-memory string across goals for prompt injection. Takes
 * the last `maxPerGoal` blocks per goal, skips goals with no memory, and returns
 * "" when nothing is available.
 */
export async function recentMemory(
  goalIds: number[],
  opts: RecentOptions = {},
): Promise<string> {
  const env = opts.env;
  const maxPerGoal = opts.maxPerGoal ?? DEFAULT_MAX_PER_GOAL;
  const sections: string[] = [];

  for (const goalId of goalIds) {
    const content = await readMemory(goalId, env);
    if (!content) continue;
    const blocks = splitBlocks(content);
    if (blocks.length === 0) continue;
    const recent = blocks.slice(-maxPerGoal).join("\n\n");
    sections.push(`Goal ${goalId}:\n${recent}`);
  }

  return sections.join("\n\n");
}
