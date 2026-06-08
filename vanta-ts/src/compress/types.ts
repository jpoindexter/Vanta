// Native context compression for Vanta — the Headroom concept, rewritten in
// pure TS with zero deps. Compresses fat tool outputs (JSON arrays, logs) before
// they enter message history; the original is stashed (CCR) so the agent can
// always retrieve it. No external proxy, no API key, no egress — fits the
// local-trusted-operator thesis where Headroom's Python proxy did not.

/** ~4 chars per token (same heuristic as context.ts). Pure. */
export function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Content classes the router recognizes; picks the compressor. */
export type ContentType = "json" | "logs" | "text" | "binary";

export interface CompressResult {
  /** The compressed (or original, if not worth it) text. */
  text: string;
  contentType: ContentType;
  tokensBefore: number;
  tokensAfter: number;
  /** True only when compression actually ran and shrank the text. */
  compressed: boolean;
  /** CCR id to retrieve the original, set only when compressed. */
  originalId?: string;
}

export interface CompressOptions {
  /** Below this token count, skip compression entirely. Default 400. */
  minTokens?: number;
  /** Array-of-objects: keep this many from the head. Default 3. */
  headItems?: number;
  /** Array-of-objects: keep this many from the tail. Default 1. */
  tailItems?: number;
  /** Truncate string values longer than this. Default 200. */
  maxStringLength?: number;
}

export const DEFAULTS: Required<CompressOptions> = {
  minTokens: 400,
  headItems: 3,
  tailItems: 1,
  maxStringLength: 200,
};
