import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  enqueueAsyncResult,
  drainAsyncReentry,
  formatAsyncReentry,
  peekAsyncCount,
  type AsyncResult,
} from "./async-delegate.js";

const mk = (goal: string, output: string): AsyncResult => ({ id: goal, goal, output, finishedAt: "2026-06-20T12:00:00.000Z" });

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-asyncdel-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("async-delegate queue", () => {
  it("drains nothing when empty", async () => {
    expect(await drainAsyncReentry(dir)).toBeNull();
    expect(await peekAsyncCount(dir)).toBe(0);
  });

  it("enqueues results and drains them as one re-entry turn, then clears", async () => {
    await enqueueAsyncResult(dir, mk("summarize docs", "done: 3 files"));
    await enqueueAsyncResult(dir, mk("audit deps", "done: 1 flagged"));
    expect(await peekAsyncCount(dir)).toBe(2);
    const reentry = await drainAsyncReentry(dir);
    expect(reentry).toContain("summarize docs");
    expect(reentry).toContain("audit deps");
    expect(reentry).toContain("background delegation finished");
    // drained → empty
    expect(await drainAsyncReentry(dir)).toBeNull();
    expect(await peekAsyncCount(dir)).toBe(0);
  });

  it("a result enqueued after a drain is picked up next time (not lost)", async () => {
    await enqueueAsyncResult(dir, mk("first", "a"));
    await drainAsyncReentry(dir);
    await enqueueAsyncResult(dir, mk("second", "b"));
    const reentry = await drainAsyncReentry(dir);
    expect(reentry).toContain("second");
    expect(reentry).not.toContain("first");
  });

  it("formatAsyncReentry renders each result as a bullet", () => {
    const out = formatAsyncReentry([mk("g1", "r1"), mk("g2", "r2")]);
    expect(out).toContain("- (g1) → r1");
    expect(out).toContain("- (g2) → r2");
  });

  it("tolerates a malformed line in the queue", async () => {
    await enqueueAsyncResult(dir, mk("good", "ok"));
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dir, "async-delegate.jsonl"), "{not json}\n", { flag: "a" });
    const reentry = await drainAsyncReentry(dir);
    expect(reentry).toContain("good");
  });
});
