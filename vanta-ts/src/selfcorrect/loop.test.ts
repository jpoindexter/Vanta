import { describe, it, expect, vi } from "vitest";
import { selfCorrect, type RunResult } from "./loop.js";
import type { Lock } from "../verify/store.js";

const NOW = 1_700_000_000_000;
const FAIL: RunResult = { exitCode: 1, output: "boom: assertion failed" };
const PASS: RunResult = { exitCode: 0, output: "all good: OK" };
const failure = { command: "npm test", expect: "OK" };

describe("selfCorrect", () => {
  it("no-failure when the command already passes (no fix, no lock)", async () => {
    const fix = vi.fn(async () => ({ summary: "x" }));
    const locks: Lock[] = [];
    const r = await selfCorrect(failure, { run: async () => PASS, fix, lock: (l) => locks.push(l), now: () => NOW });
    expect(r.stage).toBe("no-failure");
    expect(fix).not.toHaveBeenCalled();
    expect(locks).toHaveLength(0);
  });

  it("fixed: confirms failure, fixes, rerun passes, locks a regression", async () => {
    const run = vi.fn<(cmd: string) => Promise<RunResult>>().mockResolvedValueOnce(FAIL).mockResolvedValueOnce(PASS);
    const locks: Lock[] = [];
    const r = await selfCorrect(failure, { run, fix: async () => ({ summary: "patched X" }), lock: (l) => locks.push(l), now: () => NOW });
    expect(r.stage).toBe("fixed");
    expect(r.fixSummary).toBe("patched X");
    expect(locks).toHaveLength(1);
    expect(locks[0]).toMatchObject({ command: "npm test", expect: "OK", status: "locked", created: NOW });
    expect(r.lockId).toBe(locks[0]!.id);
  });

  it("still-failing: rerun still fails after the fix (no lock)", async () => {
    const run = vi.fn<(cmd: string) => Promise<RunResult>>().mockResolvedValueOnce(FAIL).mockResolvedValueOnce(FAIL);
    const locks: Lock[] = [];
    const r = await selfCorrect(failure, { run, fix: async () => ({ summary: "tried" }), lock: (l) => locks.push(l), now: () => NOW });
    expect(r.stage).toBe("still-failing");
    expect(r.fixSummary).toBe("tried");
    expect(locks).toHaveLength(0);
  });

  it("fix-error: a throwing fix is reported and nothing is locked", async () => {
    const locks: Lock[] = [];
    const r = await selfCorrect(failure, {
      run: async () => FAIL,
      fix: async () => { throw new Error("no provider configured"); },
      lock: (l) => locks.push(l),
      now: () => NOW,
    });
    expect(r.stage).toBe("fix-error");
    expect(r.detail).toMatch(/no provider/);
    expect(locks).toHaveLength(0);
  });
});
