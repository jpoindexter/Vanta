// MEM-RELEVANCE durability classifier (classifyMemory/shouldStoreDurably) is
// extracted to classify.ts for the size gate; re-exported here so callers keep
// the same `./relevance.js` module path.
export { classifyMemory, shouldStoreDurably } from "./classify.js";
export type { MemoryClass, ClassifyResult } from "./classify.js";

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
