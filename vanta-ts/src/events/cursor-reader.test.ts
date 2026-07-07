import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSince, longPollEvents, fileEventSource, MAX_WAIT_MS, type EventSource } from "./cursor-reader.js";

// HARNESS-EVENTS-WAIT — cursor read + capped long-poll.

describe("readSince", () => {
  it("returns new lines after the cursor and advances it", () => {
    expect(readSince(["a", "b", "c"], 1)).toEqual({ events: ["b", "c"], cursor: 3 });
    expect(readSince(["a", "b", "c"], 3)).toEqual({ events: [], cursor: 3 }); // caught up
  });
  it("a cursor past the end resets to the end (no replay after truncation)", () => {
    expect(readSince(["a"], 9)).toEqual({ events: [], cursor: 1 });
    expect(readSince([], 5)).toEqual({ events: [], cursor: 0 });
  });
});

// A controllable clock + source for deterministic long-poll tests.
function harness(frames: string[][]) {
  let t = 0;
  let i = 0;
  const now = (): number => t;
  const sleep = async (ms: number): Promise<void> => { t += ms; };
  const source: EventSource = async () => frames[Math.min(i++, frames.length - 1)] ?? [];
  return { now, sleep, source, advanceCalls: () => i };
}

describe("longPollEvents", () => {
  it("returns immediately when events are already pending", async () => {
    const h = harness([["a", "b"]]);
    const r = await longPollEvents({ source: h.source, cursor: 0, timeoutMs: 10_000, now: h.now, sleep: h.sleep, pollMs: 100 });
    expect(r).toEqual({ events: ["a", "b"], cursor: 2 });
  });

  it("blocks until a new event appears, then returns it", async () => {
    // First reads: nothing new (cursor already at end=1); then a 2nd line lands.
    const h = harness([["a"], ["a"], ["a", "b"]]);
    const r = await longPollEvents({ source: h.source, cursor: 1, timeoutMs: 10_000, now: h.now, sleep: h.sleep, pollMs: 100 });
    expect(r).toEqual({ events: ["b"], cursor: 2 });
  });

  it("returns empty at the timeout with the cursor preserved (no busy spin)", async () => {
    const h = harness([["a"]]); // never grows
    const r = await longPollEvents({ source: h.source, cursor: 1, timeoutMs: 300, now: h.now, sleep: h.sleep, pollMs: 100 });
    expect(r.events).toEqual([]);
    expect(r.cursor).toBe(1);
  });

  it("honors an abort signal (connection closed)", async () => {
    const signal = { aborted: true };
    const h = harness([["a"]]);
    const r = await longPollEvents({ source: h.source, cursor: 1, timeoutMs: 10_000, now: h.now, sleep: h.sleep, signal });
    expect(r.events).toEqual([]);
  });

  it("caps the wait at MAX_WAIT_MS even if a larger timeout is requested", async () => {
    let maxT = 0;
    const now = (): number => maxT;
    const sleep = async (ms: number): Promise<void> => { maxT += ms; };
    const source: EventSource = async () => ["a"]; // never grows past cursor
    await longPollEvents({ source, cursor: 1, timeoutMs: MAX_WAIT_MS * 100, now, sleep, pollMs: 60_000 });
    expect(maxT).toBeLessThanOrEqual(MAX_WAIT_MS);
  });
});

describe("fileEventSource", () => {
  it("reads non-empty lines; a missing file → []", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-events-"));
    const path = join(dir, "events.jsonl");
    expect(await fileEventSource(path)()).toEqual([]); // missing
    await writeFile(path, '{"e":1}\n\n{"e":2}\n', "utf8");
    expect(await fileEventSource(path)()).toEqual(['{"e":1}', '{"e":2}']); // blank line skipped
  });
});
