import { describe, it, expect } from "vitest";
import type { Message } from "../types.js";
import { estTokens } from "../compress/types.js";
import { trimMessages } from "../context.js";
import { summarizePrunedTools, buildPruneSummaryNote } from "./prune-summary.js";

function toolMsg(name: string, content: string): Message {
  return { role: "tool", toolCallId: `id-${name}-${content.length}`, name, content };
}

describe("summarizePrunedTools", () => {
  it("counts dropped tool results per tool name", () => {
    const pruned: Message[] = [
      toolMsg("read_file", "alpha"),
      toolMsg("read_file", "beta"),
      toolMsg("read_file", "gamma"),
      toolMsg("shell_cmd", "ran a command"),
      toolMsg("shell_cmd", "ran another"),
    ];
    const { toolCounts } = summarizePrunedTools(pruned);
    expect(toolCounts).toEqual({ read_file: 3, shell_cmd: 2 });
  });

  it("estimates freed tokens via estTokens over tool-result content", () => {
    const a = "a".repeat(80);
    const b = "b".repeat(40);
    const pruned: Message[] = [toolMsg("read_file", a), toolMsg("shell_cmd", b)];
    const { freedTokens } = summarizePrunedTools(pruned);
    expect(freedTokens).toBe(estTokens(a) + estTokens(b));
    expect(freedTokens).toBeGreaterThan(0);
  });

  it("aggregates only tool-result messages, ignoring other roles", () => {
    const pruned: Message[] = [
      { role: "system", content: "setup" },
      { role: "user", content: "do the thing" },
      { role: "assistant", content: "on it" },
      toolMsg("grep", "match"),
    ];
    const summary = summarizePrunedTools(pruned);
    expect(summary.toolCounts).toEqual({ grep: 1 });
  });

  it("returns an empty aggregate when nothing was pruned", () => {
    expect(summarizePrunedTools([])).toEqual({ toolCounts: {}, freedTokens: 0 });
  });

  it("labels a tool result with a missing name as unknown", () => {
    const m = { role: "tool", toolCallId: "x", name: "", content: "out" } as Message;
    const summary = summarizePrunedTools([m]);
    expect(summary.toolCounts).toEqual({ unknown: 1 });
  });
});

describe("buildPruneSummaryNote", () => {
  it("returns null for an empty aggregate (nothing pruned = no note)", () => {
    expect(buildPruneSummaryNote({ toolCounts: {}, freedTokens: 0 })).toBeNull();
  });

  it("returns null when summarizing empty input end-to-end", () => {
    expect(buildPruneSummaryNote(summarizePrunedTools([]))).toBeNull();
  });

  it("names total count, the tools, and ~freed tokens for multiple tools", () => {
    const pruned: Message[] = [
      toolMsg("read_file", "x".repeat(2_000)),
      toolMsg("read_file", "y".repeat(2_000)),
      toolMsg("read_file", "z".repeat(800)),
      toolMsg("shell_cmd", "w".repeat(800)),
      toolMsg("shell_cmd", "v".repeat(800)),
    ];
    const note = buildPruneSummaryNote(summarizePrunedTools(pruned));
    expect(note).not.toBeNull();
    expect(note).toContain("pruned 5 earlier tool results");
    expect(note).toContain("3× read_file");
    expect(note).toContain("2× shell_cmd");
    expect(note).toContain("tokens freed");
    expect(note).toMatch(/~[\d.]+k tokens freed/);
  });

  it("orders the breakdown by count, highest first", () => {
    const pruned: Message[] = [
      toolMsg("read_file", "a"),
      toolMsg("shell_cmd", "b"),
      toolMsg("shell_cmd", "c"),
      toolMsg("shell_cmd", "d"),
    ];
    const note = buildPruneSummaryNote(summarizePrunedTools(pruned)) ?? "";
    expect(note.indexOf("3× shell_cmd")).toBeLessThan(note.indexOf("1× read_file"));
  });

  it("uses the singular form for a single dropped tool result", () => {
    const note = buildPruneSummaryNote(summarizePrunedTools([toolMsg("grep", "one match")]));
    expect(note).toContain("pruned 1 earlier tool result:");
    expect(note).not.toContain("tool results:");
    expect(note).toContain("1× grep");
  });

  it("collapses tools beyond the top three into a +N more suffix", () => {
    const pruned: Message[] = [
      toolMsg("read_file", "a"),
      toolMsg("read_file", "b"),
      toolMsg("shell_cmd", "c"),
      toolMsg("grep", "d"),
      toolMsg("glob", "e"),
      toolMsg("web_fetch", "f"),
    ];
    const note = buildPruneSummaryNote(summarizePrunedTools(pruned)) ?? "";
    expect(note).toContain("2× read_file");
    expect(note).toContain("+2 more");
  });

  it("renders sub-1k freed tokens as a bare count", () => {
    const note = buildPruneSummaryNote(summarizePrunedTools([toolMsg("grep", "x".repeat(40))]));
    expect(note).toMatch(/~\d+ tokens freed/);
    expect(note).not.toMatch(/k tokens freed/);
  });
});

describe("trimMessages prune-summary wiring", () => {
  it("emits a per-tool prune note when tool results are dropped", () => {
    const msgs: Message[] = [{ role: "system", content: "sys" }];
    for (let i = 0; i < 10; i++) {
      msgs.push({ role: "assistant", content: "x".repeat(400), toolCalls: [{ id: `c${i}`, name: "read_file", arguments: {} }] });
      msgs.push(toolMsg("read_file", "y".repeat(400)));
    }
    const trimmed = trimMessages(msgs, 500, { protectFirst: 2, protectLast: 2 });
    const note = trimmed.find((m) => m.content.includes("pruned") && m.content.includes("tool result"));
    expect(note).toBeDefined();
    expect(note?.content).toContain("× read_file");
    expect(note?.content).toContain("tokens freed");
  });

  it("emits no prune note when no tool results are in the dropped window", () => {
    const msgs: Message[] = [{ role: "system", content: "sys" }];
    for (let i = 0; i < 40; i++) msgs.push({ role: "user", content: `message ${i} `.repeat(50) });
    const trimmed = trimMessages(msgs, 1000, { protectFirst: 3, protectLast: 6 });
    expect(trimmed.some((m) => m.content.includes("trimmed to fit"))).toBe(true);
    expect(trimmed.some((m) => m.content.includes("pruned"))).toBe(false);
  });
});
