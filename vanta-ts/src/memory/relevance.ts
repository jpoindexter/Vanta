// MEM-RELEVANCE: classify what deserves durable memory vs ephemeral noise.
// Pure heuristics — no LLM call, no I/O. Fast enough to gate every write.
// Callers: appendMemory, brain tool write path, and any future memory ingest.

export type MemoryClass =
  | "durable-preference"    // a user preference, style, or constraint
  | "durable-constraint"    // a hard rule the agent must follow
  | "durable-fact"          // a stable external fact
  | "recurring-workflow"    // a repeated process the user does
  | "correction"            // user corrected the agent — preserve the lesson
  | "project-state"         // current status of ongoing work (stale-quickly)
  | "ephemeral-detail"      // task-local, won't matter next session
  | "noise"                 // chitchat, filler, no future value
  | "sensitive";            // private data that should not be stored

export type ClassifyResult = {
  class: MemoryClass;
  durable: boolean; // true = write to long-term memory; false = skip or session-only
  reason: string;
};

// Signal lists — pattern-matched against lowercased text.
const SENSITIVE_PATTERNS = [
  /\bpassword\b/, /\bsecret\b/, /\bapi.?key\b/, /\btoken\b/,
  /\bcredit.?card\b/, /\bssn\b/, /\bsocial.?security\b/, /\bbirthday\b/,
  /\bprivate.?key\b/, /\b-----begin\b/,
];

const NOISE_PATTERNS = [
  /^(ok|okay|yes|no|sure|thanks|thank you|got it|cool|great|np|lol)\b/,
  /^(can you|could you|please|just)\b.{0,20}$/,
];

const CORRECTION_PATTERNS = [
  /\b(wrong|incorrect|mistake|error|no,|actually|that's not|don't do that|stop doing)\b/,
  /\b(you should|you shouldn't|always|never|instead)\b/,
  /\b(fix that|remember to|make sure|don't forget)\b/,
];

const PREFERENCE_PATTERNS = [
  /\b(i (like|prefer|want|hate|love|dislike)|my (style|preference|default))\b/,
  /\b(always use|never use|use .+ not|stick to|keep using)\b/,
  /\b(for me|in my projects?|in my workflow)\b/,
];

const CONSTRAINT_PATTERNS = [
  /\b(must|must not|cannot|should always|should never|required|forbidden|rule:)\b/,
  /\b(never push|never commit|never delete|never send|always approval)\b/,
];

const WORKFLOW_PATTERNS = [
  /\b(every time|each time|whenever|workflow|process|routine|checklist|script)\b/,
  /\b(before (deploy|push|commit|merge)|after (review|test|build))\b/,
  /\b(my (process|flow|routine|habit|pattern))\b/,
];

const FACT_PATTERNS = [
  /\b(my (name|company|project|stack|repo|org)|i (am|work|live|use|run))\b/,
  /\b(the (project|repo|stack|codebase) (is|uses|runs))\b/,
];

const PROJECT_STATE_PATTERNS = [
  /\b(in progress|wip|blocked on|almost done|shipped|waiting for|next step is)\b/,
  /\b(current(ly)? (building|working on|fixing|implementing))\b/,
];

function match(text: string, patterns: RegExp[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => p.test(lower));
}

/**
 * Classify a candidate memory string. Pure — safe to call anywhere.
 * Returns `durable: false` for noise, ephemeral, and sensitive to
 * signal that callers should skip the write (or store session-only).
 */
// Ordered priority table: first match wins. Checked before the length guards.
type PatternRule = { patterns: RegExp[]; result: () => ClassifyResult };

const PATTERN_RULES: PatternRule[] = [
  { patterns: SENSITIVE_PATTERNS, result: () => ({ class: "sensitive", durable: false, reason: "contains sensitive data — do not store" }) },
  { patterns: CONSTRAINT_PATTERNS, result: () => ({ class: "durable-constraint", durable: true, reason: "hard rule the agent must follow" }) },
  { patterns: CORRECTION_PATTERNS, result: () => ({ class: "correction", durable: true, reason: "user correction — preserve the lesson" }) },
  { patterns: NOISE_PATTERNS, result: () => ({ class: "noise", durable: false, reason: "conversational filler with no future value" }) },
  { patterns: PREFERENCE_PATTERNS, result: () => ({ class: "durable-preference", durable: true, reason: "user preference or style" }) },
  { patterns: WORKFLOW_PATTERNS, result: () => ({ class: "recurring-workflow", durable: true, reason: "repeating workflow worth encoding" }) },
  { patterns: FACT_PATTERNS, result: () => ({ class: "durable-fact", durable: true, reason: "stable identity or project fact" }) },
  { patterns: PROJECT_STATE_PATTERNS, result: () => ({ class: "project-state", durable: false, reason: "project state that stales quickly — session-only" }) },
];

export function classifyMemory(text: string): ClassifyResult {
  const t = text.trim();
  if (!t || t.length < 8) return { class: "noise", durable: false, reason: "too short to be meaningful" };
  for (const { patterns, result } of PATTERN_RULES) {
    if (match(t, patterns)) return result();
  }
  if (t.length > 80 || t.includes("\n")) {
    return { class: "ephemeral-detail", durable: false, reason: "task-local detail, unlikely to matter next session" };
  }
  return { class: "noise", durable: false, reason: "no durable signal detected" };
}

/**
 * Gate: should this text be written to long-term (durable) memory?
 * Use at every appendMemory / brain-write call site.
 */
export function shouldStoreDurably(text: string): boolean {
  return classifyMemory(text).durable;
}

// ---------------------------------------------------------------------------
// VANTA-MEM-RELEVANCE-LLM: per-turn memory-file SELECTION via a cheap-model
// side-query. This is the auxiliary-task pattern (mirrors routing/vision.ts)
// applied to memory loading: instead of injecting ALL memory files every turn,
// a cheap model picks the subset relevant to the current turn. Off by default
// (opt-in VANTA_MEM_RELEVANCE=1) so the current "load all/recent" behavior is
// preserved; a disabled flag / a failed call / an empty result all fall back to
// the caller's fallback list. Pure prompt + parse + injected select — no real
// LLM in tests; errors-as-values, never throws.

/** A memory file, identified by name with an optional one-line summary. */
export type MemoryFile = { name: string; summary?: string };

/**
 * The injected cheap-model aux call: takes the side-query prompt, returns the
 * model's raw text. Injected so tests never touch a real LLM; production wires
 * a cheap provider's `complete(...).text` (VANTA_MODEL_CHEAP) here.
 */
export type RelevanceComplete = (prompt: string) => Promise<string>;

/** Dependencies for {@link selectRelevantMemories}. */
export type RelevanceDeps = {
  /** Cheap-model side-query call. */
  complete: RelevanceComplete;
  /** Names to return when disabled, the call fails, or it selects nothing. */
  fallback: string[];
};

/** Cap on file lines listed in the side-query — keeps the prompt cheap. */
const MAX_FILES_IN_PROMPT = 100;

/**
 * Pure: build the cheap-model side-query asking which memory files are relevant
 * to the current turn. Lists each file's name (+ summary when present) and the
 * turn text, and instructs the model to return a JSON array of the relevant
 * names only. References both the turn and the file names so the model can match.
 */
export function buildRelevancePrompt(
  turnText: string,
  files: MemoryFile[],
): string {
  const list = files
    .slice(0, MAX_FILES_IN_PROMPT)
    .map((f) => (f.summary ? `- ${f.name}: ${f.summary}` : `- ${f.name}`))
    .join("\n");
  return [
    "Select which memory files are relevant to the current turn.",
    "",
    "Memory files:",
    list || "(none)",
    "",
    "Current turn:",
    turnText.trim() || "(empty)",
    "",
    "Return ONLY a JSON array of the relevant file names (a subset of the names",
    'above). No prose, no markdown, no code fence. Return [] when none apply.',
  ].join("\n");
}

/** Strip a ```json … ``` (or bare ```) fence so JSON inside survives parsing. */
function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced?.[1] ?? text).trim();
}

