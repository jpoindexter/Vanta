import { describe, it, expect, vi } from "vitest";
import {
  buildMem0AddBody,
  buildMem0SearchBody,
  parseMem0Memories,
  mem0Enabled,
  makeMem0Adapter,
  MEM0_ADD_PATH,
  MEM0_SEARCH_PATH,
  MEM0_DEFAULT_USER,
  type Mem0Memory,
  type PostJson,
} from "./mem0-adapter.js";

// All pure / injected — no real network, no API key, no filesystem.

describe("buildMem0AddBody", () => {
  it("wraps text as a single user message scoped to the user", () => {
    expect(buildMem0AddBody("I prefer dark mode", "jason")).toEqual({
      messages: [{ role: "user", content: "I prefer dark mode" }],
      user_id: "jason",
    });
  });

  it("defaults the user_id to the default user", () => {
    expect(buildMem0AddBody("hello")).toEqual({
      messages: [{ role: "user", content: "hello" }],
      user_id: MEM0_DEFAULT_USER,
    });
  });
});

describe("buildMem0SearchBody", () => {
  it("builds a query body scoped to the user", () => {
    expect(buildMem0SearchBody("ui preferences", "jason")).toEqual({
      query: "ui preferences",
      user_id: "jason",
    });
  });

  it("defaults the user_id to the default user", () => {
    expect(buildMem0SearchBody("anything")).toEqual({
      query: "anything",
      user_id: MEM0_DEFAULT_USER,
    });
  });
});

describe("parseMem0Memories", () => {
  it("parses the bare-array form, keeping id/text/score", () => {
    const json = [
      { id: "m1", memory: "likes dark mode", score: 0.91 },
      { id: "m2", memory: "uses ESM", score: 0.42 },
    ];
    expect(parseMem0Memories(json)).toEqual<Mem0Memory[]>([
      { id: "m1", text: "likes dark mode", score: 0.91 },
      { id: "m2", text: "uses ESM", score: 0.42 },
    ]);
  });

  it("parses the {results:[...]} object form", () => {
    const json = { results: [{ id: "r1", memory: "frugal with tokens" }] };
    expect(parseMem0Memories(json)).toEqual<Mem0Memory[]>([
      { id: "r1", text: "frugal with tokens" },
    ]);
  });

  it("aliases a `text` field when `memory` is absent (memory wins when both present)", () => {
    expect(parseMem0Memories([{ id: "a", text: "from text field" }])).toEqual<Mem0Memory[]>([
      { id: "a", text: "from text field" },
    ]);
    expect(
      parseMem0Memories([{ id: "b", memory: "from memory", text: "ignored" }]),
    ).toEqual<Mem0Memory[]>([{ id: "b", text: "from memory" }]);
  });

  it("omits score when it is absent", () => {
    expect(parseMem0Memories([{ id: "n", memory: "no score" }])[0]).toEqual({
      id: "n",
      text: "no score",
    });
    expect(parseMem0Memories([{ id: "n", memory: "no score" }])[0]).not.toHaveProperty("score");
  });

  it("keeps the row but omits a non-finite score (Infinity → no score field)", () => {
    // zod accepts Infinity as a number, so the row parses; the Number.isFinite
    // guard then drops the unusable score while keeping the memory.
    const out = parseMem0Memories([{ id: "g", memory: "inf score", score: Number.POSITIVE_INFINITY }]);
    expect(out[0]).toEqual({ id: "g", text: "inf score" });
    expect(out[0]).not.toHaveProperty("score");
  });

  it("drops a row whose score is NaN (zod rejects NaN as a number)", () => {
    // A NaN score makes the row fail schema validation → dropped, never partial.
    expect(parseMem0Memories([{ id: "g", memory: "nan score", score: Number.NaN }])).toEqual([]);
  });

  it("coerces a numeric id to a string", () => {
    expect(parseMem0Memories([{ id: 42, memory: "numeric id" }])).toEqual<Mem0Memory[]>([
      { id: "42", text: "numeric id" },
    ]);
  });

  it("drops rows with neither a memory nor a text field", () => {
    expect(parseMem0Memories([{ id: "x", score: 0.5 }, { id: "y", memory: "kept" }])).toEqual([
      { id: "y", text: "kept" },
    ]);
  });

  it("returns [] on a non-array / non-{results} shape", () => {
    expect(parseMem0Memories({ foo: 1 })).toEqual([]);
    expect(parseMem0Memories("just a string")).toEqual([]);
    expect(parseMem0Memories(42)).toEqual([]);
    expect(parseMem0Memories(null)).toEqual([]);
    expect(parseMem0Memories(undefined)).toEqual([]);
  });

  it("returns [] on garbage rows inside an otherwise-valid array (drops them)", () => {
    expect(parseMem0Memories([42, null, "nope", { no: "id" }])).toEqual([]);
  });

  it("control-strips external memory text (no terminal escapes reach a prompt)", () => {
    // ESC + a bell char embedded in the returned memory — must be stripped.
    const dirty = "safe\x1b[31mtext\x07end";
    const [memory] = parseMem0Memories([{ id: "c", memory: dirty }]);
    expect(memory?.text).toBe("safe[31mtextend");
    expect(memory?.text).not.toContain("\x1b");
    expect(memory?.text).not.toContain("\x07");
  });

  it("preserves tab and newline while stripping other control chars", () => {
    const [memory] = parseMem0Memories([{ id: "t", memory: "line1\nline2\tcol\x00nul" }]);
    expect(memory?.text).toBe("line1\nline2\tcolnul");
  });
});

