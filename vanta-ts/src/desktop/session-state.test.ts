import { describe, it, expect } from "vitest";
import { getSession, sessionIdFromRequest, type SessionMap } from "./session-state.js";
import http from "node:http";

describe("getSession", () => {
  it("creates a new session if not present", () => {
    const sessions: SessionMap = new Map();
    const state = getSession(sessions, "sess-1", "/tmp");
    expect(state.root).toBe("/tmp");
    expect(sessions.has("sess-1")).toBe(true);
  });

  it("returns the same state on repeated calls", () => {
    const sessions: SessionMap = new Map();
    const a = getSession(sessions, "sess-x", "/tmp");
    const b = getSession(sessions, "sess-x", "/tmp");
    expect(a).toBe(b); // same object reference
  });

  it("isolates two different sessions", () => {
    const sessions: SessionMap = new Map();
    const a = getSession(sessions, "a", "/a");
    const b = getSession(sessions, "b", "/b");
    expect(a).not.toBe(b);
    expect(a.root).toBe("/a");
    expect(b.root).toBe("/b");
  });
});

describe("sessionIdFromRequest", () => {
  function fakeReq(opts: { header?: string; url?: string }): http.IncomingMessage {
    return {
      headers: opts.header ? { "x-session-id": opts.header } : {},
      url: opts.url ?? "/",
    } as unknown as http.IncomingMessage;
  }

  it("reads X-Session-Id header", () => {
    expect(sessionIdFromRequest(fakeReq({ header: "sess-42" }))).toBe("sess-42");
  });

  it("reads ?session= query param", () => {
    expect(sessionIdFromRequest(fakeReq({ url: "/api/events?session=abc" }))).toBe("abc");
  });

  it("falls back to 'default' when neither is set", () => {
    expect(sessionIdFromRequest(fakeReq({}))).toBe("default");
  });

  it("prefers header over query param", () => {
    expect(sessionIdFromRequest(fakeReq({ header: "hdr", url: "/?session=qry" }))).toBe("hdr");
  });
});