/** Find the first top-level JSON array substring, tolerating surrounding prose. */
function firstJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}

/**
 * Pure, tolerant parse of the side-query response into the selected file names.
 * Keeps only names present in `validNames` (drops hallucinated names + dups),
 * tolerates ```json fences and surrounding prose, and returns [] on any garbage
 * (never throws). Order follows `validNames` for determinism.
 */
export function parseRelevanceSelection(
  llmResponse: string,
  validNames: string[],
): string[] {
  const valid = new Set(validNames);
  const body = stripFence(llmResponse);
  const candidate = firstJsonArray(body) ?? body;
  let raw: unknown;
  try {
    raw = JSON.parse(candidate);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const picked = new Set(
    raw.filter((x): x is string => typeof x === "string").map((x) => x.trim()),
  );
  // Filter through validNames (drops hallucinated) and dedup via validNames order.
  return validNames.filter((name) => picked.has(name) && valid.has(name));
}

/** Pure: opt-in gate. Default off so the current load-all/recent behavior stays. */
export function relevanceEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.VANTA_MEM_RELEVANCE === "1";
}

/**
 * Select the memory files relevant to a turn via the injected cheap-model call.
 * Returns the parsed selection when the feature is enabled AND the call succeeds
 * AND it selects at least one valid file; otherwise returns `deps.fallback`:
 *   - disabled (gate off)        → fallback (current behavior preserved)
 *   - injected call throws        → fallback (errors-as-values, never throws)
 *   - empty / garbage selection   → fallback (no useful narrowing)
 * The gate is read separately so callers can pass an explicit env; default is
 * `process.env`.
 */
export async function selectRelevantMemories(
  turnText: string,
  files: MemoryFile[],
  deps: RelevanceDeps,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  if (!relevanceEnabled(env)) return deps.fallback;
  const validNames = files.map((f) => f.name);
  try {
    const raw = await deps.complete(buildRelevancePrompt(turnText, files));
    const selected = parseRelevanceSelection(raw, validNames);
    return selected.length > 0 ? selected : deps.fallback;
  } catch {
    return deps.fallback;
  }
}