describe("mem0Enabled", () => {
  it("is true when the API key env var is present and non-blank", () => {
    expect(mem0Enabled({ VANTA_MEM0_API_KEY: "m0-secret" })).toBe(true);
  });

  it("is false when the key is absent or blank", () => {
    expect(mem0Enabled({})).toBe(false);
    expect(mem0Enabled({ VANTA_MEM0_API_KEY: "" })).toBe(false);
    expect(mem0Enabled({ VANTA_MEM0_API_KEY: "   " })).toBe(false);
  });
});

describe("makeMem0Adapter", () => {
  it("add posts the add body to the add path and returns {ok:true}", async () => {
    const postJson = vi.fn<PostJson>(async () => ({}));
    const adapter = makeMem0Adapter({ postJson, userId: "jason" });
    const res = await adapter.add("remember this");
    expect(res).toEqual({ ok: true });
    expect(postJson).toHaveBeenCalledWith(MEM0_ADD_PATH, {
      messages: [{ role: "user", content: "remember this" }],
      user_id: "jason",
    });
  });

  it("search posts the search body to the search path and parses the result", async () => {
    const postJson = vi.fn<PostJson>(async () => ({
      results: [{ id: "s1", memory: "found", score: 0.8 }],
    }));
    const adapter = makeMem0Adapter({ postJson, userId: "jason" });
    const out = await adapter.search("query");
    expect(out).toEqual<Mem0Memory[]>([{ id: "s1", text: "found", score: 0.8 }]);
    expect(postJson).toHaveBeenCalledWith(MEM0_SEARCH_PATH, { query: "query", user_id: "jason" });
  });

  it("defaults the user id when none is injected", async () => {
    const postJson = vi.fn<PostJson>(async () => ([]));
    const adapter = makeMem0Adapter({ postJson });
    await adapter.add("x");
    expect(postJson).toHaveBeenCalledWith(MEM0_ADD_PATH, {
      messages: [{ role: "user", content: "x" }],
      user_id: MEM0_DEFAULT_USER,
    });
  });

  it("add returns {ok:false} (never throws) when postJson rejects", async () => {
    const postJson = vi.fn<PostJson>(async () => {
      throw new Error("service down");
    });
    const adapter = makeMem0Adapter({ postJson });
    await expect(adapter.add("x")).resolves.toEqual({ ok: false });
  });

  it("search returns [] (never throws) when postJson rejects", async () => {
    const postJson = vi.fn<PostJson>(async () => {
      throw new Error("network down");
    });
    const adapter = makeMem0Adapter({ postJson });
    await expect(adapter.search("q")).resolves.toEqual([]);
  });

  it("search returns [] when the service replies with garbage (tolerant parse)", async () => {
    const postJson = vi.fn<PostJson>(async () => "not a list");
    const adapter = makeMem0Adapter({ postJson });
    await expect(adapter.search("q")).resolves.toEqual([]);
  });
});

describe("wiring note — service behind the memory port", () => {
  // Documents (and locks via test) the recall-routing point. memory/provider.ts
  // `resolveMemoryProvider(env)` is the fork: when mem0 ships, guarded by
  // mem0Enabled(env), it builds a real postJson (mem0 base URL + the
  // Authorization key header, constructed INSIDE the closure) and routes
  // remember/recall through makeMem0Adapter. A failed/absent service → the
  // adapter's errors-as-values fallback, so the resolver keeps local memory.
  it("the key is never an argument to the adapter — only the injected postJson is", () => {
    // makeMem0Adapter's only dependency is postJson (+ optional userId). There is
    // no key parameter anywhere in this module's public surface; the secret lives
    // solely in the postJson closure built at the wire point.
    const postJson = vi.fn<PostJson>(async () => []);
    const adapter = makeMem0Adapter({ postJson });
    expect(typeof adapter.add).toBe("function");
    expect(typeof adapter.search).toBe("function");
  });
});
