import { describe, expect, it } from "vitest";
import { movePinnedSession, partitionSessions } from "./session-pinning.js";
import type { Session } from "./types.js";

const session = (id: string, options: Partial<Session> = {}): Session => ({
  id,
  title: id,
  turns: 1,
  updated: `2026-07-${id.padStart(2, "0")}T00:00:00.000Z`,
  ...options,
});

describe("desktop pinned session order", () => {
  it("partitions each active session into exactly one rail group", () => {
    const groups = partitionSessions([
      session("1", { pinned: true, pinOrder: 1 }),
      session("2"),
      session("3", { pinned: true, pinOrder: 0 }),
      session("4"),
      session("5"),
      session("6"),
      session("7", { archived: true, pinned: true, pinOrder: 2 }),
      session("8", { trashed: true }),
    ]);

    expect(groups.pinned.map(({ id }) => id)).toEqual(["3", "1"]);
    expect(groups.project.map(({ id }) => id)).toEqual(["2", "4", "5"]);
    expect(groups.recent.map(({ id }) => id)).toEqual(["6"]);
    expect(new Set([...groups.pinned, ...groups.project, ...groups.recent].map(({ id }) => id)).size).toBe(6);
  });

  it("moves one pinned session by one keyboard or pointer step", () => {
    const pinned = [session("1"), session("2"), session("3")];
    expect(movePinnedSession(pinned, "2", -1)).toEqual(["2", "1", "3"]);
    expect(movePinnedSession(pinned, "2", 1)).toEqual(["1", "3", "2"]);
    expect(movePinnedSession(pinned, "1", -1)).toEqual(["1", "2", "3"]);
  });
});
