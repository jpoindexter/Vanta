import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  trimMessages,
  compressMessages,
  compactConversation,
  sanitizeMessages,
} from "./context.js";
import type { Message } from "./types.js";

function manyMessages(): Message[] {
  const msgs: Message[] = [{ role: "system", content: "sys" }];
  for (let i = 0; i < 40; i++) {
    msgs.push({ role: "user", content: `message ${i} `.repeat(50) });
  }
  return msgs;
}

describe("compactConversation (persistent auto-compaction)", () => {
  const summarize = async () => "the user worked through many steps";

  it("does not compact when under threshold", async () => {
    const msgs = manyMessages();
    const r = await compactConversation(msgs, 1_000_000, summarize); // huge window
    expect(r.compacted).toBe(false);
    expect(r.dropped).toBe(0);
    expect(r.messages).toBe(msgs); // same reference — caller keeps the originals
  });

  it("compacts over threshold: shrinks, keeps system+head+tail, one summary note, no injections", async () => {
    const msgs = manyMessages(); // 41 msgs, ~6k tokens
    const r = await compactConversation(msgs, 1000, summarize, { thresholdPct: 75 });
    expect(r.compacted).toBe(true);
    expect(r.dropped).toBeGreaterThan(0);
    expect(r.messages.length).toBeLessThan(msgs.length); // actually smaller
    expect(r.messages[0]).toEqual({ role: "system", content: "sys" }); // system kept at head
    const summaryNotes = r.messages.filter((m) => m.content.startsWith("[Summary of"));
    expect(summaryNotes).toHaveLength(1);
    // No transient injections persisted:
    expect(r.messages.some((m) => m.content.includes("Active goal"))).toBe(false);
    expect(r.messages.some((m) => m.content.includes("consider /compress"))).toBe(false);
  });

  it("returns not-compacted (originals) when the summarizer throws", async () => {
    const msgs = manyMessages();
    const boom = async () => { throw new Error("no summary"); };
    const r = await compactConversation(msgs, 1000, boom, { thresholdPct: 75 });
    expect(r.compacted).toBe(false);
    expect(r.messages).toBe(msgs);
  });
});

describe("trimMessages", () => {
  it("returns messages unchanged when under threshold", () => {
    const msgs: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ];
    expect(trimMessages(msgs, 100_000)).toEqual(msgs);
  });

  it("trims the middle but keeps system, head, and tail", () => {
    const msgs: Message[] = [{ role: "system", content: "sys" }];
    for (let i = 0; i < 40; i++) {
      msgs.push({ role: "user", content: `message ${i} `.repeat(50) });
    }
    const trimmed = trimMessages(msgs, 1000, { protectFirst: 3, protectLast: 6 });
    expect(trimmed.length).toBeLessThan(msgs.length);
    expect(trimmed[0]).toEqual({ role: "system", content: "sys" });
    expect(trimmed.some((m) => m.content.includes("trimmed to fit"))).toBe(true);
  });

  it("does not start the tail on an orphaned tool result", () => {
    const msgs: Message[] = [{ role: "system", content: "s" }];
    for (let i = 0; i < 20; i++) {
      msgs.push({ role: "assistant", content: "x".repeat(400) });
    }
    msgs.push({ role: "tool", toolCallId: "t1", name: "read_file", content: "y".repeat(400) });
    const trimmed = trimMessages(msgs, 500, { protectFirst: 2, protectLast: 1 });
    const firstNonSystem = trimmed.find((m) => m.role !== "system" && !m.content.includes("trimmed"));
    expect(firstNonSystem?.role).not.toBe("tool");
  });

  it("estimateTokens grows with content", () => {
    const small = estimateTokens([{ role: "user", content: "hi" }]);
    const big = estimateTokens([{ role: "user", content: "x".repeat(4000) }]);
    expect(big).toBeGreaterThan(small);
  });
});

