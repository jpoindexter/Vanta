import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  enqueueAsyncResult,
  acknowledgeAsyncReentry,
  drainAsyncReentry,
  formatAsyncReentry,
  peekAsyncCount,
  type AsyncResult,
} from "./async-delegate.js";

const mk = (goal: string, output: string): AsyncResult => ({ id: goal, goal, output, finishedAt: "2026-06-20T12:00:00.000Z", ok: true });

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
    expect(reentry?.kind).toBe("ready");
    if (reentry?.kind !== "ready") throw new Error("Expected ready delivery");
    expect(reentry.prompt).toContain("summarize docs");
    expect(reentry.prompt).toContain("audit deps");
    expect(reentry.prompt).toContain("background delegation finished");
    await acknowledgeAsyncReentry(dir, reentry.claimId);
    // drained → empty
    expect(await drainAsyncReentry(dir)).toBeNull();
    expect(await peekAsyncCount(dir)).toBe(0);
  });

  it("a result enqueued after a drain is picked up next time (not lost)", async () => {
    await enqueueAsyncResult(dir, mk("first", "a"));
    const first = await drainAsyncReentry(dir);
    if (first?.kind !== "ready") throw new Error("Expected ready delivery");
    await acknowledgeAsyncReentry(dir, first.claimId);
    await enqueueAsyncResult(dir, mk("second", "b"));
    const reentry = await drainAsyncReentry(dir);
    expect(reentry?.kind).toBe("ready");
    if (reentry?.kind !== "ready") throw new Error("Expected ready delivery");
    expect(reentry.prompt).toContain("second");
    expect(reentry.prompt).not.toContain("first");
  });

  it("preserves malformed evidence and pauses automatic delivery", async () => {
    await enqueueAsyncResult(dir, mk("good", "ok"));
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dir, "async-delegate.jsonl"), "{not json}\n", { flag: "a" });
    const reentry = await drainAsyncReentry(dir);
    expect(reentry?.kind).toBe("review");
    expect(await peekAsyncCount(dir)).toBe(1);
  });

});

describe("async-delegate concurrent custody", () => {
  it("serializes parallel enqueues and grants only one delivery claim", async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => enqueueAsyncResult(dir, mk(`worker-${i}`, "ok"))));
    expect(await peekAsyncCount(dir)).toBe(8);
    const claims = await Promise.all([drainAsyncReentry(dir), drainAsyncReentry(dir)]);
    expect(claims.filter(claim => claim?.kind === "ready")).toHaveLength(1);
    expect(claims.filter(claim => claim?.kind === "review")).toHaveLength(1);
  });
});

describe("async-delegate summary formatting", () => {
  it("renders each successful result as a bullet", () => {
    const out = formatAsyncReentry([mk("g1", "r1"), mk("g2", "r2")]);
    expect(out).toContain("- (g1) → r1");
    expect(out).toContain("- (g2) → r2");
  });
});
