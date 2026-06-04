import { describe, it, expect } from "vitest";
import {
  countTopicsInLastTurn,
  shouldAnnotateScopeDelta,
  nextScopeDeltaState,
  buildScopeDeltaText,
  DEFAULT_SCOPE_DELTA_THRESHOLD,
} from "./scope-delta.js";
import type { Message } from "../types.js";

const sys: Message = { role: "system", content: "sys" };
const user = (content: string): Message => ({ role: "user", content });
const assistant = (toolNames: string[], paths?: string[]): Message => ({
  role: "assistant",
  content: "",
  toolCalls: toolNames.map((name, i) => ({
    id: `tc${i}`,
    name,
    arguments: paths?.[i] != null ? { path: paths[i] } : {},
  })),
});

describe("countTopicsInLastTurn", () => {
  it("returns 0 for empty messages", () => {
    expect(countTopicsInLastTurn([])).toBe(0);
  });

  it("returns 0 when no tool calls in last turn", () => {
    const msgs: Message[] = [sys, user("hi"), { role: "assistant", content: "hello" }];
    expect(countTopicsInLastTurn(msgs)).toBe(0);
  });

  it("counts a single write_file path as 1", () => {
    const msgs: Message[] = [
      sys,
      user("do it"),
      assistant(["write_file"], ["src/foo.ts"]),
    ];
    expect(countTopicsInLastTurn(msgs)).toBe(1);
  });

  it("deduplicates same path written twice", () => {
    const msgs: Message[] = [
      sys,
      user("do it"),
      assistant(["write_file", "write_file"], ["src/foo.ts", "src/foo.ts"]),
    ];
    expect(countTopicsInLastTurn(msgs)).toBe(1);
  });

  it("counts two distinct write_file paths as 2", () => {
    const msgs: Message[] = [
      sys,
      user("do it"),
      assistant(["write_file", "write_file"], ["src/foo.ts", "src/bar.ts"]),
    ];
    expect(countTopicsInLastTurn(msgs)).toBe(2);
  });

  it("counts write_file + web_search as 2 (1 path + 1 tool type)", () => {
    const msgs: Message[] = [
      sys,
      user("do it"),
      assistant(["write_file", "web_search"], ["src/foo.ts", undefined as unknown as string]),
    ];
    expect(countTopicsInLastTurn(msgs)).toBe(2);
  });

  it("deduplicates same non-file tool used twice", () => {
    const msgs: Message[] = [
      sys,
      user("do it"),
      assistant(["web_search", "web_search"]),
    ];
    expect(countTopicsInLastTurn(msgs)).toBe(1);
  });

  it("counts web_search + web_fetch as 2 distinct non-file tools", () => {
    const msgs: Message[] = [
      sys,
      user("do it"),
      assistant(["web_search", "web_fetch"]),
    ];
    expect(countTopicsInLastTurn(msgs)).toBe(2);
  });

  it("stops at the user message boundary", () => {
    const msgs: Message[] = [
      sys,
      user("first turn"),
      assistant(["write_file", "write_file"], ["src/a.ts", "src/b.ts"]),
      user("second turn"),
      assistant(["write_file"], ["src/c.ts"]),
    ];
    // Only the last turn's assistant block is counted
    expect(countTopicsInLastTurn(msgs)).toBe(1);
  });

  it("counts read_file paths alongside write_file", () => {
    const msgs: Message[] = [
      sys,
      user("do it"),
      assistant(
        ["read_file", "write_file", "write_file"],
        ["src/a.ts", "src/b.ts", "src/c.ts"],
      ),
    ];
    expect(countTopicsInLastTurn(msgs)).toBe(3);
  });

  it("counts a mix of files and tool types", () => {
    // 2 unique file paths + 2 unique non-file tools = 4
    const msgs: Message[] = [
      sys,
      user("do it"),
      assistant(
        ["write_file", "write_file", "web_search", "shell_cmd"],
        ["src/a.ts", "src/b.ts"],
      ),
    ];
    expect(countTopicsInLastTurn(msgs)).toBe(4);
  });
});

describe("shouldAnnotateScopeDelta", () => {
  it("returns false when count <= threshold", () => {
    expect(shouldAnnotateScopeDelta(3, 3)).toBe(false);
    expect(shouldAnnotateScopeDelta(2, 3)).toBe(false);
  });

  it("returns true when count > threshold", () => {
    expect(shouldAnnotateScopeDelta(4, 3)).toBe(true);
    expect(shouldAnnotateScopeDelta(10, 3)).toBe(true);
  });

  it("returns false when threshold is 0 (disabled)", () => {
    expect(shouldAnnotateScopeDelta(100, 0)).toBe(false);
  });

  it("uses DEFAULT_SCOPE_DELTA_THRESHOLD when omitted", () => {
    expect(shouldAnnotateScopeDelta(DEFAULT_SCOPE_DELTA_THRESHOLD + 1)).toBe(true);
    expect(shouldAnnotateScopeDelta(DEFAULT_SCOPE_DELTA_THRESHOLD)).toBe(false);
  });
});

describe("nextScopeDeltaState", () => {
  it("does not increment when count is at or below threshold", () => {
    const prev = { totalAnnotations: 0 };
    expect(nextScopeDeltaState(prev, 3, 3)).toEqual({ totalAnnotations: 0 });
    expect(nextScopeDeltaState(prev, 2, 3)).toEqual({ totalAnnotations: 0 });
  });

  it("increments when count exceeds threshold", () => {
    const prev = { totalAnnotations: 0 };
    expect(nextScopeDeltaState(prev, 4, 3)).toEqual({ totalAnnotations: 1 });
  });

  it("accumulates across multiple calls", () => {
    let state = { totalAnnotations: 0 };
    state = nextScopeDeltaState(state, 5, 3);
    state = nextScopeDeltaState(state, 2, 3); // below threshold — no increment
    state = nextScopeDeltaState(state, 6, 3);
    expect(state).toEqual({ totalAnnotations: 2 });
  });
});

describe("buildScopeDeltaText", () => {
  it("omits session note on first annotation", () => {
    expect(buildScopeDeltaText(5, 1)).toBe("· 5 topics this turn");
  });

  it("includes session note when totalAnnotations > 1", () => {
    expect(buildScopeDeltaText(6, 3)).toBe("· 6 topics this turn (3× this session)");
  });
});