describe("compressMessages", () => {
  it("returns messages unchanged when under threshold", async () => {
    const msgs: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ];
    const result = await compressMessages(msgs, 100_000, async () => "summary");
    expect(result).toEqual(msgs);
  });

  it("inserts the summary note and preserves head and tail", async () => {
    const msgs = manyMessages();
    const summarize = async () => "the user worked through 30 steps";
    const result = await compressMessages(msgs, 1000, summarize, {
      protectFirst: 3,
      protectLast: 6,
    });
    expect(result.length).toBeLessThan(msgs.length);
    expect(result[0]).toEqual({ role: "system", content: "sys" });
    const note = result.find((m) => m.content.includes("[Summary of"));
    expect(note?.content).toContain("the user worked through 30 steps");
    // Head (first non-system) and tail (last message) are preserved verbatim.
    expect(result[1]).toEqual(msgs[1]);
    expect(result[result.length - 1]).toEqual(msgs[msgs.length - 1]);
  });

  it("injects active goal note right after system messages when activeGoalText is set", async () => {
    const msgs = manyMessages();
    const result = await compressMessages(msgs, 1000, async () => "summary", {
      protectFirst: 3,
      protectLast: 6,
      activeGoalText: "ship the EF pebbles",
    });
    expect(result[0]?.role).toBe("system");
    const goalMsg = result[1];
    expect(goalMsg?.content).toContain("ship the EF pebbles");
    expect(goalMsg?.content).toContain("Active goal");
  });

  it("does not inject a goal note when activeGoalText is absent", async () => {
    const msgs = manyMessages();
    const result = await compressMessages(msgs, 1000, async () => "summary", {
      protectFirst: 3,
      protectLast: 6,
    });
    expect(result.every((m) => !m.content.includes("Active goal"))).toBe(true);
  });

  it("re-injects the session scratchpad interior on compaction without displacing index 1", async () => {
    const msgs = manyMessages();
    const result = await compressMessages(msgs, 1000, async () => "summary", {
      protectFirst: 3,
      protectLast: 6,
      activeGoalText: "ship card 1",
      sessionMemory: "- **Now** wiring the injection",
    });
    // goal note still owns index 1 (pinned invariant)
    expect(result[1]?.content).toContain("Active goal");
    const scratch = result.find((m) => m.content.includes("Session notes"));
    expect(scratch?.content).toContain("wiring the injection");
  });

  it("does not inject a session note when sessionMemory is absent or blank", async () => {
    const msgs = manyMessages();
    const result = await compressMessages(msgs, 1000, async () => "summary", { sessionMemory: "   " });
    expect(result.every((m) => !m.content.includes("Session notes"))).toBe(true);
  });

  it("falls back to a trimmed result when the summarizer throws", async () => {
    const msgs = manyMessages();
    const summarize = async (): Promise<string> => {
      throw new Error("provider down");
    };
    const result = await compressMessages(msgs, 1000, summarize, {
      protectFirst: 3,
      protectLast: 6,
    });
    expect(result.some((m) => m.content.includes("trimmed to fit"))).toBe(true);
    expect(result.some((m) => m.content.includes("[Summary of"))).toBe(false);
  });
});

describe("sanitizeMessages", () => {
  it("drops an orphaned tool result (no matching assistant tool_call)", () => {
    const msgs: Message[] = [
      { role: "system", content: "s" },
      { role: "user", content: "hi" },
      { role: "tool", toolCallId: "ghost", name: "read_file", content: "stale" },
    ];
    const out = sanitizeMessages(msgs);
    expect(out.some((m) => m.role === "tool")).toBe(false);
    expect(out).toHaveLength(2);
  });

  it("keeps a tool result whose assistant tool_call is present", () => {
    const msgs: Message[] = [
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_file", arguments: {} }] },
      { role: "tool", toolCallId: "c1", name: "read_file", content: "ok" },
    ];
    const out = sanitizeMessages(msgs);
    expect(out).toHaveLength(2);
    expect(out[1]?.role).toBe("tool");
  });

  it("strips lone unicode surrogates from content", () => {
    const msgs: Message[] = [{ role: "user", content: `clean\uD800text` }];
    const out = sanitizeMessages(msgs);
    expect(out[0]?.content).toBe("cleantext");
  });

  it("preserves valid surrogate pairs (emoji)", () => {
    const msgs: Message[] = [{ role: "user", content: "ship it 🚀" }];
    expect(sanitizeMessages(msgs)[0]?.content).toBe("ship it 🚀");
  });
});
