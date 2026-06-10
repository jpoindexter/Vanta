import { stashOriginal } from "./store.js";

// Tool-result disk offload: size-based offload. Compression (apply.ts) is LOSSY and
// allow-listed to media/web outputs; THIS is the lossless, all-tools backstop —
// any tool output over the char limit (a 60K read_file, a noisy shell dump) is
// stashed whole in the CCR store and replaced in history by a deterministic
// preview + the retrieval id. The agent expands it via the same `retrieve_original`
// tool used for compression. Best-effort: a stash failure returns the text as-is.

export const DEFAULT_MAX_RESULT_CHARS = 50_000;

/** How many leading chars of the original to keep inline as a preview. */
const PREVIEW_CHARS = 2_000;

/**
 * Per-tool char-limit overrides. Empty by default — the global limit governs.
 * Add an entry only when a specific tool warrants a tighter/looser cap; keys are
 * tool names (e.g. "screenshot"). The card's "per-tool limit respected" rides here.
 */
const PER_TOOL_MAX: Readonly<Record<string, number>> = {};

/**
 * Resolve the max char budget for a tool's output: per-tool override, else the
 * env override (`VANTA_MAX_RESULT_CHARS`), else the global default. Pure. A
 * non-positive or non-numeric env value is ignored (falls through to default).
 */
export function resolveMaxResultChars(toolName: string, env: NodeJS.ProcessEnv): number {
  const perTool = PER_TOOL_MAX[toolName];
  if (perTool !== undefined) return perTool;
  const raw = env.VANTA_MAX_RESULT_CHARS;
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_RESULT_CHARS;
}

export interface OffloadOptions {
  toolName: string;
  dataDir: string;
  env?: NodeJS.ProcessEnv;
}

export interface OffloadResult {
  offloaded: boolean;
  output: string;
}

/**
 * Offload an oversized tool output to disk. If `text.length <= max`, returns it
 * unchanged. Otherwise stashes the full text in the CCR store and returns a
 * deterministic preview (first ~2k chars) plus a retrieval footer carrying the
 * stash id — the same `original_id` vocabulary the `retrieve_original` tool reads.
 * Best-effort: if the stash write throws, the original text is returned untouched.
 */
export async function offloadResult(text: string, opts: OffloadOptions): Promise<OffloadResult> {
  const env = opts.env ?? process.env;
  const max = resolveMaxResultChars(opts.toolName, env);
  if (text.length <= max) return { offloaded: false, output: text };

  try {
    const id = await stashOriginal(opts.dataDir, text);
    const preview = text.slice(0, PREVIEW_CHARS);
    const footer =
      `\n\n[output truncated: ${text.length} chars saved to ccr/${id} — ` +
      `original_id="${id}", call retrieve_original to read the full content]`;
    return { offloaded: true, output: preview + footer };
  } catch {
    return { offloaded: false, output: text };
  }
}
