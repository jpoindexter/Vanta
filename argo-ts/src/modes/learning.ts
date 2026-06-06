import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveVantaHome, ensureVantaStore } from "../store/home.js";

/** Recurrences before we suggest encoding a pattern as a skill. */
const DEFAULT_THRESHOLD = 3;
/** Cap on words kept in a pattern key so similar instructions collide. */
const MAX_PATTERN_WORDS = 8;
const USAGE_FILE = "usage.tsv";

/**
 * Filler words dropped from a pattern key. Stripping these is what lets two
 * phrasings of the same task ("please refactor the auth module" vs "refactor
 * auth module") share a normalized key.
 */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for",
  "with", "at", "by", "from", "as", "is", "are", "be", "this", "that",
  "please", "now", "then", "just", "go", "can", "you", "i", "we", "it",
  "my", "me", "do", "make", "let", "lets", "want", "need", "could",
  "would", "should", "will", "shall", "into", "up", "out",
]);

function usagePath(env?: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), USAGE_FILE);
}

/**
 * Reduce an instruction to a stable key so similar instructions cluster:
 * lowercase, punctuation→spaces, drop filler words, keep the first
 * ~8 significant words. Pure. An all-filler input yields "".
 */
export function normalizePattern(instruction: string): string {
  return instruction
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w))
    .slice(0, MAX_PATTERN_WORDS)
    .join(" ");
}

/** Parse usage.tsv defensively into a pattern→count map. Bad lines are skipped. */
function parseUsage(raw: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of raw.split("\n")) {
    if (line.length === 0) continue;
    const tab = line.indexOf("\t");
    if (tab <= 0) continue; // no tab, or empty pattern
    const pattern = line.slice(0, tab);
    const count = Number.parseInt(line.slice(tab + 1), 10);
    if (!Number.isFinite(count) || count <= 0) continue;
    counts.set(pattern, count);
  }
  return counts;
}

/** Read+parse usage.tsv, returning an empty map if absent or unreadable. */
async function loadUsage(env?: NodeJS.ProcessEnv): Promise<Map<string, number>> {
  try {
    return parseUsage(await readFile(usagePath(env), "utf8"));
  } catch {
    // missing or unreadable — start fresh, never throw across the surface
    return new Map();
  }
}

function serializeUsage(counts: Map<string, number>): string {
  const lines: string[] = [];
  for (const [pattern, count] of counts) lines.push(`${pattern}\t${count}`);
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

/**
 * Record one run of an instruction, incrementing its pattern count in
 * usage.tsv. Returns the pattern + its new count. The count reflects the
 * in-memory increment even if persistence fails (best-effort I/O).
 */
export async function recordRun(
  instruction: string,
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<{ pattern: string; count: number }> {
  const env = opts.env;
  const pattern = normalizePattern(instruction);
  await ensureVantaStore(env);

  const counts = await loadUsage(env);
  const count = (counts.get(pattern) ?? 0) + 1;
  counts.set(pattern, count);

  try {
    await writeFile(usagePath(env), serializeUsage(counts), "utf8");
  } catch {
    // best-effort persistence — still report the increment we computed
  }

  return { pattern, count };
}

/**
 * If the instruction's pattern has recurred at least `threshold` times
 * (default 3), return a proposal to encode it as a skill; else null.
 * Read-only — does not increment.
 */
export async function shouldProposeSkill(
  instruction: string,
  opts: { env?: NodeJS.ProcessEnv; threshold?: number } = {},
): Promise<string | null> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const pattern = normalizePattern(instruction);
  const counts = await loadUsage(opts.env);
  const count = counts.get(pattern) ?? 0;

  if (count < threshold) return null;
  return (
    `You've run a task like "${pattern}" ${count} times. ` +
    "Consider: argo skill ... or write_skill to capture it."
  );
}
