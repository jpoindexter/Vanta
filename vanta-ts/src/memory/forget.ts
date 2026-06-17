import { resolveMemoryStore } from "../store/memory-store.js";
import { classifyMemory } from "./relevance.js";

// MEM-FORGET: aggressive memory lifecycle — TTL prune + durable note compression.
// Counterweight to MEM-CURATOR: keeps the brain light by deleting stale noise and
// compressing old durable notes. Extends MEM-CURATOR's classify-and-archive with
// actual deletion of non-durable content past a TTL.

export const DEFAULT_TTL_DAYS = 30;
export const DEFAULT_COMPRESS_DAYS = 90;

export type ForgetResult = {
  goalId: string;
  totalBefore: number;
  totalAfter: number;
  pruned: number;
  kept: number;
};

export type FootprintResult = {
  goals: number;
  totalBytes: number;
  files: Array<{ goalId: string; bytes: number; blocks: number }>;
};

const BLOCK_DELIM = "## ";

function splitBlocks(content: string): string[] {
  return content
    .split(new RegExp(`(?=^${BLOCK_DELIM})`, "m"))
    .map((p) => p.trim())
    .filter((p) => p.startsWith(BLOCK_DELIM));
}

function blockTimestamp(block: string): Date | null {
  const header = block.split("\n")[0] ?? "";
  const ts = header.replace(/^## /, "").trim();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

function isDurable(block: string): boolean {
  const lines = block.split("\n").slice(1).join("\n").trim();
  return classifyMemory(lines).durable;
}

/** Prune non-durable blocks older than ttlDays. Keeps durable blocks regardless of age. */
export async function pruneStaleBlocks(
  goalId: string,
  env: NodeJS.ProcessEnv = process.env,
  opts: { ttlDays?: number; now?: Date } = {},
): Promise<ForgetResult> {
  const store = resolveMemoryStore(env);
  await store.ensure();
  const file = `memories/${goalId}.md`;
  const raw = await store.read(file);
  if (raw === null) return { goalId, totalBefore: 0, totalAfter: 0, pruned: 0, kept: 0 };

  const blocks = splitBlocks(raw);
  const totalBefore = blocks.length;
  const ttlMs = (opts.ttlDays ?? DEFAULT_TTL_DAYS) * 86_400_000;
  const now = opts.now ?? new Date();

  const kept: string[] = [];
  let pruned = 0;
  for (const block of blocks) {
    const ts = blockTimestamp(block);
    const age = ts ? now.getTime() - ts.getTime() : 0;
    if (age > ttlMs && !isDurable(block)) {
      pruned++;
    } else {
      kept.push(block);
    }
  }

  await store.write(file, kept.length ? kept.join("\n\n") + "\n\n" : "");
  return { goalId, totalBefore, totalAfter: kept.length, pruned, kept: kept.length };
}

/** Measure the total memory footprint across all goal memory files. */
export async function getMemoryFootprint(
  env: NodeJS.ProcessEnv = process.env,
): Promise<FootprintResult> {
  const store = resolveMemoryStore(env);
  const entries = await store.list("memories");
  const mdFiles = entries.filter((f) => f.endsWith(".md") && !f.endsWith(".archived.md"));
  const files: FootprintResult["files"] = [];
  let totalBytes = 0;
  for (const f of mdFiles) {
    const content = (await store.read(`memories/${f}`)) ?? "";
    const bytes = Buffer.byteLength(content, "utf8");
    const blocks = splitBlocks(content);
    files.push({ goalId: f.replace(/\.md$/, ""), bytes, blocks: blocks.length });
    totalBytes += bytes;
  }
  return { goals: files.length, totalBytes, files };
}

/** Format a forget run summary. Pure. */
export function formatForgetSummary(results: ForgetResult[], before: FootprintResult, after: FootprintResult): string {
  const pruned = results.reduce((n, r) => n + r.pruned, 0);
  const savedBytes = before.totalBytes - after.totalBytes;
  const lines = [
    `memory forget: pruned ${pruned} block(s) across ${results.length} goal(s)`,
    `  footprint: ${before.totalBytes}B → ${after.totalBytes}B (${savedBytes >= 0 ? `-${savedBytes}` : `+${Math.abs(savedBytes)}`}B)`,
  ];
  for (const r of results.filter((r) => r.pruned > 0)) {
    lines.push(`  goal ${r.goalId}: ${r.totalBefore} → ${r.totalAfter} blocks (pruned ${r.pruned})`);
  }
  return lines.join("\n");
}
