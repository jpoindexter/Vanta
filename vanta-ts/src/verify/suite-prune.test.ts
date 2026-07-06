import { describe, it, expect } from "vitest";
import { vantaSubcommand, staleReasons, detectStaleLocks, formatStaleReport, type PruneOpts } from "./suite-prune.js";
import type { Lock } from "./store.js";

// SELFHARNESS-SUITE-PRUNE — detect locks whose tool/schema assumptions went stale.

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;

function lock(over: Partial<Lock> = {}): Lock {
  return {
    id: over.id ?? "l1",
    claim: over.claim ?? "does the thing",
    command: over.command ?? "vanta run 'x'",
    expect: over.expect ?? "ok",
    status: over.status ?? "locked",
    created: over.created ?? NOW,
    updated: over.updated ?? NOW,
  };
}

const opts = (over: Partial<PruneOpts> = {}): PruneOpts => ({
  knownCommands: new Set(["run", "doctor", "verify"]),
  now: NOW,
  ...over,
});

describe("vantaSubcommand", () => {
  it("extracts the vanta subcommand from a check command", () => {
    expect(vantaSubcommand("vanta run 'hi'")).toBe("run");
    expect(vantaSubcommand("./run.sh doctor")).toBe("doctor");
    expect(vantaSubcommand("npm run vanta -- verify")).toBe("verify");
    expect(vantaSubcommand("grep foo file.txt")).toBeNull(); // not a vanta command
  });
});

describe("staleReasons", () => {
  it("healthy lock (known command, fresh, not regressed) has no reasons", () => {
    expect(staleReasons(lock(), opts())).toEqual([]);
  });

  it("flags a removed command (tool/schema drift)", () => {
    const r = staleReasons(lock({ command: "vanta gonezo --x" }), opts());
    expect(r).toContainEqual({ kind: "unknown-command", command: "vanta gonezo" });
  });

  it("flags a lock not re-verified within the window", () => {
    const r = staleReasons(lock({ updated: NOW - 40 * DAY }), opts({ maxAgeDays: 30 }));
    expect(r.some((x) => x.kind === "not-reverified")).toBe(true);
  });

  it("flags a long-regressed lock", () => {
    const r = staleReasons(lock({ status: "regressed", updated: NOW - 20 * DAY }), opts({ maxRegressedDays: 14 }));
    expect(r.some((x) => x.kind === "long-regressed")).toBe(true);
  });

  it("stacks multiple reasons on one lock", () => {
    const r = staleReasons(lock({ command: "vanta gonezo", status: "regressed", updated: NOW - 60 * DAY }), opts());
    expect(r.map((x) => x.kind).sort()).toEqual(["long-regressed", "not-reverified", "unknown-command"]);
  });
});

describe("detectStaleLocks / formatStaleReport", () => {
  it("returns only flagged locks and reports 'all honest' when none", () => {
    const locks = [lock({ id: "ok" }), lock({ id: "bad", command: "vanta gonezo" })];
    const stale = detectStaleLocks(locks, opts());
    expect(stale.map((s) => s.id)).toEqual(["bad"]);
    expect(formatStaleReport([], 5)).toContain("all honest");
    expect(formatStaleReport(stale, 2)).toContain("1/2 lock(s) flagged");
    expect(formatStaleReport(stale, 2)).toContain("removed command");
  });
});
