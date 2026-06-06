import { describe, it, expect } from "vitest";
import {
  detectWmMode,
  nextWmManipState,
  shouldAlertWmManip,
  buildWmManipText,
  DEFAULT_MANIP_THRESHOLD,
} from "./wm-manip.js";
import type { Message } from "../types.js";

const user = (content: string): Message => ({ role: "user", content });
const assistant = (toolNames: string[]): Message => ({
  role: "assistant",
  content: "",
  toolCalls: toolNames.map((name, i) => ({ id: `t${i}`, name, arguments: {} })),
});

describe("detectWmMode", () => {
  it("returns none when no tool calls", () => {
    expect(detectWmMode([user("hi"), { role: "assistant", content: "ok" }])).toBe("none");
  });

  it("returns manipulation when brain tool is called", () => {
    expect(detectWmMode([user("hi"), assistant(["brain"])])).toBe("manipulation");
  });

  it("returns manipulation when write_skill is called", () => {
    expect(detectWmMode([user("hi"), assistant(["write_skill"])])).toBe("manipulation");
  });

  it("returns maintenance when only recall is called", () => {
    expect(detectWmMode([user("hi"), assistant(["recall"])])).toBe("maintenance");
  });

  it("returns manipulation when both read and write tools present", () => {
    expect(detectWmMode([user("hi"), assistant(["recall", "brain"])])).toBe("manipulation");
  });

  it("stops at the user message boundary", () => {
    const msgs: Message[] = [
      user("turn1"),
      assistant(["brain"]),
      user("turn2"),
      assistant(["read_file"]),
    ];
    expect(detectWmMode(msgs)).toBe("maintenance");
  });
});

describe("nextWmManipState + shouldAlertWmManip", () => {
  it("increments on manipulation turns", () => {
    let s = { manipTurns: 0 };
    s = nextWmManipState(s, "manipulation");
    s = nextWmManipState(s, "manipulation");
    expect(s.manipTurns).toBe(2);
  });

  it("resets on non-manipulation turns", () => {
    let s = { manipTurns: 2 };
    s = nextWmManipState(s, "none");
    expect(s.manipTurns).toBe(0);
  });

  it("alerts at threshold", () => {
    expect(shouldAlertWmManip({ manipTurns: DEFAULT_MANIP_THRESHOLD })).toBe(true);
    expect(shouldAlertWmManip({ manipTurns: DEFAULT_MANIP_THRESHOLD - 1 })).toBe(false);
  });

  it("disabled when threshold is 0", () => {
    expect(shouldAlertWmManip({ manipTurns: 999 }, 0)).toBe(false);
  });
});

describe("buildWmManipText", () => {
  it("mentions the turn count and asks for concrete output", () => {
    const text = buildWmManipText(3);
    expect(text).toContain("3 consecutive");
    expect(text).toContain("concrete output");
  });
});
