// The ticket store's comment row is { at, text } with no author field, and the
// ticket engine is not changed by this track. Author, kind and an idempotency
// key travel in a leading marker so a thread can be rebuilt. A comment written
// by another surface (no marker) decodes with author "unknown".

export type CommentKind = "comment" | "answer";
export type DecodedComment = { author: string; kind: CommentKind; text: string; requestId?: string };

const MARKER = /^\[by:([^\]|]+)(?:\|k:(comment|answer))?(?:\|r:([^\]|]+))?\] ([\s\S]*)$/;
const SAFE = /[^A-Za-z0-9_.:@-]/g;

export function encodeComment(input: { author: string; kind?: CommentKind; requestId?: string; text: string }): string {
  const parts = [`by:${input.author.replace(SAFE, "_")}`];
  if (input.kind && input.kind !== "comment") parts.push(`k:${input.kind}`);
  if (input.requestId) parts.push(`r:${input.requestId.replace(SAFE, "_")}`);
  return `[${parts.join("|")}] ${input.text}`;
}

export function decodeComment(stored: string): DecodedComment {
  const match = MARKER.exec(stored);
  if (!match) return { author: "unknown", kind: "comment", text: stored };
  const [, author, kind, requestId, text] = match;
  return { author: author!, kind: (kind as CommentKind | undefined) ?? "comment", text: text!, ...(requestId ? { requestId } : {}) };
}
