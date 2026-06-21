import { z } from "zod";

// MEMORY-ADAPTER-MEM0 — mem0 (a memory-as-a-service REST API) as an external
// memory backend, behind the same memory port the rest of the app consumes.
// This is the SERVICE sibling of `drive-sync.ts`'s storage adapter: it proves
// the "memory provider behind a port" SERVICE pattern, so other hosted memory
// services (e.g. memanto) follow by mirroring this file.
//
// This module is PURE + INJECTABLE: the request builders + response parser take
// plain data, and `makeMem0Adapter` takes its HTTP as an injected `postJson`
// dep, so it unit-tests with NO real network and NO API key.
//
// WIRE POINT (named, not built this round). `memory/provider.ts` already owns the
// resolver + catalog: `MEMORY_CATALOG` carries the SERVICE backends
// (implemented:false until each wires), and `resolveMemoryProvider(env)` is the
// recall-routing fork. When mem0 ships, that resolver — guarded by
// `mem0Enabled(env)` — would build a real `postJson` (POST to
// `${VANTA_MEM0_BASE_URL ?? "https://api.mem0.ai"}${path}` with the
// `Authorization: Token ${VANTA_MEM0_API_KEY}` header constructed INSIDE the
// fetch closure) and route `remember`/`recall` through `makeMem0Adapter({postJson})`
// (add on remember, search on recall). The live mem0 HTTP call is the documented
// boundary; everything here is pure given the injected `postJson`.
//
// SECURITY: the mem0 API key is a SECRET. It lives ONLY in the injected
// `postJson`'s header construction at the wire point — it is NEVER an argument
// here, NEVER logged, NEVER echoed. And mem0's returned memory text is EXTERNAL
// input, so `parseMem0Memories` control-strips it before it can reach a prompt.

/** One parsed mem0 memory: an id, the memory text, and an optional relevance score. */
export type Mem0Memory = {
  id: string;
  text: string;
  score?: number;
};

/** Default mem0 user id when a host doesn't scope memories to a specific user. */
export const MEM0_DEFAULT_USER = "vanta";

/** mem0 add-request body: a single user message scoped to a user. */
export type Mem0AddBody = {
  messages: { role: "user"; content: string }[];
  user_id: string;
};

/** mem0 search-request body: a query scoped to a user. */
export type Mem0SearchBody = {
  query: string;
  user_id: string;
};

/**
 * Build the POST /v1/memories body that stores `text` for `userId`. mem0 takes a
 * chat-shaped `messages` array; a single piece of text becomes one user message.
 * Pure.
 */
export function buildMem0AddBody(text: string, userId: string = MEM0_DEFAULT_USER): Mem0AddBody {
  return { messages: [{ role: "user", content: text }], user_id: userId };
}

/**
 * Build the POST /v1/memories/search body that semantically searches `userId`'s
 * memories for `query`. Pure.
 */
export function buildMem0SearchBody(
  query: string,
  userId: string = MEM0_DEFAULT_USER,
): Mem0SearchBody {
  return { query, user_id: userId };
}

// Strip C0 control characters (except tab \x09 and newline \x0a) plus DEL \x7f
// from external text, so a mem0 response can never inject terminal escapes or
// hidden directives into a prompt. Codepoint escapes only — no literal control
// bytes in source.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/g;

function sanitize(text: string): string {
  return text.replace(CONTROL_CHARS, "").trim();
}

// One mem0 result row. mem0 names the memory text `memory`; some responses use
// `text` — accept either (memory wins). `id` is coerced to a string (mem0 ids are
// strings, but a tolerant parse shouldn't reject a numeric one). `score` is
// optional and only kept when it's a finite number. Unknown fields are ignored.
const RowSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    memory: z.string().optional(),
    text: z.string().optional(),
    score: z.number().optional(),
  })
  .passthrough();

// mem0 returns either a bare array of rows or `{ results: [...] }` (both shapes
// the REST API ships across endpoints/versions). Anything else → no memories.
const ResponseSchema = z.union([
  z.array(z.unknown()),
  z.object({ results: z.array(z.unknown()) }).transform((o) => o.results),
]);

