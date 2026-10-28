import { mkdtempSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverLiveSession, observeLiveSession, retainChatResult, validLiveRequestId } from "./live-session.js";
import type { DesktopState } from "./handler-state.js";

const box = mkdtempSync(join(tmpdir(), "vanta-live-session-unit-"));
const root = join(box, "project"), home = join(box, "writer"), other = join(box, "other");
for (const dir of [root, home, other]) mkdirSync(dir);
const alias = join(box, "project-alias");
symlinkSync(root, alias);

function fixture() {
  const sessions = new Map<string, DesktopState>();
  const state = { root, _env: { VANTA_HOME: home, VANTA_PROFILE: "writer" }, _sessions: sessions,
    sessionId: "stored", _chatRun: { requestId: "req-original", sessionId: "stored" },
    _chatActive: true, _chatAbort: new AbortController(),
    convo: { messages: [{ role: "system", content: "private" }, { role: "user", content: "hello" }], send: async () => { throw new Error("not executed"); }, setProvider() {}, setSessionMemory() {} },
  } as DesktopState;
  const reader: DesktopState = { root, _env: { ...state._env }, _sessions: sessions };
  sessions.set("original", state);
  sessions.set("reader", reader);
  return { state, reader, sessions };
}

describe("backend-authoritative live session binding", () => {
  it("discovers the original map key without mutating either state or copying the conversation", () => {
    const { state, reader } = fixture(), original = state.convo;
    const result = discoverLiveSession(reader, "stored", root);
    expect(result).toMatchObject({ id: "stored", live: { clientId: "original", requestId: "req-original", profile: "writer", root: realpathSync(root), running: true } });
    expect(result?.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(reader.convo).toBeUndefined();
    expect(state.convo).toBe(original);
  });
  it("canonicalizes a project alias rather than comparing string prefixes", () => {
    const { reader } = fixture(); reader.root = alias;
    expect(discoverLiveSession(reader, "stored", alias)?.live.root).toBe(realpathSync(root));
  });
  it("refuses ambiguity rather than preferring a pending or first candidate", () => {
    const { reader, state, sessions } = fixture(); sessions.set("duplicate", { ...state });
    expect(() => discoverLiveSession(reader, "stored", root)).toThrow(/More than one/);
  });
  it.each(["root", "home", "profile", "stored-project", "missing-project"])("rejects a foreign or missing %s binding", kind => {
    const { reader } = fixture();
    if (kind === "root") reader.root = other;
    if (kind === "home") reader._env = { ...reader._env, VANTA_HOME: other };
    if (kind === "profile") reader._env = { ...reader._env, VANTA_PROFILE: "another" };
    expect(() => discoverLiveSession(reader, "stored", kind === "stored-project" ? other : kind === "missing-project" ? undefined : root)).toThrow(/match/);
  });
  it("returns no live match for an ordinary idle saved chat", () => {
    const { state, reader } = fixture(); state._chatActive = false;
    expect(discoverLiveSession(reader, "stored", root)).toBeUndefined();
  });
  it("rejects missing or malformed current turn identity and aborted state", () => {
    const { state, reader } = fixture(); state._chatRun = undefined;
    expect(() => discoverLiveSession(reader, "stored", root)).toThrow(/identity/);
    state._chatRun = { requestId: "../wrong", sessionId: "stored" };
    expect(() => discoverLiveSession(reader, "stored", root)).toThrow(/identity/);
    state._chatRun.requestId = "req-original"; state._chatAbort!.abort();
    expect(() => discoverLiveSession(reader, "stored", root)).toThrow(/observable/);
  });
});

describe("exact turn observation and terminal retention", () => {
  it("requires the exact original runtime client, stored id and request id", () => {
    const { state } = fixture();
    for (const args of [["other", "stored", "req-original"], ["original", "wrong", "req-original"], ["original", "stored", "wrong"], ["original", "stored", ""]]) {
      expect(() => observeLiveSession(state, args[0]!, args[1]!, args[2]!)).toThrow();
    }
    expect(observeLiveSession(state, "original", "stored", "req-original").live.running).toBe(true);
  });
  it("retains rich terminal failure before active cleanup, without inferring success", () => {
    const { state } = fixture();
    const result = { finalText: "partial", stoppedReason: "failed", receipt: { status: "failed", events: [], actions: ["retry_failed_step"], failureKind: "tool" } } as Parameters<typeof retainChatResult>[2];
    retainChatResult(state, "req-original", result);
    expect(state._chatActive).toBe(true);
    const snapshot = observeLiveSession(state, "original", "stored", "req-original");
    expect(snapshot.live.running).toBe(false);
    expect(snapshot.live.result).toBe(result);
    state._chatActive = false; state._chatAbort = undefined;
    expect(observeLiveSession(state, "original", "stored", "req-original").live.result).toBe(result);
  });
  it("cannot overwrite a superseding request with an old terminal result", () => {
    const { state } = fixture();
    state._chatRun = { sessionId: "stored", requestId: "req-new" };
    retainChatResult(state, "req-original", { finalText: "old" });
    expect(state._chatRun.result).toBeUndefined();
    expect(() => observeLiveSession(state, "original", "stored", "req-original")).toThrow(/changed/);
  });
  it("never treats an inactive missing result as complete", () => {
    const { state } = fixture(); state._chatActive = false; state._chatAbort = undefined;
    expect(() => observeLiveSession(state, "original", "stored", "req-original")).toThrow(/observable/);
  });
  it("accepts only the backend's bounded safe request identity format", () => {
    expect(validLiveRequestId("req-012-ABC")).toBe(true);
    for (const id of [null, "", "a".repeat(81), "a/b", "req\nwrong"]) expect(validLiveRequestId(id)).toBe(false);
  });
});
