import { describe, it, expect } from "vitest";
import { formatTeam } from "./team-cmd.js";
import type { Worker } from "../team/store.js";

const workers: Worker[] = [
  { kind: "worker", id: "scraper", role: "web scraper", status: "idle", ts: "t1" },
  { kind: "worker", id: "analyst", role: "data analyst", status: "blocked", note: "awaiting data", ts: "t2" },
];

describe("formatTeam", () => {
  it("shows worker count, ids, roles, and statuses", () => {
    const out = formatTeam(workers);
    expect(out).toContain("2 workers");
    expect(out).toContain("scraper · web scraper · idle");
    expect(out).toContain("analyst · data analyst · blocked");
  });

  it("includes the blocked warning when workers are blocked", () => {
    const out = formatTeam(workers);
    expect(out).toContain("⚠ 1 blocked");
  });

  it("no blocked warning when no workers are blocked", () => {
    const none: Worker[] = [
      { kind: "worker", id: "w", role: "runner", status: "running", ts: "t1" },
    ];
    expect(formatTeam(none)).not.toContain("blocked");
  });

  it("an empty roster prompts to define", () => {
    expect(formatTeam([])).toContain("empty");
  });

  it("note is included in the row when present", () => {
    const out = formatTeam(workers);
    expect(out).toContain("awaiting data");
  });

  it("applies last-write-wins before formatting (pure, no I/O)", () => {
    const duped: Worker[] = [
      { kind: "worker", id: "w1", role: "old", status: "idle", ts: "t1" },
      { kind: "worker", id: "w1", role: "new", status: "done", ts: "t2" },
    ];
    const out = formatTeam(duped);
    expect(out).toContain("1 worker");
    expect(out).toContain("new");
    expect(out).not.toContain("old");
  });
});