/**
 * Parse a mem0 response (already-decoded JSON, `unknown`) into memories. Tolerant:
 * accepts the bare-array form OR the `{results:[...]}` form; per row, takes
 * `memory` (else `text`) as the text and keeps a finite `score` when present; a
 * row with neither text field, or a non-array/garbage payload, is dropped. Never
 * throws — returns `[]` on anything it can't read. The memory text is EXTERNAL,
 * so it is control-stripped here before it can reach a prompt.
 */
export function parseMem0Memories(json: unknown): Mem0Memory[] {
  const rows = ResponseSchema.safeParse(json);
  if (!rows.success) return [];
  const out: Mem0Memory[] = [];
  for (const raw of rows.data) {
    const row = RowSchema.safeParse(raw);
    if (!row.success) continue;
    const text = row.data.memory ?? row.data.text;
    if (text === undefined) continue; // no memory text → not a usable memory
    const memory: Mem0Memory = { id: String(row.data.id), text: sanitize(text) };
    if (row.data.score !== undefined && Number.isFinite(row.data.score)) {
      memory.score = row.data.score;
    }
    out.push(memory);
  }
  return out;
}

/** Whether the mem0 service is enabled — the API key (a secret) is present. */
export function mem0Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // gitleaks:allow — env presence check, not a hardcoded secret (reads, never embeds, the key)
  const present = env.VANTA_MEM0_API_KEY;
  return typeof present === "string" && present.trim().length > 0;
}

/** The mem0 add endpoint path (POST). */
export const MEM0_ADD_PATH = "/v1/memories";
/** The mem0 search endpoint path (POST). */
export const MEM0_SEARCH_PATH = "/v1/memories/search";

/**
 * Injected HTTP for the adapter: POST `body` to `path`, resolve the decoded JSON.
 * THE network boundary — the only impure input. The real impl (built at the wire
 * point) constructs the mem0 base URL + the `Authorization` key header inside its
 * closure; this signature never sees the key.
 */
export type PostJson = (path: string, body: unknown) => Promise<unknown>;

/** Injected dependencies for {@link makeMem0Adapter}. */
export type Mem0Deps = {
  /** POST a JSON body to a mem0 path → decoded JSON. The documented boundary. */
  postJson: PostJson;
  /** mem0 user id to scope memories to. Defaults to {@link MEM0_DEFAULT_USER}. */
  userId?: string;
};

/** The mem0 adapter surface: add a memory, semantic-search memories. */
export type Mem0Adapter = {
  /** Store `text` as a memory. Resolves `{ok}` — never throws. */
  add(text: string): Promise<{ ok: boolean }>;
  /** Semantic-search memories for `query`. Resolves the parsed memories ([] on failure) — never throws. */
  search(query: string): Promise<Mem0Memory[]>;
};

/**
 * Build a mem0 adapter over an injected `postJson`. ERRORS-AS-VALUES throughout:
 * a `postJson` rejection (service down / absent / auth failure) makes `add`
 * resolve `{ok:false}` and `search` resolve `[]` — it NEVER throws, so a caller
 * can fall back to local memory. The key is never an argument here; it lives only
 * in the injected `postJson`'s header construction at the wire point.
 */
export function makeMem0Adapter(deps: Mem0Deps): Mem0Adapter {
  const userId = deps.userId ?? MEM0_DEFAULT_USER;
  return {
    async add(text: string): Promise<{ ok: boolean }> {
      try {
        await deps.postJson(MEM0_ADD_PATH, buildMem0AddBody(text, userId));
        return { ok: true };
      } catch {
        return { ok: false }; // service unreachable → caller falls back to local
      }
    },
    async search(query: string): Promise<Mem0Memory[]> {
      try {
        const json = await deps.postJson(MEM0_SEARCH_PATH, buildMem0SearchBody(query, userId));
        return parseMem0Memories(json);
      } catch {
        return []; // service unreachable → no service results, caller falls back
      }
    },
  };
}
