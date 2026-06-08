import type { CompressOptions, CompressResult, ContentType } from "./types.js";
import { DEFAULTS, estTokens } from "./types.js";
import { crushJson } from "./json-crush.js";
import { squashLogs } from "./log-squash.js";

// ContentRouter, native. Detect what a tool output is, route it to the right
// compressor, and only keep the result if it actually shrank. This is the pure
// core — the CCR stash + retrieval footer are added by the caller (which has the
// data dir). Keeping this pure makes it trivially testable with no filesystem.

const LOG_HINT = /^\s+(at\s|File\s)|^\[?\d{4}-\d{2}-\d{2}|ERROR|WARN|INFO|Traceback/m;
const BINARY_SAMPLE = 4000;
const BINARY_RATIO = 0.15; // >15% non-text in the sample ⇒ a blob

/** Fraction of a sample that is outside printable ASCII + common whitespace. Pure. */
function nonTextRatio(text: string): number {
  const sample = text.slice(0, BINARY_SAMPLE);
  if (!sample.length) return 0;
  // eslint-disable-next-line no-control-regex
  const nonText = sample.match(/[^\x09\x0A\x0D\x20-\x7E]/g);
  return (nonText?.length ?? 0) / sample.length;
}

/** Classify text into a content type. Pure, cheap, best-effort. */
export function detectContentType(text: string): ContentType {
  // Binary first: a base64 image / blob is useless to a text LLM and is the
  // single biggest payload in real sessions — detecting it is the top win.
  if (nonTextRatio(text) > BINARY_RATIO) return "binary";

  const t = text.trimStart();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      // looks like JSON but isn't valid — fall through
    }
  }
  if (LOG_HINT.test(text)) return "logs";
  return "text";
}

/** Elision stub for a binary blob — the LLM gets a pointer, not garbage. Pure. */
export function binaryStub(text: string): string {
  return `[binary/non-text content elided — ${text.length} chars]`;
}

/** Apply the compressor for a given content type. Pure. */
function applyCompressor(text: string, type: ContentType, opts: Required<CompressOptions>): string {
  if (type === "binary") return binaryStub(text);
  if (type === "json") return crushJson(text, opts);
  // logs AND text both benefit from blank-line/duplicate collapse (transcripts,
  // verbose build output). squashLogs is a no-op when there's nothing to collapse.
  return squashLogs(text);
}

/**
 * Compress one block of text. Pure — no I/O, no stashing. Returns the result
 * with `compressed:false` when below the token floor or when the transform
 * didn't shrink it (so the caller never stashes or rewrites pointlessly).
 */
export function compressText(raw: string, options: CompressOptions = {}): CompressResult {
  const opts = { ...DEFAULTS, ...options };
  const tokensBefore = estTokens(raw);
  const contentType = detectContentType(raw);

  if (tokensBefore < opts.minTokens) {
    return { text: raw, contentType, tokensBefore, tokensAfter: tokensBefore, compressed: false };
  }

  const out = applyCompressor(raw, contentType, opts);
  const tokensAfter = estTokens(out);

  // Only a real shrink counts. Text type, or a transform that didn't help, is a no-op.
  if (tokensAfter >= tokensBefore) {
    return { text: raw, contentType, tokensBefore, tokensAfter: tokensBefore, compressed: false };
  }

  return { text: out, contentType, tokensBefore, tokensAfter, compressed: true };
}
