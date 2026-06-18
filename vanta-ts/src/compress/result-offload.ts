import { stashOriginal } from "./store.js";
import { resolveDelivery } from "./delivery-policy.js";

// Tool-result disk offload: size-based offload, backbone-gated delivery. Compression
// (apply.ts) is LOSSY and allow-listed to media/web outputs; THIS is the lossless,
// all-tools backstop — any tool output over the char limit (a 60K read_file, a noisy
// shell dump) is stashed whole in the CCR store. HOW it's then delivered follows the
// delivery policy (delivery-policy.ts): a strong backbone gets a short preview + a
// grep-able file path + retrieval id (file delivery); a weak backbone gets a larger
// inline-truncated window and is NEVER handed a file-only pointer it won't follow.
// Best-effort: a stash failure returns the text as-is.

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
  /** Active model id — drives the strong/weak backbone delivery gate. */
  modelId?: string;
}

export interface OffloadResult {
  offloaded: boolean;
  output: string;
  /** "file" = grep-able pointer (strong backbone); "inline" = truncated in place (weak). */
  delivery?: "file" | "inline";
}

/** A one-line summary of an oversized output: first non-empty line, clipped. */
function summarize(text: string): string {
  const line = text.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.length > 160 ? line.slice(0, 160) + "…" : line;
}

/**
 * Offload an oversized tool output to disk. If `text.length <= max`, returns it
 * unchanged (inline is the default). Otherwise stashes the full text in the CCR
 * store and delivers per the backbone gate: a STRONG backbone gets a short preview
 * + a grep-able file path + retrieval id; a WEAK backbone gets a larger inline
 * window and never a file-only pointer. Best-effort: a stash failure returns text.
 */
export async function offloadResult(text: string, opts: OffloadOptions): Promise<OffloadResult> {
  const env = opts.env ?? process.env;
  const max = resolveMaxResultChars(opts.toolName, env);
  if (text.length <= max) return { offloaded: false, output: text };

  try {
    const id = await stashOriginal(opts.dataDir, text);
    const { mode, inlineChars } = resolveDelivery(env, opts.modelId);
    const preview = text.slice(0, Math.max(inlineChars, PREVIEW_CHARS));
    const path = `.vanta/ccr/${id}.txt`;
    const footer = mode === "file"
      ? `\n\n[output truncated: ${text.length} chars. summary: ${summarize(text)}\n` +
        `full result is a grep-able file at ${path} — original_id="${id}", call retrieve_original to read it all]`
      : `\n\n[output truncated to ${preview.length} of ${text.length} chars to fit a smaller model; ` +
        `full copy stashed at ${path} (original_id="${id}")]`;
    return { offloaded: true, output: preview + footer, delivery: mode };
  } catch {
    return { offloaded: false, output: text };
  }
}
