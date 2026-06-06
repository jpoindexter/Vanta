import { describe, it, expect } from "vitest";
import {
  isOutputTurn,
  nextGateState,
  shouldFireGate,
  extractLastTurnToolNames,
  buildGateText,
  DEFAULT_RESEARCH_GATE_TURNS,
} from "./research-gate.js";
import type { Message } from "../types.js";

describe("isOutputTurn", () => {
  it("returns true for write_file", () => {
    expect(isOutputTurn(["write_file"])).toBe(true);
  });
  it("returns true for roadmap_move", () => {
    expect(isOutputTurn(["roadmap_move"])).toBe(true);
  });
  it("returns true for shell_cmd", () => {
    expect(isOutputTurn(["shell_cmd"])).toBe(true);
  });
  it("returns false for read-only tools", () => {
    expect(isOutputTurn(["read_file", "web_search", "recall"])).toBe(false);
  });
  it("returns false for empty list", () => {
    expect(isOutputTurn([])).toBe(false);
  });
});

describe("nextGateState", () => {
  it("increments on non-output turn", () => {
    const s = nextGateState({ consecutiveTurns: 3 }, ["read_file"]);
    expect(s.consecutiveTurns).toBe(4);
  });
  it("resets to 0 on output turn", () => {
    const s = nextGateState({ consecutiveTurns: 7 }, ["write_file"]);
    expect(s.consecutiveTurns).toBe(0);
  });
  it("stays 0 on output turn from 0", () => {
    const s = nextGateState({ consecutiveTurns: 0 }, ["shell_cmd"]);
    expect(s.consecutiveTurns).toBe(0);
  });
});

describe("shouldFireGate", () => {
  it("fires when consecutiveTurns equals threshold", () => {
    expect(shouldFireGate({ consecutiveTurns: 8 }, 8)).toBe(true);
  });
  it("fires again at multiples of threshold", () => {
    expect(shouldFireGate({ consecutiveTurns: 16 }, 8)).toBe(true);
  });
  it("does not fire before threshold", () => {
    expect(shouldFireGate({ consecutiveTurns: 7 }, 8)).toBe(false);
  });
  it("does not fire when threshold is 0 (disabled)", () => {
    expect(shouldFireGate({ consecutiveTurns: 8 }, 0)).toBe(false);
  });
  it("does not fire at consecutiveTurns 0", () => {
    expect(shouldFireGate({ consecutiveTurns: 0 }, 8)).toBe(false);
  });
  it("default threshold is 8", () => {
    expect(DEFAULT_RESEARCH_GATE_TURNS).toBe(8);
  });
});

describe("extractLastTurnToolNames", () => {
  it("returns tool names from the last assistant message", () => {
    const messages: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "reading",
        toolCalls: [
          { id: "t1", name: "read_file", arguments: {} },
          { id: "t2", name: "web_search", arguments: {} },
        ],
      },
    ];
    expect(extractLastTurnToolNames(messages)).toEqual(["read_file", "web_search"]);
  });

  it("returns empty array when last assistant message has no tool calls", () => {
    const messages: Message[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello!" },
    ];
    expect(extractLastTurnToolNames(messages)).toEqual([]);
  });

  it("returns empty array for empty message list", () => {
    expect(extractLastTurnToolNames([])).toEqual([]);
  });
});

describe("buildGateText", () => {
  it("includes the turn count and offer to build", () => {
    const text = buildGateText(8, null);
    expect(text).toContain("8 research turns");
    expect(text).toContain("build now");
  });
  it("includes the active goal text when provided", () => {
    const text = buildGateText(8, { id: 1, text: "Ship Vanta v1", status: "active" });
    expect(text).toContain("Ship Vanta v1");
  });
});
