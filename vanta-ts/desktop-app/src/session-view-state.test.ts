import { describe, expect, it } from "vitest";
import { patchSessionView, readSessionView, type SessionViewStorage } from "./session-view-state.js";

function memoryStorage(seed?: string): SessionViewStorage {
  const values = new Map<string, string>(seed ? [["vanta.desktop.sessionViewState.v1", seed]] : []);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe("desktop session view state", () => {
  it("persists independent reading positions and follow state", () => {
    const storage = memoryStorage();
    patchSessionView(storage, "alpha", { scrollTop: 420, stickToBottom: false, anchorIndex: 27, anchorOffset: 11 });
    patchSessionView(storage, "beta", { scrollTop: 18, stickToBottom: true });
    expect(readSessionView(storage, "alpha")).toEqual({ scrollTop: 420, stickToBottom: false, anchorIndex: 27, anchorOffset: 11 });
    expect(readSessionView(storage, "beta")).toEqual({ scrollTop: 18, stickToBottom: true });
  });

  it("recovers from malformed state and clamps invalid positions", () => {
    const storage = memoryStorage("not json");
    expect(readSessionView(storage, "missing")).toBeNull();
    expect(patchSessionView(storage, "alpha", { scrollTop: -10, stickToBottom: false })).toEqual({ scrollTop: 0, stickToBottom: false });
  });

  it("keeps only the 100 most recently patched sessions", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 105; index += 1) patchSessionView(storage, `session-${index}`, { scrollTop: index });
    expect(readSessionView(storage, "session-4")).toBeNull();
    expect(readSessionView(storage, "session-5")?.scrollTop).toBe(5);
    expect(readSessionView(storage, "session-104")?.scrollTop).toBe(104);
  });
});
