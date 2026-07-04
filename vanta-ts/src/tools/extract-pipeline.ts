// WEB-EXTRACT-PIPELINE — size-tiered handling of fetched page content, mirroring
// Hermes' web_extract: a page is routed by character count instead of being
// blindly truncated. Pure core (this file) takes an INJECTED one-shot summarizer
// so the tiering/chunking/synthesis logic is fully unit-testable without a real
// provider; web-fetch.ts wires the live LLM-backed summarizer.

export type ExtractTier = "as-is" | "summarize" | "chunk-synthesize" | "refuse";

export type ExtractThresholds = {
  /** ≤ this many chars: returned as-is, unchanged. */
  asIsMax: number;
  /** ≤ this many chars: single-pass LLM summary. */
  summarizeMax: number;
  /** ≤ this many chars: parallel-chunked then synthesized. Above → refused. */
  chunkMax: number;
};

export const DEFAULT_EXTRACT_THRESHOLDS: ExtractThresholds = {
  asIsMax: 5_000,
  summarizeMax: 500_000,
  chunkMax: 2_000_000,
};

export const DEFAULT_CHUNK_SIZE = 100_000;

/** A positive numeric env override, or `fallback` when unset/invalid. */
function envNum(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const n = Number(env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Resolve the tier thresholds from env (VANTA_EXTRACT_ASIS_MAX/SUMMARIZE_MAX/CHUNK_MAX). */
export function resolveExtractThresholds(env: NodeJS.ProcessEnv): ExtractThresholds {
  return {
    asIsMax: envNum(env, "VANTA_EXTRACT_ASIS_MAX", DEFAULT_EXTRACT_THRESHOLDS.asIsMax),
    summarizeMax: envNum(env, "VANTA_EXTRACT_SUMMARIZE_MAX", DEFAULT_EXTRACT_THRESHOLDS.summarizeMax),
    chunkMax: envNum(env, "VANTA_EXTRACT_CHUNK_MAX", DEFAULT_EXTRACT_THRESHOLDS.chunkMax),
  };
}

/** Resolve the chunk size from env (VANTA_EXTRACT_CHUNK_SIZE). */
export function resolveChunkSize(env: NodeJS.ProcessEnv): number {
  return envNum(env, "VANTA_EXTRACT_CHUNK_SIZE", DEFAULT_CHUNK_SIZE);
}
/** Per-chunk summary target (kept small so N chunk-summaries stay a manageable
 *  synthesis input); the final synthesis pass targets the full ~5k output. */
const CHUNK_SUMMARY_TARGET_CHARS = 2_000;
const FINAL_SUMMARY_TARGET_CHARS = 5_000;

/** Classify a page by its extracted-text length. Pure. */
export function classifyExtractTier(charCount: number, thresholds: ExtractThresholds = DEFAULT_EXTRACT_THRESHOLDS): ExtractTier {
  if (charCount <= thresholds.asIsMax) return "as-is";
  if (charCount <= thresholds.summarizeMax) return "summarize";
  if (charCount <= thresholds.chunkMax) return "chunk-synthesize";
  return "refuse";
}

/** Split text into `chunkSize`-char pieces, preserving every character (no gaps/overlap). */
export function splitIntoChunks(text: string, chunkSize: number = DEFAULT_CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
  return chunks;
}

/** One-shot text summarizer: text + a target output length (chars) → summary text. */
export type Summarizer = (text: string, targetChars: number) => Promise<string>;

/** Guidance shown for a page that exceeds every tier — the tier-4 refusal. */
export function refusalGuidance(charCount: number, thresholds: ExtractThresholds): string {
  return (
    `page too large to extract (${charCount.toLocaleString()} chars, over the ` +
    `${thresholds.chunkMax.toLocaleString()}-char ceiling) — pick a more focused source ` +
    `(a specific section/subpage URL) or ask the user to paste the relevant excerpt.`
  );
}

export type ExtractPipelineOpts = {
  thresholds?: ExtractThresholds;
  chunkSize?: number;
  summarize: Summarizer;
};

export type ExtractResult = { tier: ExtractTier; output: string };

/**
 * Route `text` through the 4-tier pipeline: as-is / single-pass summary /
 * parallel-chunk+synthesize / refuse. The chunk tier summarizes every chunk
 * CONCURRENTLY, then runs one more summarize pass over the concatenated
 * chunk-summaries to produce the final bounded output.
 */
export async function runExtractPipeline(text: string, opts: ExtractPipelineOpts): Promise<ExtractResult> {
  const thresholds = opts.thresholds ?? DEFAULT_EXTRACT_THRESHOLDS;
  const tier = classifyExtractTier(text.length, thresholds);
  if (tier === "as-is") return { tier, output: text };
  if (tier === "refuse") return { tier, output: refusalGuidance(text.length, thresholds) };
  if (tier === "summarize") return { tier, output: await opts.summarize(text, FINAL_SUMMARY_TARGET_CHARS) };

  const chunks = splitIntoChunks(text, opts.chunkSize ?? DEFAULT_CHUNK_SIZE);
  const chunkSummaries = await Promise.all(chunks.map((c) => opts.summarize(c, CHUNK_SUMMARY_TARGET_CHARS)));
  const synthesized = await opts.summarize(chunkSummaries.join("\n\n"), FINAL_SUMMARY_TARGET_CHARS);
  return { tier, output: synthesized };
}
