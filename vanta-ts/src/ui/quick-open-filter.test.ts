import { describe, it, expect } from "vitest";
import {
  aggregateItems,
  fuzzyScore,
  fuzzyFilter,
  CATEGORY_ICON,
  type QuickItem,
} from "./quick-open-filter.js";
import type { SessionMeta } from "../sessions/store.js";
import type { Skill } from "../skills/types.js";

const session = (id: string, title: string): SessionMeta => ({ id, title, started: "", updated: "", turns: 1 });
const skill = (name: string, description: string): Skill => ({
  meta: { name, description, created: "", updated: "", tags: [] },
  body: "",
});

describe("aggregateItems", () => {
  it("flattens all four sources into one list with correct categories", () => {
    const items = aggregateItems({
      files: ["src/a.ts"],
      sessions: [session("20260619-101010", "fix the bug")],
      commands: [{ name: "help", desc: "show commands" }],
      skills: [skill("debug", "find bugs")],
    });
    expect(items.map((i) => i.category)).toEqual(["file", "session", "command", "skill"]);
  });

  it("maps each source to the slash command Enter runs", () => {
    const items = aggregateItems({
      files: ["src/a.ts"],
      sessions: [session("S1", "t")],
      commands: [{ name: "help", desc: "d" }],
      skills: [skill("debug", "d")],
    });
    expect(items.map((i) => i.command)).toEqual(["/open src/a.ts", "/resume S1", "/help", "/debug"]);
  });

  it("includes a command's arg in the label", () => {
    const [item] = aggregateItems({ commands: [{ name: "goal", arg: "<text>", desc: "set goal" }] });
    expect(item!.label).toBe("/goal <text>");
  });

  it("degrades gracefully when sources are empty or absent", () => {
    expect(aggregateItems({})).toEqual([]);
    expect(aggregateItems({ files: [], sessions: [], commands: [], skills: [] })).toEqual([]);
  });

  it("has a distinct icon per category", () => {
    const icons = new Set(Object.values(CATEGORY_ICON));
    expect(icons.size).toBe(4);
  });
});

describe("fuzzyScore", () => {
  it("matches a subsequence and returns a number", () => {
    expect(fuzzyScore("application.ts", "apts")).not.toBeNull();
  });

  it("returns null when chars are out of order or absent", () => {
    expect(fuzzyScore("abc", "cba")).toBeNull();
    expect(fuzzyScore("abc", "z")).toBeNull();
  });

  it("returns 0 for an empty query", () => {
    expect(fuzzyScore("anything", "")).toBe(0);
  });

  it("ranks a contiguous prefix match better (lower) than a scattered one", () => {
    const tight = fuzzyScore("readme", "rea")!;
    const loose = fuzzyScore("river-east-area", "rea")!;
    expect(tight).toBeLessThan(loose);
  });
});

describe("fuzzyFilter", () => {
  const items: QuickItem[] = [
    { category: "file", label: "src/agent.ts", command: "/open src/agent.ts" },
    { category: "command", label: "/resume", hint: "load a past session", command: "/resume" },
    { category: "skill", label: "debug", hint: "find bugs", command: "/debug" },
  ];

  it("returns all items (capped) for an empty query", () => {
    expect(fuzzyFilter(items, "")).toHaveLength(3);
  });

  it("filters to matching items only", () => {
    const out = fuzzyFilter(items, "agent");
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe("src/agent.ts");
  });

  it("matches against the hint as well as the label", () => {
    const out = fuzzyFilter(items, "session");
    expect(out.some((i) => i.command === "/resume")).toBe(true);
  });

  it("respects the limit", () => {
    const many: QuickItem[] = Array.from({ length: 30 }, (_, i) => ({
      category: "file" as const,
      label: `file${i}.ts`,
      command: `/open file${i}.ts`,
    }));
    expect(fuzzyFilter(many, "file", 5)).toHaveLength(5);
  });
});
