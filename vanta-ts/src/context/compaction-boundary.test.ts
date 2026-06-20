import { describe, it, expect } from "vitest";
import {
  splitsToolPair,
  alignBoundaryForward,
  alignBoundaryBackward,
  protectHeadTail,
  passSavings,
  shouldCompact,
} from "./compaction-boundary.js";
import type { Message } from "../types.js";

// Fixtures: a tool pair is an assistant-with-toolCalls immediately followed by
// the matching tool result(s).
function asst(id: string): Message {
  return { role: "assistant", content: "", toolCalls: [{ id, name: "read_file", arguments: {} }] };
}
function result(id: string): Message {
  return { role: "tool", toolCallId: id, name: "read_file", content: "ok" };
}
function user(text: string): Message {
  return { role: "user", content: text };
}

describe("splitsToolPair", () => {
  it("returns false for boundaries at or outside the array ends", () => {
    const msgs = [user("a"), asst("c1"), result("c1")];
    expect(splitsToolPair(msgs, 0)).toBe(false);
    expect(splitsToolPair(msgs, msgs.length)).toBe(false);
  });

  it("flags a cut that lands a tool result on the far side from its call", () => {
    const msgs = [user("a"), asst("c1"), result("c1"), user("b")];
    // Cutting at index 2 puts asst(c1) before and result(c1) at the cut.
    expect(splitsToolPair(msgs, 2)).toBe(true);
  });

  it("flags a cut after an assistant tool_call whose result follows", () => {
    const msgs = [asst("c1"), result("c1"), user("b")];
    // index 1 = right after the assistant call, before its result.
    expect(splitsToolPair(msgs, 1)).toBe(true);
  });

  it("does not flag a cut that leaves a full pair on one side", () => {
    const msgs = [user("a"), asst("c1"), result("c1"), user("b")];
    // index 3 keeps the whole pair on the near side.
    expect(splitsToolPair(msgs, 3)).toBe(false);
  });

  it("does not flag a cut between two plain messages", () => {
    const msgs = [user("a"), user("b"), user("c")];
    expect(splitsToolPair(msgs, 1)).toBe(false);
  });

  it("does not flag a dangling assistant call with no result anywhere", () => {
    // sanitize.ts handles dangling calls; a cut after one is not a 'split'.
    const msgs = [asst("c1"), user("b")];
    expect(splitsToolPair(msgs, 1)).toBe(false);
  });
});

describe("alignBoundaryForward", () => {
  it("advances past a split until the pair is whole on the near side", () => {
    const msgs = [user("a"), asst("c1"), result("c1"), user("b")];
    // Asking to cut at 2 (mid-pair) must move to 3 (pair intact).
    expect(alignBoundaryForward(msgs, 2, msgs.length)).toBe(3);
  });

  it("leaves an already-safe boundary unchanged", () => {
    const msgs = [user("a"), user("b"), asst("c1"), result("c1")];
    expect(alignBoundaryForward(msgs, 2, msgs.length)).toBe(2);
  });

  it("never advances past the supplied ceiling", () => {
    const msgs = [asst("c1"), result("c1"), user("b")];
    // index 1 splits, but max=1 forbids moving — returns the ceiling.
    expect(alignBoundaryForward(msgs, 1, 1)).toBe(1);
  });
});

describe("alignBoundaryBackward", () => {
  it("retreats off an orphaned tool result at the tail start", () => {
    const msgs = [user("a"), asst("c1"), result("c1"), user("b")];
    // Tail starting at index 2 begins on an orphaned result → pull back to 1.
    expect(alignBoundaryBackward(msgs, 2, 0)).toBe(1);
  });

  it("leaves an already-safe tail start unchanged", () => {
    const msgs = [user("a"), asst("c1"), result("c1"), user("b")];
    expect(alignBoundaryBackward(msgs, 3, 0)).toBe(3);
  });

  it("never retreats before the supplied floor", () => {
    const msgs = [asst("c1"), result("c1")];
    // index 1 splits, but floor=1 forbids retreating.
    expect(alignBoundaryBackward(msgs, 1, 1)).toBe(1);
  });
});

