import { describe, it, expect } from "vitest";
import { resolveSessionStore } from "./index.js";
import { fsSessionStore } from "./store.js";

describe("resolveSessionStore", () => {
  it("defaults to the fs store when unset", () => {
    expect(resolveSessionStore({})).toBe(fsSessionStore);
  });

  it("returns the fs store for fs and default modes", () => {
    expect(resolveSessionStore({ VANTA_SESSION_STORE: "fs" })).toBe(fsSessionStore);
    expect(resolveSessionStore({ VANTA_SESSION_STORE: "Default" })).toBe(fsSessionStore);
  });

  it("throws on an unknown store", () => {
    expect(() => resolveSessionStore({ VANTA_SESSION_STORE: "bogus" })).toThrow(/Unknown VANTA_SESSION_STORE/);
  });

  it("exposes the full SessionStore surface", () => {
    const s = resolveSessionStore({});
    for (const m of ["saveSession", "loadSession", "forkSession", "deleteSession", "listSessions"]) {
      expect(typeof (s as unknown as Record<string, unknown>)[m]).toBe("function");
    }
  });
});
