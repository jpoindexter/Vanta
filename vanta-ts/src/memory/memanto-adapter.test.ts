import { describe, it, expect, vi } from "vitest";
import {
  buildMemantoAddBody,
  buildMemantoSearchBody,
  parseMemantoMemories,
  resolveMemantoMode,
  memantoEnabled,
  makeMemantoAdapter,
  type MemantoMemory,
  type MemantoCall,
} from "./memanto-adapter.js";

// All pure / injected — no real network, no MCP, no API key, no filesystem.
// Local-first: every "enabled" check below uses a localhost URL or an MCP server
// name, never a secret token.

describe("buildMemantoAddBody", () => {
  it("wraps text as a bare {text} body (local REST shape)", () => {
    expect(buildMemantoAddBody("I prefer dark mode")).toEqual({ text: "I prefer dark mode" });
  });
});

describe("buildMemantoSearchBody", () => {
  it("builds a {query} body", () => {
    expect(buildMemantoSearchBody("ui preferences")).toEqual({ query: "ui preferences" });
  });
});

describe("parseMemantoMemories", () => {
  it("parses the bare-array form, keeping id/text/score", () => {
    const json = [
      { id: "m1", text: "likes dark mode", score: 0.91 },
      { id: "m2", text: "uses ESM", score: 0.42 },
    ];
    expect(parseMemantoMemories(json)).toEqual<MemantoMemory[]>([
      { id: "m1", text: "likes dark mode", score: 0.91 },
      { id: "m2", text: "uses ESM", score: 0.42 },
    ]);
  });

  it("parses the {memories:[...]} object form", () => {
    const json = { memories: [{ id: "k1", text: "frugal with tokens" }] };
    expect(parseMemantoMemories(json)).toEqual<MemantoMemory[]>([
      { id: "k1", text: "frugal with tokens" },
    ]);
  });

  it("parses the {results:[...]} object form", () => {
    const json = { results: [{ id: "r1", memory: "found via results" }] };
    expect(parseMemantoMemories(json)).toEqual<MemantoMemory[]>([
      { id: "r1", text: "found via results" },
    ]);
  });

  it("aliases text|memory|content (text wins, then memory, then content)", () => {
    expect(parseMemantoMemories([{ id: "a", memory: "from memory field" }])).toEqual<MemantoMemory[]>([
      { id: "a", text: "from memory field" },
    ]);
    expect(parseMemantoMemories([{ id: "b", content: "from content field" }])).toEqual<MemantoMemory[]>([
      { id: "b", text: "from content field" },
    ]);
    expect(
      parseMemantoMemories([{ id: "c", text: "wins", memory: "ignored", content: "ignored too" }]),
    ).toEqual<MemantoMemory[]>([{ id: "c", text: "wins" }]);
    expect(
      parseMemantoMemories([{ id: "d", memory: "wins over content", content: "ignored" }]),
    ).toEqual<MemantoMemory[]>([{ id: "d", text: "wins over content" }]);
  });

  it("omits score when it is absent", () => {
    const out = parseMemantoMemories([{ id: "n", text: "no score" }]);
    expect(out[0]).toEqual({ id: "n", text: "no score" });
    expect(out[0]).not.toHaveProperty("score");
  });

  it("keeps the row but omits a non-finite score (Infinity → no score field)", () => {
    const out = parseMemantoMemories([{ id: "g", text: "inf", score: Number.POSITIVE_INFINITY }]);
    expect(out[0]).toEqual({ id: "g", text: "inf" });
    expect(out[0]).not.toHaveProperty("score");
  });

  it("drops a row whose score is NaN (zod rejects NaN as a number)", () => {
    expect(parseMemantoMemories([{ id: "g", text: "nan", score: Number.NaN }])).toEqual([]);
  });

  it("coerces a numeric id to a string", () => {
    expect(parseMemantoMemories([{ id: 42, text: "numeric id" }])).toEqual<MemantoMemory[]>([
      { id: "42", text: "numeric id" },
    ]);
  });

  it("drops rows with no text/memory/content field", () => {
    expect(parseMemantoMemories([{ id: "x", score: 0.5 }, { id: "y", text: "kept" }])).toEqual([
      { id: "y", text: "kept" },
    ]);
  });

  it("returns [] on a non-array / non-{memories}/{results} shape", () => {
    expect(parseMemantoMemories({ foo: 1 })).toEqual([]);
    expect(parseMemantoMemories("just a string")).toEqual([]);
    expect(parseMemantoMemories(42)).toEqual([]);
    expect(parseMemantoMemories(null)).toEqual([]);
    expect(parseMemantoMemories(undefined)).toEqual([]);
  });

  it("returns [] on garbage rows inside an otherwise-valid array (drops them)", () => {
    expect(parseMemantoMemories([42, null, "nope", { no: "id" }])).toEqual([]);
  });

  it("control-strips external memory text (no terminal escapes reach a prompt)", () => {
    const dirty = "safe\x1b[31mtext\x07end";
    const [memory] = parseMemantoMemories([{ id: "c", text: dirty }]);
    expect(memory?.text).toBe("safe[31mtextend");
    expect(memory?.text).not.toContain("\x1b");
    expect(memory?.text).not.toContain("\x07");
  });

  it("preserves tab and newline while stripping other control chars", () => {
    const [memory] = parseMemantoMemories([{ id: "t", text: "line1\nline2\tcol\x00nul" }]);
    expect(memory?.text).toBe("line1\nline2\tcolnul");
  });
});