describe("protectHeadTail", () => {
  const tokenOf = (m: Message) => m.content.length;

  it("keeps a tool_call and its result together in a protected head", () => {
    // protectFirst=2 would cut between asst(c1) and result(c1); head must grow.
    const msgs = [user("u0"), asst("c1"), result("c1"), user("u3"), user("u4"), user("u5")];
    const { headEnd } = protectHeadTail(msgs, { protectFirst: 2, protectLast: 1, tailTokenBudget: 0 }, tokenOf);
    expect(headEnd).toBe(3); // extended forward past the result
    expect(msgs.slice(0, headEnd).some((m) => m.role === "tool")).toBe(true);
  });

  it("never starts the tail on an orphaned tool result", () => {
    const msgs = [user("u0"), user("u1"), asst("c1"), result("c1"), user("u4")];
    const { tailStart } = protectHeadTail(msgs, { protectFirst: 1, protectLast: 2, tailTokenBudget: 0 }, tokenOf);
    expect(msgs[tailStart]?.role).not.toBe("tool");
  });

  it("grows the tail by token budget beyond the count floor", () => {
    const msgs = Array.from({ length: 8 }, (_, i) => user("x".repeat(10) + i));
    // protectLast=1 by count, but a generous budget pulls more in.
    const { tailStart } = protectHeadTail(
      msgs,
      { protectFirst: 1, protectLast: 1, tailTokenBudget: 1000 },
      tokenOf,
    );
    expect(tailStart).toBeLessThan(msgs.length - 1); // more than 1 message in tail
  });

  it("respects a tiny token budget (count floor only)", () => {
    const msgs = Array.from({ length: 6 }, (_, i) => user("x".repeat(50) + i));
    const { tailStart } = protectHeadTail(
      msgs,
      { protectFirst: 1, protectLast: 2, tailTokenBudget: 0 },
      tokenOf,
    );
    expect(tailStart).toBe(msgs.length - 2); // exactly the count floor
  });

  it("never overlaps head and tail", () => {
    const msgs = [user("a"), user("b"), user("c")];
    const { headEnd, tailStart } = protectHeadTail(
      msgs,
      { protectFirst: 2, protectLast: 2, tailTokenBudget: 9999 },
      tokenOf,
    );
    expect(tailStart).toBeGreaterThanOrEqual(headEnd);
  });
});

describe("passSavings", () => {
  it("reports the fractional reduction", () => {
    expect(passSavings(1000, 800)).toBeCloseTo(0.2);
  });

  it("clamps a size increase to zero savings", () => {
    expect(passSavings(800, 1000)).toBe(0);
  });

  it("returns zero for a non-positive before-size", () => {
    expect(passSavings(0, 0)).toBe(0);
  });
});

describe("shouldCompact (anti-thrash)", () => {
  it("proceeds before a full low-savings window exists", () => {
    expect(shouldCompact({ recentSavings: [] })).toBe(true);
    expect(shouldCompact({ recentSavings: [0.02] })).toBe(true);
  });

  it("skips when the last two passes both saved under 10%", () => {
    expect(shouldCompact({ recentSavings: [0.05, 0.03] })).toBe(false);
  });

  it("proceeds when the most recent pass cleared the floor", () => {
    expect(shouldCompact({ recentSavings: [0.04, 0.25] })).toBe(true);
  });

  it("proceeds when an older pass was low but a recent one was high", () => {
    expect(shouldCompact({ recentSavings: [0.5, 0.02 ] })).toBe(true);
  });

  it("honors a custom floor and window", () => {
    // 20% floor, window 3: all three below 0.2 → skip.
    expect(shouldCompact({ recentSavings: [0.1, 0.15, 0.19], minSavings: 0.2, window: 3 })).toBe(false);
    // one of the last three cleared 0.2 → proceed.
    expect(shouldCompact({ recentSavings: [0.1, 0.25, 0.19], minSavings: 0.2, window: 3 })).toBe(true);
  });
});
