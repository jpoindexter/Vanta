import { listLearnings, type Learning } from "./store.js";

// LEARNINGS-INDEX (pure scoring). The scoring/flagging functions here are
// deterministic and free of I/O / Date.now — `now` is always injected. They turn
// the stored learnings into what a session needs: the top-N most relevant, a
// staleness flag, and a contradiction flag. Heuristics only (no LLM) — fast
// enough to run at startup. `learningsDigest` (the one async fn) reads the store
// and frames a prompt block for session injection; it is best-effort (→ "").

const DAY_MS = 86_400_000;
const DEFAULT_N = 3;
const DEFAULT_MAX_AGE_DAYS = 90;
// Recency contributes at most this much to a score, so a fresh-but-unrelated
// learning never outranks a strongly-matching older one. Overlap dominates.
const RECENCY_WEIGHT = 0.5;
// Tokens shorter than this are dropped from overlap (de-noises "a"/"to"/"is").
const MIN_TOKEN_LEN = 3;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= MIN_TOKEN_LEN),
  );
}

/** A learning's searchable corpus: its tags (weighted by appearing first) + text. */
function corpusTokens(l: Learning): Set<string> {
  return tokenize(`${l.tags.join(" ")} ${l.text}`);
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

/** Recency score in [0,1]: 1.0 today, decaying linearly to 0 at maxAgeDays. */
function recencyScore(l: Learning, now: number, maxAgeDays: number): number {
  const ageDays = Math.max(0, (now - l.updatedAt) / DAY_MS);
  return Math.max(0, 1 - ageDays / maxAgeDays);
}

export type ScoredLearning = { learning: Learning; score: number };

/** Optional scoring inputs — injected `now` keeps the fns deterministic/testable. */
export type ScoreOpts = { now?: number; maxAgeDays?: number };

/**
 * Top-N learnings most relevant to `ctx` (e.g. the cwd / repo / task string),
 * scored by tag+keyword overlap with a recency tie-breaker. Superseded learnings
 * are excluded. Pure + deterministic (inject `now` via opts).
 *
 * Scoring: overlap count (dominant) + RECENCY_WEIGHT * recency. When no ctx
 * token overlaps anything, ranking falls back to pure recency so a session still
 * surfaces its freshest learnings rather than nothing.
 */
export function relevantLearnings(
  learnings: Learning[],
  ctx: string,
  n: number = DEFAULT_N,
  opts: ScoreOpts = {},
): Learning[] {
  const now = opts.now ?? Date.now();
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const ctxTokens = tokenize(ctx);
  const live = learnings.filter((l) => !l.supersededBy);
  const scored: ScoredLearning[] = live.map((learning) => {
    const overlap = overlapCount(ctxTokens, corpusTokens(learning));
    const recency = recencyScore(learning, now, maxAgeDays);
    return { learning, score: overlap + RECENCY_WEIGHT * recency };
  });
  return scored
    .sort((a, b) => b.score - a.score || b.learning.updatedAt - a.learning.updatedAt)
    .slice(0, Math.max(0, n))
    .map((s) => s.learning);
}

export type StaleFlag = { learning: Learning; ageDays: number };

/**
 * Learnings whose `updatedAt` is older than `maxAgeDays`, flagged with their age
 * (rounded days). Superseded entries are skipped (already retired). Newest-stale
 * first. Pure (inject `now`).
 */
export function flagStale(
  learnings: Learning[],
  now: number = Date.now(),
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS,
): StaleFlag[] {
  const cutoff = maxAgeDays * DAY_MS;
  return learnings
    .filter((l) => !l.supersededBy && now - l.updatedAt > cutoff)
    .map((learning) => ({ learning, ageDays: Math.floor((now - learning.updatedAt) / DAY_MS) }))
    .sort((a, b) => b.learning.updatedAt - a.learning.updatedAt);
}

export type ConflictFlag = { a: Learning; b: Learning };

/** Same tag set (order-insensitive), and neither learning is empty. */
function sameTags(a: Learning, b: Learning): boolean {
  if (a.tags.length === 0 || b.tags.length === 0) return false;
  const sa = new Set(a.tags.map((t) => t.toLowerCase()));
  const sb = new Set(b.tags.map((t) => t.toLowerCase()));
  return sa.size === sb.size && [...sa].every((t) => sb.has(t));
}

/** Two live learnings where neither supersedes the other (an unresolved fork). */
function neitherSupersedes(a: Learning, b: Learning): boolean {
  return a.supersededBy !== b.id && b.supersededBy !== a.id;
}

/**
 * Contradiction heuristic: two NON-superseded learnings that share the same tag
 * set but say different things, where neither has been marked as superseding the
 * other. That's an unresolved fork — surface it so the operator picks a winner
 * (via `supersede`). Pure; stable pairwise order (each pair once, a before b by
 * input order). Identical text under the same tags is treated as a duplicate,
 * not a conflict.
 */
export function findConflicts(learnings: Learning[]): ConflictFlag[] {
  const live = learnings.filter((l) => !l.supersededBy);
  const out: ConflictFlag[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (
        sameTags(a, b) &&
        a.text.trim().toLowerCase() !== b.text.trim().toLowerCase() &&
        neitherSupersedes(a, b)
      ) {
        out.push({ a, b });
      }
    }
  }
  return out;
}

/** One learning as a flagged bullet for the prompt block. Pure. */
function formatLearning(l: Learning, staleIds: Set<string>, conflictIds: Set<string>): string {
  const marks = [
    staleIds.has(l.id) ? "⚠ stale" : "",
    conflictIds.has(l.id) ? "⚠ conflicting" : "",
  ].filter(Boolean);
  const flag = marks.length ? ` (${marks.join("; ")})` : "";
  const tags = l.tags.length ? ` [${l.tags.join(", ")}]` : "";
  return `- ${l.kind}: ${l.text}${tags}${flag}`;
}

/** Options for the session-start block: count + the shared scoring inputs. */
export type BlockOpts = ScoreOpts & { n?: number };

/**
 * Frame the most relevant learnings for injection into the system prompt at
 * session start. Returns the top-`n` relevant learnings (excluding superseded)
 * as a flagged block, marking any that are also stale or part of a conflicting
 * pair so the agent verifies before acting. Pure given its inputs.
 */
export function learningsBlock(learnings: Learning[], ctx: string, opts: BlockOpts = {}): string {
  const now = opts.now ?? Date.now();
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const top = relevantLearnings(learnings, ctx, opts.n ?? DEFAULT_N, { now, maxAgeDays });
  if (!top.length) return "";
  const staleIds = new Set(flagStale(learnings, now, maxAgeDays).map((s) => s.learning.id));
  const conflictIds = new Set(findConflicts(learnings).flatMap((c) => [c.a.id, c.b.id]));
  const body = top.map((l) => formatLearning(l, staleIds, conflictIds)).join("\n");
  return `Project learnings (most relevant; verify before acting):\n${body}`;
}

/**
 * Read the project's learnings index and frame the session-start block. Empty
 * string when there are none (no prompt noise). Best-effort: any failure → "".
 * The session-injection entry point (mirrors playbookDigest / sessionMemoryBlock).
 */
export async function learningsDigest(
  dataDir: string,
  ctx: string,
  now: number = Date.now(),
): Promise<string> {
  try {
    const learnings = await listLearnings(dataDir);
    if (!learnings.length) return "";
    return learningsBlock(learnings, ctx, { now });
  } catch {
    return "";
  }
}
