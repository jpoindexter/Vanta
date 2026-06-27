// MEMORY-ADAPTER-MEMANTO — memanto (a local-first, MIT-licensed external memory)
// as a memory backend, behind the SAME memory port the mem0/drive adapters use.
// This is the LOCAL-FIRST sibling of `mem0-adapter.ts`: it mirrors that file's
// shape (pure request builders + tolerant response parser + an adapter over an
// injected client) but supports BOTH access modes — a local REST endpoint OR a
// mounted-MCP toolset — selected by config, not by a different code path.
//
// This module is PURE + INJECTABLE: the request builders + response parser take
// plain data, and `makeMemantoAdapter` takes its transport as an injected `call`
// dep, so it unit-tests with NO real network and NO real MCP.
//
// WIRE POINT (named, not built this round). `memory/provider.ts` owns the
// resolver + catalog: `MEMORY_CATALOG` carries the backends and
// `resolveMemoryProvider(env)` is the recall-routing fork. When memanto ships,
// that resolver — guarded by `memantoEnabled(env)` — would build `deps.call`
// from `resolveMemantoMode(env)`:
//   - REST mode: a closure that fetches `${VANTA_MEMANTO_URL}${path}` (POST
//     /memories for "add", POST /memories/search for "search") against the
//     configured LOCALHOST endpoint, with NO Authorization header — local-first
//     means no cloud key.
//   - MCP mode: a closure that routes the op to the corresponding mounted
//     memanto MCP tool (e.g. memanto's add/search tools) via the live registry.
// then route `remember`/`recall` through `makeMemantoAdapter({call})` (add on
// remember, search on recall). The live REST/MCP call is the documented
// boundary; everything here is pure given the injected `call`. Mirrors the
// clarity-gate shape: decide the mode first (pure), then act (injected client).
//
// SECURITY: memanto is LOCAL-FIRST, so there is NO secret to leak — the config
// is a localhost URL, not a cloud token, and nothing key-shaped is constructed
// here. And memanto's returned memory text is EXTERNAL input, so
// `parseMemantoMemories` control-strips it before it can reach a prompt. The
// request builders + response parser live in memanto-protocol.ts.

import {
  buildMemantoAddBody,
  buildMemantoSearchBody,
  parseMemantoMemories,
  type MemantoMemory,
} from "./memanto-protocol.js";

// Re-export the protocol surface so importers keep one public API at this path.
export {
  buildMemantoAddBody,
  buildMemantoSearchBody,
  parseMemantoMemories,
} from "./memanto-protocol.js";
export type {
  MemantoMemory,
  MemantoAddBody,
  MemantoSearchBody,
} from "./memanto-protocol.js";

/** How memanto is reached: a local REST endpoint or a mounted MCP toolset. */
export type MemantoMode = "rest" | "mcp";

/**
 * Resolve the memanto access mode from the environment. `VANTA_MEMANTO_MODE=mcp`
 * selects the mounted-MCP toolset; anything else (incl. unset) is the local-first
 * REST default. Case-insensitive. Pure.
 */
export function resolveMemantoMode(env: NodeJS.ProcessEnv = process.env): MemantoMode {
  return env.VANTA_MEMANTO_MODE?.trim().toLowerCase() === "mcp" ? "mcp" : "rest";
}

/**
 * Whether memanto is enabled — local-first, so NO secret key is required. It's on
 * when a local REST URL is configured (`VANTA_MEMANTO_URL`), OR the mode is `mcp`
 * with a configured MCP server (`VANTA_MEMANTO_MCP_SERVER`). Pure.
 */
export function memantoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const url = env.VANTA_MEMANTO_URL;
  if (typeof url === "string" && url.trim().length > 0) return true;
  if (resolveMemantoMode(env) === "mcp") {
    const server = env.VANTA_MEMANTO_MCP_SERVER;
    return typeof server === "string" && server.trim().length > 0;
  }
  return false;
}

/** The op the adapter asks its injected client to perform. */
export type MemantoOp = "add" | "search";

/**
 * Injected transport for the adapter: perform `op` with `payload`, resolve the
 * decoded result. THE boundary — the only impure input — and the one seam that
 * abstracts over REST vs MCP. The real impl (built at the wire point) either
 * fetches the localhost REST endpoint (no key) or routes to the mounted memanto
 * MCP tool; this signature never sees a URL, a server name, or any secret.
 */
export type MemantoCall = (op: MemantoOp, payload: unknown) => Promise<unknown>;

/** Injected dependencies for {@link makeMemantoAdapter}. */
export type MemantoDeps = {
  /** Perform an add/search op → decoded result. The documented REST-or-MCP boundary. */
  call: MemantoCall;
};

/** The memanto adapter surface: add a memory, semantic-search memories. */
export type MemantoAdapter = {
  /** Store `text` as a memory. Resolves `{ok}` — never throws. */
  add(text: string): Promise<{ ok: boolean }>;
  /** Search memories for `query`. Resolves the parsed memories ([] on failure) — never throws. */
  search(query: string): Promise<MemantoMemory[]>;
};

/**
 * Build a memanto adapter over an injected `call`. ERRORS-AS-VALUES throughout:
 * a `call` rejection (endpoint down / MCP tool missing) makes `add` resolve
 * `{ok:false}` and `search` resolve `[]` — it NEVER throws, so a caller can fall
 * back to local memory. The transport (REST closure or MCP route) is built at the
 * wire point and injected; this fn is mode-agnostic and key-free by construction.
 */
export function makeMemantoAdapter(deps: MemantoDeps): MemantoAdapter {
  return {
    async add(text: string): Promise<{ ok: boolean }> {
      try {
        await deps.call("add", buildMemantoAddBody(text));
        return { ok: true };
      } catch {
        return { ok: false }; // endpoint/tool unreachable → caller falls back to local
      }
    },
    async search(query: string): Promise<MemantoMemory[]> {
      try {
        const result = await deps.call("search", buildMemantoSearchBody(query));
        return parseMemantoMemories(result);
      } catch {
        return []; // endpoint/tool unreachable → no results, caller falls back
      }
    },
  };
}
