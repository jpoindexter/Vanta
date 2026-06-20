import { describe, it, expect } from "vitest";
import { search, searchTranscript, buildSnippet, formatSearchResults } from "./search-cmd.js";
import type { ReplCtx, SlashResult } from "./types.js";
import type { Message } from "../types.js";
import type { AgentOutcome } from "../agent.js";

const STUB_OUTCOME: AgentOutcome = {
  finalText: "",
  iterations: 0,
  stoppedReason: "done",
  toolIterations: 0,
};

// Minimal stub for ReplCtx — search only reads ctx.convo.messages.
function makeCtx(messages: Message[]): ReplCtx {
  return {
    convo: {
      messages,
      send: async () => STUB_OUTCOME,
      setProvider: () => {},
      setSessionMemory: () => {},
    },
    setup: {} as ReplCtx["setup"],
    dataDir: "/tmp/.vanta",
    state: { sessionId: "test", started: new Date().toISOString(), turnIndex: 0 },
    env: {},
    now: () => new Date(),
  };
}

const SYSTEM: Message = { role: "system", content: "You are Vanta." };

describe("searchTranscript", () => {
  it("finds matches across both user and assistant messages", () => {
    const msgs: Message[] = [
      SYSTEM,
      { role: "user", content: "tell me about rust" },
      { role: "assistant", content: "Rust is a systems language." },
      { role: "user", content: "what about python?" },
    ];
    const hits = searchTranscript(msgs, "rust");
    expect(hits.map((h) => h.role).sort()).toEqual(["assistant", "user"]);
    // The python turn must not appear.
    expect(hits.some((h) => h.snippet.toLowerCase().includes("python"))).toBe(false);
  });

  it("ranks by match count, then recency", () => {
    const msgs: Message[] = [
      SYSTEM,
      { role: "assistant", content: "go go go go" }, // index 1, 4 matches
      { role: "user", content: "go" }, // index 2, 1 match
      { role: "assistant", content: "go go" }, // index 3, 2 matches
    ];
    const hits = searchTranscript(msgs, "go");
    // Most matches first (index 1), then index 3 (2 matches), then index 2 (1 match).
    expect(hits.map((h) => h.index)).toEqual([1, 3, 2]);
  });

  it("breaks count ties by recency (later turn first)", () => {
    const msgs: Message[] = [
      SYSTEM,
      { role: "user", content: "alpha" }, // index 1
      { role: "assistant", content: "alpha" }, // index 2
      { role: "tool", toolCallId: "t", name: "x", content: "alpha" }, // index 3, skipped
      { role: "user", content: "alpha" }, // index 4
    ];
    const hits = searchTranscript(msgs, "alpha");
    // All count 1 → ordered by index descending; the tool turn is skipped.
    expect(hits.map((h) => h.index)).toEqual([4, 2, 1]);
  });

  it("skips system and tool messages", () => {
    const msgs: Message[] = [
      { role: "system", content: "secret system marker" },
      { role: "tool", toolCallId: "t", name: "x", content: "tool marker" },
      { role: "user", content: "user marker" },
    ];
    const hits = searchTranscript(msgs, "marker");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ role: "user", index: 2 });
  });

  it("returns [] for an empty / whitespace-only query", () => {
    const msgs: Message[] = [SYSTEM, { role: "user", content: "hello" }];
    expect(searchTranscript(msgs, "")).toEqual([]);
    expect(searchTranscript(msgs, "   ")).toEqual([]);
  });

  it("returns [] when nothing matches", () => {
    const msgs: Message[] = [SYSTEM, { role: "user", content: "hello world" }];
    expect(searchTranscript(msgs, "zzz")).toEqual([]);
  });

  it("is case-insensitive", () => {
    const msgs: Message[] = [SYSTEM, { role: "user", content: "HELLO there" }];
    expect(searchTranscript(msgs, "hello")).toHaveLength(1);
  });

  it("caps results at 10", () => {
    const msgs: Message[] = [SYSTEM];
    for (let i = 0; i < 25; i += 1) msgs.push({ role: "user", content: `match ${i}` });
    expect(searchTranscript(msgs, "match")).toHaveLength(10);
  });
});

