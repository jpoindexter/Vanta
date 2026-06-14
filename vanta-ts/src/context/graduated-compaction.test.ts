import { describe, expect, it } from "vitest";
import type { Message } from "../types.js";
import { estimateTokens } from "../context.js";
import { graduatedCompaction } from "./graduated-compaction.js";

function overBudgetMessages(): Message[] {
  const msgs: Message[] = [{ role: "system", content: "sys" }];
  msgs.push({ role: "assistant", content: "", toolCalls: [{ id: "t1", name: "read_file", arguments: {} }] });
  msgs.push({ role: "tool", toolCallId: "t1", name: "read_file", content: "tool-output ".repeat(2000) });
  for (let i = 0; i < 24; i++) msgs.push({ role: "user", content: `message ${i} `.repeat(300) });
  return msgs;
}

describe("graduatedCompaction", () => {
  it("returns unchanged messages when already under budget", async () => {
    const msgs: Message[] = [{ role: "system", content: "s" }, { role: "user", content: "hi" }];
    const r = await graduatedCompaction(msgs, { contextWindow: 100_000 });
    expect(r.messages).toBe(msgs);
    expect(r.layers).toEqual([]);
    expect(r.beforeTokens).toBe(r.afterTokens);
  });

  it("applies cheap layers before summarizing and reduces the payload", async () => {
    const msgs = overBudgetMessages();
    const summaryInputs: Message[][] = [];
    const r = await graduatedCompaction(msgs, {
      contextWindow: 1_000,
      thresholdPct: 75,
      summarize: async (mid) => {
        summaryInputs.push(mid);
        return "compressed middle";
      },
    });
    expect(r.layers.slice(0, 3)).toEqual(["budget-reduction", "snip", "microcompact"]);
    expect(r.layers).toContain("context-collapse");
    expect(summaryInputs).toHaveLength(1);
    expect(r.afterTokens).toBeLessThan(r.beforeTokens);
    expect(estimateTokens(msgs)).toBe(r.beforeTokens); // base transcript stays reconstructable
  });

  it("falls back to final trim when no summarizer is available", async () => {
    const r = await graduatedCompaction(overBudgetMessages(), { contextWindow: 1_000, thresholdPct: 75 });
    expect(r.layers).toContain("trim");
    expect(r.messages.some((m) => m.content.includes("trimmed to fit context"))).toBe(true);
  });
});
