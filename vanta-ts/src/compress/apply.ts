import type { CompressOptions } from "./types.js";
import { compressText } from "./router.js";
import { stashOriginal } from "./store.js";
import { estTokens, DEFAULTS } from "./types.js";
import { isCodeContent, compressTypeScript } from "./ast-compress.js";

// The impure seam: wrap the pure router with CCR stashing + a retrieval footer.
// Called once per tool result in the agent loop (never the system prefix, never
// re-run on an already-compressed message). If anything fails, return the
// original untouched — compression must never break the loop.

/** True unless VANTA_COMPRESS is explicitly "0"/"false". Default on. */
export function compressEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.VANTA_COMPRESS;
  return v !== "0" && v !== "false";
}

// Allow-list, NOT deny-list. Compression is LOSSY — applying it to a precision
// read (read_file, grep, lsp, git_diff) silently corrupts the agent's view:
// json-crush elides a JSON file's middle; log-squash collapses blank/duplicate
// lines so line numbers shift, and the agent then edits/cites file:line against
// a view that doesn't match disk. Read-fidelity is a contract. So we compress
// ONLY voluminous-by-nature, advisory outputs (vision/media/web) — exactly where
// the measured win (binary-blob elision) comes from — and leave every precision
// tool, and every future tool, untouched by default.
export const COMPRESS_TOOLS: ReadonlySet<string> = new Set([
  "describe_image",
  "screenshot",
  "look_at_screen",
  "look_at_camera",
  "watch_video",
  "web_fetch",
  "web_search",
]);

/** Whether a tool's output may be compressed (allow-list, default-safe). Pure. */
export function shouldCompressTool(name: string): boolean {
  return COMPRESS_TOOLS.has(name);
}

export interface ApplyResult {
  output: string;
  tokensSaved: number;
}

/**
 * AST-compress a TypeScript/JavaScript read_file output. Only fires when:
 * - Content passes the TS heuristic (import/export patterns)
 * - Output is above minTokens threshold
 * - AST elision actually shrinks the text
 * Best-effort: any error → original output.
 */
export async function applyCodeCompression(output: string, dataDir: string): Promise<ApplyResult> {
  try {
    const tokensBefore = estTokens(output);
    if (tokensBefore < DEFAULTS.minTokens || !isCodeContent(output)) {
      return { output, tokensSaved: 0 };
    }
    const compressed = compressTypeScript(output);
    const tokensAfter = estTokens(compressed);
    if (tokensAfter >= tokensBefore) return { output, tokensSaved: 0 };
    const id = await stashOriginal(dataDir, output);
    const saved = tokensBefore - tokensAfter;
    const footer = `\n\n[vanta compressed ${tokensBefore}→${tokensAfter} tokens (code); original_id="${id}" — call retrieve_original to expand]`;
    return { output: compressed + footer, tokensSaved: saved };
  } catch {
    return { output, tokensSaved: 0 };
  }
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
