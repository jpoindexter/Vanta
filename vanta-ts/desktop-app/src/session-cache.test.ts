import { describe, expect, it } from "vitest";
import { loadCachedSessions, saveCachedSessions } from "./session-cache.js";
import type { Session } from "./types.js";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}

const session = (id: string): Session => ({ id, title: `Chat ${id}`, turns: 2, updated: "2026-10-13T10:00:00Z" });

describe("session cache", () => {
  it("returns what was saved so the sidebar can paint before the runtime answers", () => {
    const storage = memoryStorage();
    saveCachedSessions(storage, [session("a"), session("b")]);
    expect(loadCachedSessions(storage).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("is empty when nothing was cached or the cache is corrupt", () => {
    expect(loadCachedSessions(memoryStorage())).toEqual([]);
    expect(loadCachedSessions(memoryStorage({ "vanta.desktop.sessions-cache.v1": "{not json" }))).toEqual([]);
    expect(loadCachedSessions(undefined)).toEqual([]);
  });

  it("drops rows that are not sessions and caps the list", () => {
    const rows = [session("ok"), { id: 5 }, null, ...Array.from({ length: 150 }, (_, index) => session(`s${index}`))];
    const storage = memoryStorage({ "vanta.desktop.sessions-cache.v1": JSON.stringify(rows) });
    const loaded = loadCachedSessions(storage);
    expect(loaded[0]?.id).toBe("ok");
    expect(loaded).toHaveLength(100);
  });

  it("never throws when storage is full", () => {
    const full = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(() => saveCachedSessions(full, [session("a")])).not.toThrow();
  });
});