describe("resolveMemantoMode", () => {
  it("returns 'mcp' when VANTA_MEMANTO_MODE=mcp (case/space-insensitive)", () => {
    expect(resolveMemantoMode({ VANTA_MEMANTO_MODE: "mcp" })).toBe("mcp");
    expect(resolveMemantoMode({ VANTA_MEMANTO_MODE: "  MCP " })).toBe("mcp");
  });

  it("defaults to 'rest' (local-first) when unset or anything else", () => {
    expect(resolveMemantoMode({})).toBe("rest");
    expect(resolveMemantoMode({ VANTA_MEMANTO_MODE: "rest" })).toBe("rest");
    expect(resolveMemantoMode({ VANTA_MEMANTO_MODE: "something" })).toBe("rest");
  });
});

describe("memantoEnabled", () => {
  it("is true when a local REST URL is configured (no key needed)", () => {
    expect(memantoEnabled({ VANTA_MEMANTO_URL: "http://localhost:8080" })).toBe(true);
  });

  it("is true in mcp mode when an MCP server is configured", () => {
    expect(
      memantoEnabled({ VANTA_MEMANTO_MODE: "mcp", VANTA_MEMANTO_MCP_SERVER: "memanto" }),
    ).toBe(true);
  });

  it("is false in mcp mode without a configured server", () => {
    expect(memantoEnabled({ VANTA_MEMANTO_MODE: "mcp" })).toBe(false);
    expect(memantoEnabled({ VANTA_MEMANTO_MODE: "mcp", VANTA_MEMANTO_MCP_SERVER: "  " })).toBe(false);
  });

  it("is false when nothing is configured", () => {
    expect(memantoEnabled({})).toBe(false);
    expect(memantoEnabled({ VANTA_MEMANTO_URL: "" })).toBe(false);
    expect(memantoEnabled({ VANTA_MEMANTO_URL: "   " })).toBe(false);
  });
});

describe("makeMemantoAdapter", () => {
  it("add routes the add body through call('add', …) and returns {ok:true}", async () => {
    const call = vi.fn<MemantoCall>(async () => ({}));
    const adapter = makeMemantoAdapter({ call });
    const res = await adapter.add("remember this");
    expect(res).toEqual({ ok: true });
    expect(call).toHaveBeenCalledWith("add", { text: "remember this" });
  });

  it("search routes the search body through call('search', …) and parses the result", async () => {
    const call = vi.fn<MemantoCall>(async () => ({
      memories: [{ id: "s1", text: "found", score: 0.8 }],
    }));
    const adapter = makeMemantoAdapter({ call });
    const out = await adapter.search("query");
    expect(out).toEqual<MemantoMemory[]>([{ id: "s1", text: "found", score: 0.8 }]);
    expect(call).toHaveBeenCalledWith("search", { query: "query" });
  });

  it("add returns {ok:false} (never throws) when call rejects", async () => {
    const call = vi.fn<MemantoCall>(async () => {
      throw new Error("endpoint down");
    });
    const adapter = makeMemantoAdapter({ call });
    await expect(adapter.add("x")).resolves.toEqual({ ok: false });
  });

  it("search returns [] (never throws) when call rejects", async () => {
    const call = vi.fn<MemantoCall>(async () => {
      throw new Error("mcp tool missing");
    });
    const adapter = makeMemantoAdapter({ call });
    await expect(adapter.search("q")).resolves.toEqual([]);
  });

  it("search returns [] when the backend replies with garbage (tolerant parse)", async () => {
    const call = vi.fn<MemantoCall>(async () => "not a list");
    const adapter = makeMemantoAdapter({ call });
    await expect(adapter.search("q")).resolves.toEqual([]);
  });
});

describe("wiring note — local-first memory behind the memory port", () => {
  // Documents (and locks via test) the recall-routing point. memory/provider.ts
  // `resolveMemoryProvider(env)` is the fork: when memanto ships, guarded by
  // memantoEnabled(env), it reads resolveMemantoMode(env) and builds `call` as
  // EITHER a localhost REST fetch (rest mode, no Authorization header — no key)
  // OR a routed mounted-MCP tool call (mcp mode), then routes remember/recall
  // through makeMemantoAdapter. A failed/absent backend → the adapter's
  // errors-as-values fallback, so the resolver keeps local memory.
  it("the adapter's only dependency is the injected call — no key anywhere", () => {
    // makeMemantoAdapter's sole dependency is `call`. Local-first: there is no key
    // parameter in this module's public surface; the only config (a localhost URL
    // or an MCP server name) lives in the closure built at the wire point.
    const call = vi.fn<MemantoCall>(async () => []);
    const adapter = makeMemantoAdapter({ call });
    expect(typeof adapter.add).toBe("function");
    expect(typeof adapter.search).toBe("function");
  });
});
