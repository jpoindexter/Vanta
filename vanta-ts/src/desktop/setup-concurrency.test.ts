import { describe, expect, it } from "vitest";
import { getSession } from "./session-state.js";

describe("desktop session state", () => {
  it("returns one shared state object for concurrent requests in a session", () => {
    const sessions = new Map();
    const first = getSession(sessions, "default", "/repo");
    const second = getSession(sessions, "default", "/repo");
    const setup = Promise.resolve({} as any);
    first._setupPromise = setup;
    expect(second).toBe(first);
    expect(second._setupPromise).toBe(setup);
  });
});
