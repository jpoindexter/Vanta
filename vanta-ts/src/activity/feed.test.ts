import { describe, it, expect } from "vitest";
import { parseActivity, filterActivity, formatActivity, parseSince } from "./feed.js";
import { parseActivityArgs } from "../repl/activity-cmd.js";

const GATE = JSON.stringify({ kind: "gate", tool: "shell_cmd", action: "run `rm -rf /tmp/x`", risk: "ask", resolution: "denied" });
const JSONL = [
  `{"ts":1000,"event":"web_search: ok (5 results)"}`,
  `{"ts":2000,"event":${JSON.stringify(GATE)}}`,
  `{"ts":3000,"event":"plain note without a label prefix"}`,
  `not json at all`,
  `{"ts":4000,"event":"delegate: ok (15 chars)","h":"abc123"}`,
].join("\n");

describe("parseActivity", () => {
  it("classifies gate / tool / note items and skips malformed lines", () => {
    const items = parseActivity(JSONL);
    expect(items.map((i) => i.kind)).toEqual(["tool", "gate", "note", "tool"]);
    expect(items[0]).toMatchObject({ who: "web_search", what: "ok (5 results)" });
    expect(items[1]).toMatchObject({ who: "shell_cmd", risk: "ask", resolution: "denied" });
    expect(items[2]).toMatchObject({ who: "-", what: "plain note without a label prefix" });
  });
});

describe("filterActivity", () => {
  const items = parseActivity(JSONL);

  it("filters by who, kind, risk/resolution, since, and text", () => {
    expect(filterActivity(items, { who: "shell_cmd" })).toHaveLength(1);
    expect(filterActivity(items, { kind: "tool" })).toHaveLength(2);
    expect(filterActivity(items, { risk: "denied" })[0]?.who).toBe("shell_cmd");
    expect(filterActivity(items, { risk: "ask" })).toHaveLength(1);
    expect(filterActivity(items, { sinceTs: 2500 }).map((i) => i.ts)).toEqual([3000, 4000]);
    expect(filterActivity(items, { contains: "rm -rf" })).toHaveLength(1);
    expect(filterActivity(items, { who: "shell_cmd", risk: "blocked" })).toHaveLength(0);
  });
});

describe("parseSince", () => {
  const NOW = 10_000_000_000; // ms
  it("parses m/h/d and rejects junk", () => {
    expect(parseSince("30m", NOW)).toBe(10_000_000 - 1800);
    expect(parseSince("2h", NOW)).toBe(10_000_000 - 7200);
    expect(parseSince("3d", NOW)).toBe(10_000_000 - 259_200);
    expect(parseSince("soon", NOW)).toBeUndefined();
  });
});

describe("formatActivity", () => {
  it("renders glyphs for gate resolutions and caps with a hidden-count header", () => {
    const items = parseActivity(JSONL);
    const out = formatActivity(items, 2);
    expect(out).toContain("earlier matching event(s) hidden");
    expect(out.split("\n")).toHaveLength(3); // header + 2 lines
    const gateLine = formatActivity(items).split("\n").find((l) => l.includes("shell_cmd"));
    expect(gateLine).toContain("✗");
    expect(gateLine).toContain("[ask→denied]");
  });

  it("says so when nothing matches", () => {
    expect(formatActivity([])).toContain("no matching activity");
  });
});

describe("parseActivityArgs", () => {
  const NOW = 10_000_000_000;
  it("parses flags + free text", () => {
    const q = parseActivityArgs("--who shell_cmd --risk ask --since 2h --limit 5 rm -rf", NOW);
    expect(q.filter).toMatchObject({ who: "shell_cmd", risk: "ask", contains: "rm -rf", sinceTs: 10_000_000 - 7200 });
    expect(q.limit).toBe(5);
  });

  it("flags a malformed --since instead of silently ignoring it", () => {
    expect(parseActivityArgs("--since tuesday", NOW).badSince).toBe("tuesday");
  });
});
