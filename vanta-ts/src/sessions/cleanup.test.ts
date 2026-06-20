import { describe, expect, it } from "vitest";
import { staleSessions, pruneSessions } from "./cleanup.js";
import type { SessionMeta } from "./store.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

function meta(id: string, daysAgo: number): SessionMeta {
  const updated = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
  return { id, title: id, started: updated, updated, turns: 1 };
}

const CORPUS: SessionMeta[] = [
  meta("fresh", 0),
  meta("yesterday", 1),
  meta("week", 7),
  meta("month", 30),
];

describe("staleSessions", () => {
  it("selects only sessions older than periodDays", () => {
    expect(staleSessions(CORPUS, 7, NOW)).toEqual(["month"]);
  });

  it("keeps sessions newer than periodDays", () => {
    expect(staleSessions(CORPUS, 60, NOW)).toEqual([]);
  });

  it("treats exactly periodDays old as kept (strictly older is stale)", () => {
    expect(staleSessions([meta("edge", 7)], 7, NOW)).toEqual([]);
  });

  it("selects everything past a tiny period but never the freshest", () => {
    expect(staleSessions(CORPUS, 0.5, NOW)).toEqual(["yesterday", "week", "month"]);
  });

  it("returns none when periodDays is unset", () => {
    expect(staleSessions(CORPUS, undefined, NOW)).toEqual([]);
  });

  it("returns none when periodDays is zero or negative", () => {
    expect(staleSessions(CORPUS, 0, NOW)).toEqual([]);
    expect(staleSessions(CORPUS, -5, NOW)).toEqual([]);
  });

  it("keeps sessions with an unparseable updated timestamp", () => {
    const bad: SessionMeta = { id: "bad", title: "bad", started: "x", updated: "not-a-date", turns: 0 };
    expect(staleSessions([bad], 1, NOW)).toEqual([]);
  });
});

describe("pruneSessions", () => {
  it("deletes the stale sessions and returns the count", async () => {
    const deleted: string[] = [];
    const result = await pruneSessions({
      listSessions: async () => CORPUS,
      deleteSession: async (id) => void deleted.push(id),
      periodDays: 7,
      now: NOW,
    });
    expect(deleted).toEqual(["month"]);
    expect(result).toEqual({ deleted: 1, failed: 0 });
  });

  it("never deletes when periodDays is unset", async () => {
    const deleted: string[] = [];
    let listed = false;
    const result = await pruneSessions({
      listSessions: async () => {
        listed = true;
        return CORPUS;
      },
      deleteSession: async (id) => void deleted.push(id),
      periodDays: undefined,
      now: NOW,
    });
    expect(deleted).toEqual([]);
    expect(listed).toBe(false); // short-circuits before listing
    expect(result).toEqual({ deleted: 0, failed: 0 });
  });

  it("never deletes when periodDays is zero or negative", async () => {
    const deleted: string[] = [];
    for (const p of [0, -1]) {
      const result = await pruneSessions({
        listSessions: async () => CORPUS,
        deleteSession: async (id) => void deleted.push(id),
        periodDays: p,
        now: NOW,
      });
      expect(result).toEqual({ deleted: 0, failed: 0 });
    }
    expect(deleted).toEqual([]);
  });

  it("counts a failed delete instead of throwing", async () => {
    const result = await pruneSessions({
      listSessions: async () => CORPUS,
      deleteSession: async () => {
        throw new Error("EPERM");
      },
      periodDays: 1,
      now: NOW,
    });
    // yesterday(1) is kept (not strictly older), week + month are stale
    expect(result).toEqual({ deleted: 0, failed: 2 });
  });
});
