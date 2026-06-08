import type { CompressOptions } from "./types.js";
import { compressText } from "./router.js";
import { stashOriginal } from "./store.js";

// The impure seam: wrap the pure router with CCR stashing + a retrieval footer.
// Called once per tool result in the agent loop (never the system prefix, never
// re-run on an already-compressed message). If anything fails, return the
// original untouched — compression must never break the loop.

/** True unless VANTA_COMPRESS is explicitly "0"/"false". Default on. */
export function compressEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.VANTA_COMPRESS;
  return v !== "0" && v !== "false";
}

export interface ApplyResult {
  output: string;
  tokensSaved: number;
}

/**
 * Compress a single tool output for message history. On a real shrink, stash the
 * original in CCR and append a one-line retrieval footer so the agent can expand
 * it via the `retrieve_original` tool. Best-effort: any error → original output.
 */
export async function applyCompression(
  output: string,
  dataDir: string,
  options: CompressOptions = {},
): Promise<ApplyResult> {
  try {
    const result = compressText(output, options);
    if (!result.compressed) return { output, tokensSaved: 0 };

    const id = await stashOriginal(dataDir, output);
    const saved = result.tokensBefore - result.tokensAfter;
    const footer =
      `\n\n[vanta compressed ${result.tokensBefore}→${result.tokensAfter} tokens ` +
      `(${result.contentType}); original_id="${id}" — call retrieve_original to expand]`;
    return { output: result.text + footer, tokensSaved: saved };
  } catch {
    return { output, tokensSaved: 0 };
  }
}
