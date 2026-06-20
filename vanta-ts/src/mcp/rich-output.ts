// VANTA-MCP-RICH-OUTPUT — compact rendering for large/structured MCP tool results.
//
// An MCP `tools/call` result is a content array of blocks, each `{type, ...}`
// (`type:"text"` carries `text`; `type:"image"`/`audio`/`resource` carry binary
// or reference payloads — see mcp/client.ts). Today `textFromContent` joins the
// text blocks with "\n" and that joined string becomes the Vanta tool output.
// For a small result that's right. For a LARGE result (a 200-block dump, a giant
// log, a base64 image) it floods the operator's transcript with a blob.
//
// This module is the PURE builder for a compact alternative: a one-line shape
// summary ("3 blocks: 2 text, 1 image · ~1.4k tokens") + a bounded head preview
// with a truncation marker, instead of the whole thing. A small/simple result
// still renders as the plain join (current behavior, byte-identical).
//
// WIRING (not done this round — named for the follow-up, mirrors clarity-gate):
//   - Producer: `mcp/mount.ts mcpToolToVantaTool(...).execute` currently does
//     `const output = await client.callTool(...)`, where `McpClient.callTool`
//     returns `textFromContent(rawResult)` — the plain "\n" join.
//   - Change: have the mount path call the RAW result's `content` array through
//     `richMcpOutput(content)` instead of taking the already-joined string, so a
//     large/structured result is summarized + previewed rather than dumped. That
//     needs `callTool` (or a sibling) to surface the raw `content` blocks; this
//     module is the renderer it would feed. Small results stay the plain join,
//     so the change is invisible for the common case.

import { estTokens } from "../compress/types.js";

/** One MCP content block. `text` present on `type:"text"`; others carry binary/refs. */
export type McpContentBlock = { type?: unknown; text?: unknown; [k: string]: unknown };

/** A result is large past this many characters of joined text (preview otherwise). */
export const DEFAULT_LARGE_THRESHOLD = 2000;
/** Head preview length (chars) shown before the truncation marker on a large result. */
export const DEFAULT_PREVIEW_CHARS = 800;

export type RichOutputOptions = {
  /** Char count above which the compact (summary + preview) form is used. */
  readonly threshold?: number;
  /** Head preview length in chars (only used in the compact form). */
  readonly previewChars?: number;
};

// Full ANSI escape sequences (7-bit ESC-introduced + 8-bit CSI \x9b / OSC \x9d),
// removed entirely so a tool result can't inject a terminal escape into the
// preview. Mirrors ui/advisor-msg.ts / term/terminal-title.ts.
const ANSI_SEQUENCE = new RegExp(
  "[\\u001b\\u009b][[\\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-Za-z]" +
    "|\\u001b[@-Z\\\\-_]",
  "g",
);
// Remaining bare control chars → space. Newlines/tabs collapse here too; we keep
// the preview on a bounded set of visible chars so it can't spoof transcript rows.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f\\u009b\\u009d]", "g");

/** Strip ANSI + bare control chars from untrusted preview text. Tab (\t) and
 *  newline (\n) are excluded from CONTROL_CHARS so the preview reads naturally;
 *  every escape / NUL / BEL / DEL is removed. Pure. */
function stripControl(raw: string): string {
  return raw.replace(ANSI_SEQUENCE, "").replace(CONTROL_CHARS, "");
}

/** Coerce the raw `content` arg into an array of blocks. A non-array (malformed
 *  result) becomes a single best-effort text block of its JSON, never throws. */
function toBlocks(content: unknown): McpContentBlock[] {
  if (Array.isArray(content)) return content as McpContentBlock[];
  if (content === undefined || content === null) return [];
  if (typeof content === "object") return [content as McpContentBlock];
  return [{ type: "text", text: String(content) }];
}

/** The block's declared type, defaulting to "text" when absent/non-string. */
function blockType(block: McpContentBlock): string {
  const t = block?.type;
  return typeof t === "string" && t.length > 0 ? t : "text";
}

/** The plain text join — byte-identical to mcp/client.ts `textFromContent` for an
 *  array result: each block's `text` (when a string-coercible `text` field is
 *  present), empties filtered, joined with "\n". Pure. */
export function joinText(content: unknown): string {
  return toBlocks(content)
    .map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : ""))
    .filter(Boolean)
    .join("\n");
}

/** Compact "1.4k"/"930"/"2.0M" style count for the token figure. */
function abbrev(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/**
 * One-line summary of a result's shape: block count, per-type counts (sorted by
 * frequency then name for stable output), and an approximate token figure over
 * the joined text. Examples:
 *   "3 blocks: 2 text, 1 image · ~1.4k tokens"
 *   "1 block: 1 text · ~12 tokens"
 *   "0 blocks · ~0 tokens"
 * Pure; never throws on malformed content.
 */
export function summarizeMcpResult(content: unknown): string {
  const blocks = toBlocks(content);
  const counts = new Map<string, number>();
  for (const b of blocks) counts.set(blockType(b), (counts.get(blockType(b)) ?? 0) + 1);

  const tokens = estTokens(joinText(content));
  const noun = blocks.length === 1 ? "block" : "blocks";
  const head = `${blocks.length} ${noun}`;
  if (counts.size === 0) return `${head} · ~${abbrev(tokens)} tokens`;

  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, n]) => `${n} ${type}`);
  return `${head}: ${parts.join(", ")} · ~${abbrev(tokens)} tokens`;
}

/** Whether the joined text exceeds the large-result threshold (char count). Pure. */
export function isLargeResult(content: unknown, threshold = DEFAULT_LARGE_THRESHOLD): boolean {
  return joinText(content).length > Math.max(0, threshold);
}

/**
 * Render an MCP result for the operator.
 *  - Small (joined text ≤ threshold): the plain join, byte-identical to current
 *    behavior (`textFromContent`). No summary, no stripping — the common case is
 *    untouched.
 *  - Large (> threshold): a shape summary line, then a control/ANSI-stripped head
 *    preview bounded to `previewChars`, then a truncation marker naming how many
 *    chars were withheld: "… [N more chars truncated]".
 * Pure; never throws (malformed content → best-effort).
 */
export function richMcpOutput(content: unknown, opts: RichOutputOptions = {}): string {
  const threshold = opts.threshold ?? DEFAULT_LARGE_THRESHOLD;
  const previewChars = Math.max(0, opts.previewChars ?? DEFAULT_PREVIEW_CHARS);
  const joined = joinText(content);
  if (joined.length <= Math.max(0, threshold)) return joined;

  const safe = stripControl(joined);
  const preview = safe.slice(0, previewChars);
  const remaining = safe.length - preview.length;
  const marker = remaining > 0 ? `\n… [${remaining} more chars truncated]` : "";
  return `${summarizeMcpResult(content)}\n${preview}${marker}`;
}
