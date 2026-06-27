import { z } from "zod";

// MEMORY-ADAPTER-MEMANTO — the PURE wire protocol for memanto: the request-body
// builders + the tolerant response parser (with external-text control-strip).
// No transport lives here — makeMemantoAdapter composes these over an injected
// `call`. Re-exported from memanto-adapter.ts so importers see one surface.

/** One parsed memanto memory: an id, the memory text, and an optional relevance score. */
export type MemantoMemory = {
  id: string;
  text: string;
  score?: number;
};

/** memanto add-request body: the text to remember. Local REST takes a bare `{text}`. */
export type MemantoAddBody = {
  text: string;
};

/** memanto search-request body: the query to recall against. */
export type MemantoSearchBody = {
  query: string;
};

/**
 * Build the add body that stores `text`. memanto's local REST `POST /memories`
 * takes a bare `{text}`; the MCP add tool takes the same shape as its argument.
 * Pure.
 */
export function buildMemantoAddBody(text: string): MemantoAddBody {
  return { text };
}

/**
 * Build the search body that recalls memories matching `query`. memanto's local
 * REST `POST /memories/search` (and the MCP search tool) takes `{query}`. Pure.
 */
export function buildMemantoSearchBody(query: string): MemantoSearchBody {
  return { query };
}

// Strip C0 control characters (except tab \x09 and newline \x0a) plus DEL \x7f
// from external text, so a memanto response can never inject terminal escapes or
// hidden directives into a prompt. Codepoint escapes only — no literal control
// bytes in source.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/g;

function sanitize(text: string): string {
  return text.replace(CONTROL_CHARS, "").trim();
}

// One memanto result row. memanto may name the memory text `text`, `memory`, or
// `content` across REST/MCP shapes — accept any (text wins, then memory, then
// content). `id` is coerced to a string (a tolerant parse shouldn't reject a
// numeric one). `score` is optional and only kept when finite. Unknown fields
// are ignored.
const RowSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    text: z.string().optional(),
    memory: z.string().optional(),
    content: z.string().optional(),
    score: z.number().optional(),
  })
  .passthrough();

// memanto returns either a bare array of rows, `{ memories: [...] }`, or
// `{ results: [...] }` (shapes its REST/MCP surfaces ship). Anything else → no
// memories.
const ResponseSchema = z.union([
  z.array(z.unknown()),
  z.object({ memories: z.array(z.unknown()) }).transform((o) => o.memories),
  z.object({ results: z.array(z.unknown()) }).transform((o) => o.results),
]);

/**
 * Parse a memanto response (already-decoded JSON, `unknown`) into memories.
 * Tolerant: accepts the bare-array form OR `{memories:[...]}` OR `{results:[...]}`;
 * per row, takes `text` (else `memory`, else `content`) as the text and keeps a
 * finite `score` when present; a row with no text field, or a non-array/garbage
 * payload, is dropped. Never throws — returns `[]` on anything it can't read. The
 * memory text is EXTERNAL, so it is control-stripped here before reaching a prompt.
 */
export function parseMemantoMemories(json: unknown): MemantoMemory[] {
  const rows = ResponseSchema.safeParse(json);
  if (!rows.success) return [];
  const out: MemantoMemory[] = [];
  for (const raw of rows.data) {
    const row = RowSchema.safeParse(raw);
    if (!row.success) continue;
    const text = row.data.text ?? row.data.memory ?? row.data.content;
    if (text === undefined) continue; // no memory text → not a usable memory
    const memory: MemantoMemory = { id: String(row.data.id), text: sanitize(text) };
    if (row.data.score !== undefined && Number.isFinite(row.data.score)) {
      memory.score = row.data.score;
    }
    out.push(memory);
  }
  return out;
}
