import { describe, it, expect } from "vitest";
import {
  gateAuditEvent,
  parseGateEvents,
  summarizeGateRecords,
  filterSince,
  formatAuditReport,
} from "./audit.js";

function line(ts: number, e: Record<string, unknown>): string {
  return JSON.stringify({ ts, event: JSON.stringify(e) });
}

describe("gateAuditEvent", () => {
  it("serializes a gate outcome as a kind-discriminated event string", () => {
    const s = gateAuditEvent({ tool: "shell_cmd", action: "run ls", risk: "allow", resolution: "allow" });
    expect(JSON.parse(s)).toEqual({ kind: "gate", tool: "shell_cmd", action: "run ls", risk: "allow", resolution: "allow" });
  });
});

describe("parseGateEvents", () => {
  it("parses gate events out of a mixed events.jsonl (ignoring non-gate lines)", () => {
    const jsonl = [
      line(100, { kind: "gate", tool: "shell_cmd", action: "run ls", risk: "allow", resolution: "allow" }),
      line(101, { kind: "session_config", provider: "openai" }), // non-gate, skipped
      "not even json", // malformed, skipped
      line(102, { kind: "gate", tool: "write_file", action: "edit /repo/x.ts", risk: "ask", resolution: "denied" }),
    ].join("\n");

    const records = parseGateEvents(jsonl);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ tool: "shell_cmd", risk: "allow", resolution: "allow", ts: 100, lineNo: 1 });
    expect(records[1]).toMatchObject({ tool: "write_file", risk: "ask", resolution: "denied", ts: 102, lineNo: 4 });
  });

  it("rejects a gate-kind line with an unknown risk or resolution value (tampered/malformed)", () => {
    const jsonl = line(1, { kind: "gate", tool: "x", action: "y", risk: "nonsense", resolution: "allow" });
    expect(parseGateEvents(jsonl)).toEqual([]);
  });

  it("returns [] for empty input", () => {
    expect(parseGateEvents("")).toEqual([]);
  });
});

describe("filterSince", () => {
  it("keeps only records at/after the cutoff, inclusive", () => {
    const jsonl = [
      line(100, { kind: "gate", tool: "a", action: "x", risk: "allow", resolution: "allow" }),
      line(200, { kind: "gate", tool: "b", action: "y", risk: "allow", resolution: "allow" }),
    ].join("\n");
    const records = parseGateEvents(jsonl);
    expect(filterSince(records, 200).map((r) => r.tool)).toEqual(["b"]);
    expect(filterSince(records, 100).map((r) => r.tool)).toEqual(["a", "b"]);
    expect(filterSince(records, 201)).toEqual([]);
  });
});

describe("summarizeGateRecords", () => {
  it("tallies by kernel risk and by final resolution", () => {
    const jsonl = [
      line(1, { kind: "gate", tool: "a", action: "x", risk: "allow", resolution: "allow" }),
      line(2, { kind: "gate", tool: "b", action: "y", risk: "ask", resolution: "approved" }),
      line(3, { kind: "gate", tool: "c", action: "z", risk: "allow", resolution: "blocked" }), // rule-tightened
    ].join("\n");
    const summary = summarizeGateRecords(parseGateEvents(jsonl));
    expect(summary.total).toBe(3);
    expect(summary.byRisk).toEqual({ allow: 2, ask: 1 });
    expect(summary.byResolution).toEqual({ allow: 1, approved: 1, blocked: 1 });
  });

  it("returns all-zero for an empty record set", () => {
    expect(summarizeGateRecords([])).toEqual({ total: 0, byRisk: {}, byResolution: {} });
  });
});

describe("formatAuditReport", () => {
  it("renders summary counts + a chronological table, escaping pipe characters", () => {
    const jsonl = [
      line(1_700_000_100, { kind: "gate", tool: "shell_cmd", action: "run ls | grep x", risk: "allow", resolution: "allow" }),
      line(1_700_000_050, { kind: "gate", tool: "write_file", action: "edit /repo/y.ts", risk: "ask", resolution: "denied" }),
    ].join("\n");
    const report = formatAuditReport(parseGateEvents(jsonl));

    expect(report).toContain("**Total gated actions:** 2");
    expect(report).toContain("| allow | 1 |");
    expect(report).toContain("| ask | 1 |");
    expect(report).toContain("| denied | 1 |");
    expect(report).toContain("run ls \\| grep x"); // escaped, doesn't break the markdown table
    // Chronological: the earlier ts (write_file) must appear before the later one (shell_cmd).
    const writeIdx = report.indexOf("write_file");
    const shellIdx = report.indexOf("shell_cmd", report.indexOf("Chronological"));
    expect(writeIdx).toBeLessThan(shellIdx);
  });

  it("renders a clean empty report (no gated actions)", () => {
    const report = formatAuditReport([]);
    expect(report).toContain("**Total gated actions:** 0");
    expect(report).toContain("| (none) | 0 |");
  });
});
