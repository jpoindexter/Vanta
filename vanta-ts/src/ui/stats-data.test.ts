import { describe, it, expect } from "vitest";
import { aggregateStats, EMPTY_STATS } from "./stats-data.js";
import type { SessionMeta } from "../sessions/store.js";

const session = (overrides: Partial<SessionMeta> = {}): SessionMeta => ({
  id: "20260619-1",
  title: "a session",
  started: "2026-06-19T00:00:00.000Z",
  updated: "2026-06-19T00:00:00.000Z",
  turns: 3,
  ...overrides,
});

// A tool-call event line as the agent loop writes it (`name: output`).
const toolEvent = (name: string, out = "ok"): string => JSON.stringify({ ts: 1, event: `${name}: ${out}`, h: "x" });
const configEvent = (model: string, promptChars: number): string =>
  JSON.stringify({ kind: "session_config", ts: "t", provider: "p", model, promptChars });

describe("aggregateStats — pure usage aggregation", () => {
  it("counts sessions and sums turns", () => {
    const stats = aggregateStats([session({ turns: 3 }), session({ id: "b", turns: 5 })], []);
    expect(stats.sessions).toBe(2);
    expect(stats.turns).toBe(8);
  });

  it("counts tool calls and ranks top tools highest-first", () => {
    const lines = [toolEvent("read_file"), toolEvent("read_file"), toolEvent("write_file"), toolEvent("read_file")];
    const stats = aggregateStats([], lines);
    expect(stats.toolCalls).toBe(4);
    expect(stats.topTools[0]).toEqual({ name: "read_file", count: 3 });
    expect(stats.topTools[1]).toEqual({ name: "write_file", count: 1 });
  });

  it("ignores prose event lines that aren't tool-call shaped", () => {
    const lines = [
      JSON.stringify({ ts: 1, event: "Stop: session ended", h: "x" }), // capitalized prose prefix → not a tool
      JSON.stringify({ ts: 1, event: "no colon here", h: "x" }),
      toolEvent("shell_cmd"),
    ];
    const stats = aggregateStats([], lines);
    expect(stats.toolCalls).toBe(1);
    expect(stats.topTools).toEqual([{ name: "shell_cmd", count: 1 }]);
  });

  it("estimates tokens + cost from session_config lines with a priced model", () => {
    // 4000 promptChars / 4 = 1000 tokens; claude-sonnet input price is $3/1M = $0.003.
    const stats = aggregateStats([], [configEvent("claude-sonnet-4-6", 4000)]);
    expect(stats.tokens).toBe(1000);
    expect(stats.costUsd).toBeCloseTo(0.003, 6);
  });

  it("leaves cost null when no priced model was seen but still sums tokens", () => {
    const stats = aggregateStats([], [configEvent("some-local-model", 8000)]);
    expect(stats.tokens).toBe(2000);
    expect(stats.costUsd).toBeNull();
  });

  it("skips malformed JSON lines without throwing", () => {
    const lines = ["not json {", "", toolEvent("glob_files")];
    const stats = aggregateStats([], lines);
    expect(stats.toolCalls).toBe(1);
  });

  it("returns the empty shape for no data", () => {
    expect(aggregateStats([], [])).toEqual(EMPTY_STATS);
  });

  it("caps top tools at 8", () => {
    const lines = Array.from({ length: 12 }, (_, i) => toolEvent(`tool_${String.fromCharCode(97 + i)}`));
    const stats = aggregateStats([], lines);
    expect(stats.topTools).toHaveLength(8);
    expect(stats.toolCalls).toBe(12);
  });
});
