import { describe, it, expect } from "vitest";
import {
  parseMonitorPatterns,
  matchLine,
  accumulateMatch,
  emptyMonitorState,
  summarizeMonitor,
  type MonitorPattern,
} from "./monitor-match.js";

describe("parseMonitorPatterns", () => {
  it("turns a bare string into an alert pattern (label = pattern)", () => {
    expect(parseMonitorPatterns(["ERROR"])).toEqual([{ label: "ERROR", pattern: "ERROR", kind: "alert" }]);
  });

  it("validates an object spec and keeps label + kind", () => {
    const out = parseMonitorPatterns([{ label: "up", pattern: "Listening on", kind: "ready" }]);
    expect(out).toEqual([{ label: "up", pattern: "Listening on", kind: "ready" }]);
  });

  it("defaults an object's missing label to the pattern and missing kind to alert", () => {
    expect(parseMonitorPatterns([{ pattern: "WARN" }])).toEqual([{ label: "WARN", pattern: "WARN", kind: "alert" }]);
  });

  it("coerces an invalid kind to alert", () => {
    expect(parseMonitorPatterns([{ pattern: "x", kind: "boom" }])).toEqual([{ label: "x", pattern: "x", kind: "alert" }]);
  });

  it("drops garbage: empty string, whitespace, null, number, object without pattern", () => {
    const out = parseMonitorPatterns(["", "   ", null, 42, {}, { label: "no-pattern" }]);
    expect(out).toEqual([]);
  });

  it("drops an over-length pattern (ReDoS/abuse cap)", () => {
    expect(parseMonitorPatterns(["x".repeat(201)])).toEqual([]);
    expect(parseMonitorPatterns(["x".repeat(200)])).toHaveLength(1);
  });

  it("returns [] for a non-array input (no patterns = no matches)", () => {
    expect(parseMonitorPatterns(undefined)).toEqual([]);
    expect(parseMonitorPatterns("ERROR")).toEqual([]);
    expect(parseMonitorPatterns({ pattern: "x" })).toEqual([]);
  });

  it("trims surrounding whitespace on a string spec", () => {
    expect(parseMonitorPatterns(["  ERROR  "])).toEqual([{ label: "ERROR", pattern: "ERROR", kind: "alert" }]);
  });
});

const PATTERNS: MonitorPattern[] = [
  { label: "errors", pattern: "ERROR", kind: "alert" },
  { label: "up", pattern: "Listening on", kind: "ready" },
];

describe("matchLine", () => {
  it("returns the patterns a line matches", () => {
    const out = matchLine("Listening on :3000", PATTERNS);
    expect(out).toEqual([{ label: "up", kind: "ready", line: "Listening on :3000" }]);
  });

  it("returns [] when nothing matches", () => {
    expect(matchLine("all quiet here", PATTERNS)).toEqual([]);
  });

  it("returns [] when there are no patterns (no patterns = no matches)", () => {
    expect(matchLine("ERROR Listening on", [])).toEqual([]);
  });

  it("strips ANSI before matching and reports the cleaned line", () => {
    const ansi = "\x1b[31mERROR\x1b[0m boom";
    const out = matchLine(ansi, PATTERNS);
    expect(out).toEqual([{ label: "errors", kind: "alert", line: "ERROR boom" }]);
  });

  it("matches as a literal substring, not a regex (no ReDoS surface)", () => {
    const literal: MonitorPattern[] = [{ label: "lit", pattern: "a.b", kind: "info" }];
    expect(matchLine("xaxbx", literal)).toEqual([]); // '.' is literal, not 'any char'
    expect(matchLine("xa.bx", literal)).toEqual([{ label: "lit", kind: "info", line: "xa.bx" }]);
  });

  it("does not hang on a catastrophic-looking pattern (literal scan)", () => {
    const evil: MonitorPattern[] = [{ label: "evil", pattern: "(a+)+$", kind: "alert" }];
    const line = "a".repeat(5000);
    const start = Date.now();
    expect(matchLine(line, evil)).toEqual([]); // the literal "(a+)+$" isn't in the line
    expect(Date.now() - start).toBeLessThan(100);
  });

  it("returns one entry per matching pattern on a line", () => {
    const out = matchLine("ERROR while Listening on :3000", PATTERNS);
    expect(out.map((m) => m.label)).toEqual(["errors", "up"]);
  });
});

describe("accumulateMatch", () => {
  it("appends matches and bumps per-label counts", () => {
    let s = emptyMonitorState();
    s = accumulateMatch(s, "ERROR one", PATTERNS);
    s = accumulateMatch(s, "ERROR two", PATTERNS);
    expect(s.counts).toEqual({ errors: 2 });
    expect(s.matches).toHaveLength(2);
  });

  it("sets ready when a ready pattern matches", () => {
    let s = emptyMonitorState();
    expect(s.ready).toBe(false);
    s = accumulateMatch(s, "Listening on :3000", PATTERNS);
    expect(s.ready).toBe(true);
    expect(s.counts).toEqual({ up: 1 });
  });

  it("keeps ready=false until a ready pattern is seen", () => {
    let s = emptyMonitorState();
    s = accumulateMatch(s, "ERROR boot", PATTERNS);
    expect(s.ready).toBe(false);
  });

  it("does not mutate the input state (pure)", () => {
    const s0 = emptyMonitorState();
    const s1 = accumulateMatch(s0, "ERROR x", PATTERNS);
    expect(s0.matches).toEqual([]);
    expect(s0.counts).toEqual({});
    expect(s1).not.toBe(s0);
  });

  it("a non-matching line yields a fresh equal state, original untouched", () => {
    const s0 = emptyMonitorState();
    const s1 = accumulateMatch(s0, "quiet", PATTERNS);
    expect(s1).toEqual(s0);
    expect(s1).not.toBe(s0);
  });

  it("with no patterns, never matches and never readies", () => {
    let s = emptyMonitorState();
    s = accumulateMatch(s, "ERROR Listening on", []);
    expect(s).toEqual({ matches: [], counts: {}, ready: false });
  });
});

describe("summarizeMonitor", () => {
  it("reads 'waiting · no matches yet' on the empty state", () => {
    expect(summarizeMonitor(emptyMonitorState())).toBe("waiting · no matches yet");
  });

  it("leads with ✓ ready once readied and tallies alerts", () => {
    let s = emptyMonitorState();
    s = accumulateMatch(s, "Listening on :3000", PATTERNS);
    s = accumulateMatch(s, "ERROR a", PATTERNS);
    s = accumulateMatch(s, "ERROR b", PATTERNS);
    expect(summarizeMonitor(s)).toBe("✓ ready · 2 alerts");
  });

  it("singularizes a single alert", () => {
    let s = emptyMonitorState();
    s = accumulateMatch(s, "Listening on now", PATTERNS);
    s = accumulateMatch(s, "ERROR once", PATTERNS);
    expect(summarizeMonitor(s)).toBe("✓ ready · 1 alert");
  });

  it("shows '… not ready' with a tally before a ready pattern fires", () => {
    let s = emptyMonitorState();
    s = accumulateMatch(s, "ERROR early", PATTERNS);
    expect(summarizeMonitor(s)).toBe("… not ready · 1 alert");
  });

  it("includes an info segment when info patterns matched", () => {
    const ps: MonitorPattern[] = [{ label: "req", pattern: "GET", kind: "info" }];
    let s = emptyMonitorState();
    s = accumulateMatch(s, "GET /a", ps);
    s = accumulateMatch(s, "GET /b", ps);
    expect(summarizeMonitor(s)).toBe("… not ready · 2 info");
  });
});
