import { describe, it, expect } from "vitest";
import { contextSuggestions, kTok } from "./context-suggestions.js";
import type { Message } from "../types.js";

// ~4 chars/token. With window=2000, 8000 chars = 100% fill
// (70% = 5600 chars, 85% = 6800 chars).
const WINDOW = 2000;
const toolMsg = (name: string, chars: number): Message => ({
  role: "tool",
  toolCallId: `${name}-${chars}`,
  name,
  content: "x".repeat(chars),
});

describe("contextSuggestions", () => {
  it("returns [] when fill is below 70%", () => {
    // 4000 chars = 1000 tok = 50% of a 2000-token window.
    const msgs = [toolMsg("shell_cmd", 4000)];
    expect(contextSuggestions(msgs, WINDOW)).toEqual([]);
  });

  it("names the tool group with a token estimate and includes a /compress entry at ≥70%", () => {
    // 6000 chars total (1500 tok) = 75% fill → above 70%, below 85% → info.
    const msgs = [toolMsg("shell_cmd", 2000), toolMsg("shell_cmd", 4000)];
    const out = contextSuggestions(msgs, WINDOW);

    const group = out.find((s) => s.text.includes("shell_cmd"));
    expect(group).toBeDefined();
    expect(group?.text).toMatch(/Remove 2 shell_cmd outputs \(~\dk tokens\)/);
    expect(group?.savedTokens).toBe(1500); // (2000+4000)/4
    expect(group?.severity).toBe("info");

    expect(out.some((s) => s.text.includes("/compress"))).toBe(true);
  });

  it("escalates severity to warning at ≥85% fill", () => {
    // 7000 chars (1750 tok) = 87.5% fill → warning.
    const msgs = [toolMsg("read_file", 7000)];
    const out = contextSuggestions(msgs, WINDOW);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((s) => s.severity === "warning")).toBe(true);
  });

  it("groups distinct tool names and sorts by tokens freed, descending", () => {
    // 5600 chars = 1400 tok = exactly 70% fill (the boundary is inclusive).
    const msgs = [
      toolMsg("read_file", 4400), // 1100 tok
      toolMsg("shell_cmd", 6000), // 1500 tok
      toolMsg("web_fetch", 1200), // 300 tok — below the 1k floor, dropped
    ];
    const out = contextSuggestions(msgs, WINDOW);
    const groups = out.filter((s) => s.savedTokens > 0);
    expect(groups.map((s) => s.savedTokens)).toEqual([1500, 1100]); // desc
    expect(out.some((s) => s.text.includes("web_fetch"))).toBe(false); // under floor
    expect(out.at(-1)?.text).toContain("/compress"); // /compress last (savedTokens 0)
  });

  it("skips tool groups below the 1k-token floor (no ~0k noise)", () => {
    // A big user message pushes fill over 70%; the lone tool output is under the floor.
    const msgs: Message[] = [
      { role: "user", content: "y".repeat(5200) }, // 1300 tok; +200 tool = 1500 tok = 75% fill, info band
      toolMsg("grep_files", 800), // 200 tok — under the 1k floor
    ];
    const out = contextSuggestions(msgs, WINDOW);
    expect(out.some((s) => s.text.includes("grep_files"))).toBe(false);
    expect(out).toEqual([
      { severity: "info", text: "Run /compress to compact the whole conversation", savedTokens: 0 },
    ]);
  });
});

describe("kTok", () => {
  it("floors to whole thousands", () => {
    expect(kTok(4123)).toBe("4k");
    expect(kTok(999)).toBe("0k");
    expect(kTok(12000)).toBe("12k");
  });
});