describe("buildSnippet", () => {
  it("centers the match and brackets it", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const snippet = buildSnippet(text, "fox", 5);
    expect(snippet).toContain("[fox]");
    // radius 5 → both sides truncated → leading + trailing ellipsis.
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    // radius 5 → 5 chars each side of the match.
    expect(snippet).toBe("…rown [fox] jump…");
  });

  it("omits the lead ellipsis when the match is at the start", () => {
    const snippet = buildSnippet("fox at the start of the line here", "fox", 5);
    expect(snippet.startsWith("[fox]")).toBe(true);
  });

  it("collapses newlines and whitespace runs", () => {
    const snippet = buildSnippet("line one\n\n  needle  \tline three", "needle", 4);
    expect(snippet).not.toContain("\n");
    expect(snippet).not.toContain("\t");
    expect(snippet).toContain("[needle]");
  });

  it("caps the length when there is no match", () => {
    const snippet = buildSnippet("x".repeat(500), "nope");
    expect(snippet.length).toBeLessThanOrEqual(120);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("strips ANSI escape sequences from the snippet (no escape injection)", () => {
    const ESC = String.fromCharCode(27);
    const BEL = String.fromCharCode(7);
    // An attacker-controlled message smuggling a red-color SGR + clear-screen + OSC title.
    const malicious = `${ESC}[31mDANGER${ESC}[2J needle here ${ESC}]0;title${BEL} tail`;
    const snippet = buildSnippet(malicious, "needle", 8);
    expect(snippet).toContain("[needle]");
    expect(snippet).not.toContain(ESC);
    expect(snippet).not.toContain("[31m");
    expect(snippet).not.toContain("[2J");
    expect(snippet).not.toContain("0;title");
  });

  it("strips bare control characters", () => {
    const NUL = String.fromCharCode(0);
    const BEL = String.fromCharCode(7);
    const BS = String.fromCharCode(8);
    const snippet = buildSnippet(`a${NUL}b${BEL} needle ${BS}c`, "needle", 6);
    expect(snippet).toContain("[needle]");
    // eslint-disable-next-line no-control-regex
    expect(/[\u0000-\u001f\u007f-\u009f]/.test(snippet)).toBe(false);
  });
});

describe("formatSearchResults", () => {
  it("renders a compact ranked list", () => {
    const out = formatSearchResults(
      [
        { role: "user", index: 1, snippet: "…[rust]…" },
        { role: "assistant", index: 2, snippet: "[Rust] is…" },
      ],
      "rust",
    );
    expect(out).toContain("2 match(es) for \"rust\"");
    expect(out).toContain("[turn 1] user: …[rust]…");
    expect(out).toContain("[turn 2] assistant: [Rust] is…");
  });

  it("returns a clear no-matches line for an empty result set", () => {
    expect(formatSearchResults([], "ghost")).toBe('  no matches for "ghost"');
  });

  it("returns usage for an empty query", () => {
    expect(formatSearchResults([], "")).toBe("  usage: /search <query>");
  });

  it("sanitizes the echoed query so it cannot inject escapes", () => {
    const ESC = String.fromCharCode(27);
    const out = formatSearchResults([], `${ESC}[31mevil${ESC}[0m`);
    expect(out).not.toContain(ESC);
    expect(out).toContain("evil");
  });
});

describe("search handler", () => {
  async function run(arg: string, ctx: ReplCtx): Promise<SlashResult> {
    return search(arg, ctx);
  }

  it("returns ranked matches as output", async () => {
    const ctx = makeCtx([
      SYSTEM,
      { role: "user", content: "tell me about rust" },
      { role: "assistant", content: "Rust is great." },
    ]);
    const result = await run("rust", ctx);
    expect(result.output).toContain("2 match(es)");
    expect(result.output).toContain("[turn 1] user");
    expect(result.output).toContain("[turn 2] assistant");
  });

  it("returns a no-matches message when nothing matches", async () => {
    const ctx = makeCtx([SYSTEM, { role: "user", content: "hello" }]);
    const result = await run("zzz-no-match", ctx);
    expect(result.output).toBe('  no matches for "zzz-no-match"');
  });

  it("returns usage on an empty query", async () => {
    const ctx = makeCtx([SYSTEM, { role: "user", content: "hello" }]);
    const result = await run("", ctx);
    expect(result.output).toBe("  usage: /search <query>");
  });
});
