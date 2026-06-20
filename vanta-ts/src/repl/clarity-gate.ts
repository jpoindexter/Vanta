// CLARITY-GATE — before acting on a user instruction, score its CLARITY
// (specificity / scope / actionability). Below a threshold the gate ENCOURAGES
// the existing `clarify` tool instead of guessing on an ambiguous task; above,
// it no-ops. Pure, best-effort, non-blocking — same heuristic-bank shape as
// complexity-gate / self-monitor / mode-detect (zero I/O, zero LLM). It does NOT
// hard-block: it surfaces a one-line suggestion, the turn proceeds.

export const DEFAULT_CLARITY_THRESHOLD = 0.34;

// A short / single-word command has nothing to clarify *against* — gate it out
// so trivial directives ("ls", "go", "/help") never trip a clarify suggestion.
const MIN_WORDS_TO_SCORE = 3;

// Specificity signals — concrete nouns/anchors that pin the instruction down:
// a file, a symbol, a path, an @-ref, a number, a quoted string, a code token.
const SPECIFICITY = [
  /[\w-]+\.(ts|tsx|js|jsx|rs|md|json|py|go|html|css|toml|yml|yaml)\b/i, // a filename
  /@[\w./-]+/, // an @-ref
  /\b[\w-]+\/[\w./-]+/, // a path-ish token (src/foo/bar)
  /`[^`]+`|"[^"]+"|'[^']+'/, // a quoted / code-fenced token
  /\b\d+\b/, // a concrete number
  /\b[a-z]+[A-Z][a-zA-Z]*\b/, // a camelCase identifier
  /\b[A-Z]{2,}[-_][A-Z0-9-]+\b/, // a SCREAMING-CASE id (card ids, env vars)
] as const;

// Actionability signals — a concrete verb naming WHAT to do.
const ACTIONABILITY =
  /\b(add|build|implement|create|write|fix|update|remove|delete|rename|move|refactor|run|test|read|show|list|find|search|open|set|change|wire|export|import|parse|format|replace|append|check|score)\b/i;

// Vagueness signals — hedges and gestures that signal an under-specified ask.
const VAGUENESS =
  /\b(something|somehow|stuff|things?|whatever|some ?way|figure out|deal with|handle (it|this|that)|sort (it|this|that) out|make it (better|work|nice|good)|clean ?up|improve|tidy|fix (it|this|that|things)|do the thing|you know|etc\.?|and so on)\b/i;

// A bare gesture with no object — "do it", "go", "make it work" — and nothing else.
const BARE_GESTURE = /^\s*(do it|go|just do it|make it (so|work|better|nice|good)|fix it|sort it out|handle it|continue|proceed|yes|ok(ay)?)\s*[.!?]*\s*$/i;

function wordCount(instruction: string): number {
  return instruction.trim().split(/\s+/).filter(Boolean).length;
}

/** Count distinct specificity-pattern hits (each pattern counts once). Pure. */
function specificityHits(instruction: string): number {
  return SPECIFICITY.reduce((n, re) => n + (re.test(instruction) ? 1 : 0), 0);
}

/**
 * Score an instruction's CLARITY in 0..1 over specificity + actionability + scope,
 * penalized by vagueness. Higher = clearer. Pure, synchronous, deterministic.
 * A vague one-liner ("fix the thing somehow") scores low; a specific instruction
 * ("add a zod schema to src/tools/clarify.ts") scores high.
 */
export function scoreClarity(instruction: string): number {
  const text = instruction.trim();
  if (text === "") return 0;
  if (BARE_GESTURE.test(text)) return 0;
  if (wordCount(text) < MIN_WORDS_TO_SCORE) return 1; // too short to be ambiguous against

  let score = 0.2; // a base for any multi-word directive
  if (ACTIONABILITY.test(text)) score += 0.3; // names a concrete action
  score += Math.min(specificityHits(text), 3) * 0.18; // concrete anchors, capped
  if (wordCount(text) >= 8) score += 0.1; // enough detail to constrain scope
  if (VAGUENESS.test(text)) score -= 0.35; // hedges drag it down

  return Math.max(0, Math.min(score, 1));
}

/**
 * True when the score is below the threshold — the gate should encourage clarify.
 * Non-blocking: a true verdict surfaces a suggestion, it never halts the turn.
 * Pure.
 */
export function shouldClarify(score: number, threshold = DEFAULT_CLARITY_THRESHOLD): boolean {
  return threshold > 0 && score < threshold;
}

/**
 * Resolve the clarity threshold from the environment. `VANTA_CLARITY_THRESHOLD`
 * overrides; 0 disables the gate; an invalid / unset value falls back to the
 * conservative default (only genuinely-ambiguous instructions trip it). Pure.
 */
export function resolveClarityThreshold(env: NodeJS.ProcessEnv): number {
  const raw = parseFloat(env.VANTA_CLARITY_THRESHOLD ?? "");
  if (isNaN(raw) || raw < 0) return DEFAULT_CLARITY_THRESHOLD;
  return raw;
}

/** One-line suggestion encouraging the `clarify` tool. Mirrors buildComplexityNote. Pure. */
export function buildClarityNote(instruction: string): string {
  const score = scoreClarity(instruction);
  const pct = Math.round(score * 100);
  return (
    `⚠ Ambiguous instruction (clarity ${pct}%) — ask 1-3 targeted clarifying ` +
    `questions (use the \`clarify\` tool) before picking a tool, rather than guessing.`
  );
}
