import { resolveMemoryStore } from "../store/memory-store.js";
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
type ClassifiedBlocks = { keptBlocks: string[]; archivedBlocks: string[]; skipped: number };

function classifyBlocks(blocks: string[]): ClassifiedBlocks {
  const keptBlocks: string[] = [];
  const archivedBlocks: string[] = [];
  let skipped = 0;
  for (const block of blocks) {
    const body = blockBody(block);
    if (!body) { skipped++; keptBlocks.push(block); continue; }
    if (classifyMemory(body).durable) keptBlocks.push(block);
    else archivedBlocks.push(block);
  }
  return { keptBlocks, archivedBlocks, skipped };
}

type PersistArgs = {
  store: ReturnType<typeof resolveMemoryStore>;
  mainFile: string;
  archiveFile: string;
  kept: string[];
  archived: string[];
};

async function persistCuration({ store, mainFile, archiveFile, kept, archived }: PersistArgs): Promise<void> {
  if (archived.length > 0) await store.append(archiveFile, archived.join("\n\n") + "\n\n");
  if (kept.length > 0) await store.write(mainFile, kept.join("\n\n") + "\n\n");
  else if (archived.length > 0) await store.write(mainFile, "");
}

export async function curateMemory(
  goalId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MemoryCurationResult> {
  const store = resolveMemoryStore(env);
  await store.ensure();
  const mainFile = `memories/${goalId}.md`;
  const archiveFile = `memories/${goalId}.archived.md`;
  const raw = await store.read(mainFile);
  if (raw === null) return { total: 0, kept: 0, archived: 0, skipped: 0 };
  const blocks = splitBlocks(raw);
  const { keptBlocks, archivedBlocks, skipped } = classifyBlocks(blocks);
  await persistCuration({ store, mainFile, archiveFile, kept: keptBlocks, archived: archivedBlocks });
  return { total: blocks.length, kept: keptBlocks.length - skipped, archived: archivedBlocks.length, skipped };
}
