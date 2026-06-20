import { describe, it, expect } from "vitest";
import {
  parseTrace,
  detectIssues,
  renderOverview,
  renderDetail,
  distillTrace,
} from "./distill.js";

/** Build one kernel-shaped events.jsonl line. */
function ev(ts: number, event: string): string {
  return JSON.stringify({ ts, event, h: "deadbeef" });
}

describe("parseTrace", () => {
  it("parses well-formed kernel event lines into 1-based trace lines", () => {
    const jsonl = [ev(100, "started run"), ev(101, "read_file ok")].join("\n");
    const lines = parseTrace(jsonl);
    expect(lines).toEqual([
      { lineNo: 1, ts: 100, event: "started run" },
      { lineNo: 2, ts: 101, event: "read_file ok" },
    ]);
  });

  it("is tolerant: skips malformed and blank lines but keeps physical line numbers", () => {
    const jsonl = [
      ev(1, "first"), // line 1
      "{not json", // line 2 — malformed, skipped
      "", // line 3 — blank, skipped
      "   ", // line 4 — whitespace, skipped
      JSON.stringify({ ts: 5 }), // line 5 — no `event`, skipped
      ev(6, "last"), // line 6
    ].join("\n");
    const lines = parseTrace(jsonl);
    expect(lines.map((l) => l.lineNo)).toEqual([1, 6]);
    expect(lines.map((l) => l.event)).toEqual(["first", "last"]);
  });

  it("tolerates a missing/non-numeric ts (defaults to 0)", () => {
    const lines = parseTrace(JSON.stringify({ event: "no ts here" }));
    expect(lines[0]).toMatchObject({ lineNo: 1, ts: 0, event: "no ts here" });
  });
});

describe("detectIssues", () => {
  it("detects an error issue and cites the exact line numbers", () => {
    const jsonl = [
      ev(1, "started"), // L1
      ev(2, "tool read_file: Error EACCES opening secret"), // L2
      ev(3, "continued"), // L3
      ev(4, "exception thrown in handler"), // L4
    ].join("\n");
    const issues = detectIssues(parseTrace(jsonl));
    const err = issues.find((i) => i.title.includes("error"));
    expect(err).toBeDefined();
    expect(err!.severity).toBe("high");
    expect(err!.sourceLines).toEqual([2, 4]);
  });

  it("detects a blocked/denied issue and cites its line", () => {
    const jsonl = [
      ev(1, "assess shell_cmd: rm -rf /"), // L1
      ev(2, "kernel blocked: destructive command denied"), // L2
    ].join("\n");
    const issues = detectIssues(parseTrace(jsonl));
    const blocked = issues.find((i) => i.title.includes("blocked"));
    expect(blocked).toBeDefined();
    expect(blocked!.sourceLines).toEqual([2]);
  });

  it("detects a repeated-event loop and cites every repeat", () => {
    const jsonl = [
      ev(1, "retrying fetch https://x"),
      ev(2, "retrying fetch https://x"),
      ev(3, "retrying fetch https://x"),
      ev(4, "done"),
    ].join("\n");
    const issues = detectIssues(parseTrace(jsonl));
    const loop = issues.find((i) => i.title.toLowerCase().includes("loop"));
    expect(loop).toBeDefined();
    expect(loop!.sourceLines).toEqual([1, 2, 3]);
  });

  it("detects a long gap between two timestamped events", () => {
    const jsonl = [ev(1000, "before pause"), ev(1000 + 600, "after pause")].join("\n");
    const issues = detectIssues(parseTrace(jsonl));
    const gap = issues.find((i) => i.title.includes("Long gap"));
    expect(gap).toBeDefined();
    expect(gap!.sourceLines).toEqual([1, 2]);
  });

  it("orders issues most-severe-first", () => {
    const jsonl = [
      ev(1, "retrying once"), // low: retry
      ev(2, "error happened"), // high: error
    ].join("\n");
    const issues = detectIssues(parseTrace(jsonl));
    expect(issues[0]!.severity).toBe("high");
  });

  it("returns no issues for a clean trace", () => {
    const jsonl = [ev(1, "started"), ev(2, "read_file ok"), ev(3, "finished")].join("\n");
    expect(detectIssues(parseTrace(jsonl))).toEqual([]);
  });
});

describe("renderOverview", () => {
  it("includes L<n> citations for each issue", () => {
    const issues = detectIssues(
      parseTrace([ev(1, "ok"), ev(2, "error boom"), ev(3, "blocked: denied")].join("\n")),
    );
    const md = renderOverview(issues);
    expect(md).toContain("# Trace distillation");
    expect(md).toContain("cites L2");
    expect(md).toContain("cites L3");
  });

  it("says no issues for a clean trace", () => {
    const md = renderOverview([]);
    expect(md).toContain("No issues detected");
    expect(md).toContain("clean");
  });
});

describe("renderDetail", () => {
  it("quotes the cited source lines with their L<n> numbers", () => {
    const lines = parseTrace([ev(1, "ok"), ev(2, "error: EACCES on /secret")].join("\n"));
    const issue = detectIssues(lines).find((i) => i.title.includes("error"))!;
    const md = renderDetail(issue, lines);
    expect(md).toContain("# 1 error event");
    expect(md).toContain("**L2**");
    expect(md).toContain("EACCES on /secret");
  });

  it("notes a cited line that is missing from the trace", () => {
    const lines = parseTrace(ev(1, "only line"));
    const md = renderDetail({ title: "synthetic", severity: "low", sourceLines: [99] }, lines);
    expect(md).toContain("**L99**: (line not found)");
  });
});

describe("distillTrace", () => {
  it("produces an overview plus one detail body per issue, all sourced", () => {
    const jsonl = [
      ev(1, "started"),
      ev(2, "error: provider 500"),
      ev(3, "retrying request"),
      ev(4, "retrying request"),
      ev(5, "retrying request"),
    ].join("\n");
    const { overview, details } = distillTrace(jsonl);
    const issues = detectIssues(parseTrace(jsonl));
    expect(details).toHaveLength(issues.length);
    expect(details.length).toBeGreaterThanOrEqual(2); // error + loop
    expect(overview).toContain("issue(s) detected");
    for (const detail of details) expect(detail).toMatch(/\bL\d+\b/); // every detail cites a line
  });

  it("clean trace → overview says no issues, no details", () => {
    const { overview, details } = distillTrace([ev(1, "started"), ev(2, "finished ok")].join("\n"));
    expect(details).toEqual([]);
    expect(overview).toContain("No issues detected");
  });

  it("tolerates a trace with malformed lines without throwing", () => {
    const { overview } = distillTrace(["garbage", ev(1, "error real"), "{broken"].join("\n"));
    expect(overview).toContain("error");
  });
});
