import { readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { memoriesDir, ensureVantaStore } from "../store/home.js";
import { classifyMemory } from "./relevance.js";

export type MemoryCurationResult = {
  total: number;
  kept: number;
  archived: number;
  skipped: number;
};

const BLOCK_DELIM = "## ";

/**
 * Split raw memory file content into `## ...`-delimited blocks (store.ts format).
 * Leading content before the first block is dropped. Each block keeps its header.
 */
function splitBlocks(content: string): string[] {
  const parts = content.split(new RegExp(`(?=^${BLOCK_DELIM})`, "m"));
  return parts
    .map((p) => p.trim())
    .filter((p) => p.startsWith(BLOCK_DELIM));
}

/** Strip the `## <timestamp>` header line from a block, returning only the body. */
function blockBody(block: string): string {
  const nl = block.indexOf("\n");
  return nl === -1 ? "" : block.slice(nl + 1).trim();
}

/**
 * Apply the MEM-RELEVANCE gate to an existing memory file for `goalId`.
 *
 * - Reads `<memoriesDir>/<goalId>.md` (string ID, not necessarily numeric).
 * - Splits into `## <timestamp>`-delimited blocks.
 * - Classifies each block's body via `classifyMemory`.
 * - Empty-body blocks are counted as skipped; kept in the main file unchanged.
 * - Non-durable blocks are appended to `<goalId>.archived.md` (non-destructive).
 * - Durable + skipped blocks are rewritten into the main file (order preserved).
 * - Returns a summary. If the memory file is missing, returns all zeros.
 */
export async function curateMemory(
  goalId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MemoryCurationResult> {
  await ensureVantaStore(env);
  const dir = memoriesDir(env);
  const mainFile = join(dir, `${goalId}.md`);
  const archiveFile = join(dir, `${goalId}.archived.md`);

  let raw: string;
  try {
    raw = await readFile(mainFile, "utf8");
  } catch {
    return { total: 0, kept: 0, archived: 0, skipped: 0 };
  }

  const blocks = splitBlocks(raw);
  const total = blocks.length;

  const keptBlocks: string[] = [];
  const archivedBlocks: string[] = [];
  let skipped = 0;

  for (const block of blocks) {
    const body = blockBody(block);
    if (!body) {
      // Empty body — can't meaningfully classify; keep it unchanged.
      skipped++;
      keptBlocks.push(block);
      continue;
    }
    const result = classifyMemory(body);
    if (result.durable) {
      keptBlocks.push(block);
    } else {
      archivedBlocks.push(block);
    }
  }

  // Crash-safe write order: archive first, then rewrite main.
  if (archivedBlocks.length > 0) {
    const archiveContent = archivedBlocks.join("\n\n") + "\n\n";
    await appendFile(archiveFile, archiveContent, "utf8");
  }

  // Rewrite main file with durable + skipped blocks (order preserved).
  if (keptBlocks.length > 0) {
    await writeFile(mainFile, keptBlocks.join("\n\n") + "\n\n", "utf8");
  } else if (archivedBlocks.length > 0) {
    // All blocks were archived — truncate main to empty (the data is in archive).
    await writeFile(mainFile, "", "utf8");
  }

  const kept = keptBlocks.length - skipped;
  return { total, kept, archived: archivedBlocks.length, skipped };
}
