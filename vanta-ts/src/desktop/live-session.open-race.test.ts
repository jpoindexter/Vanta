import { mkdtempSync, mkdirSync } from "node:fs";
import type http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";
import type { DesktopState } from "./handler-state.js";
import { retainChatResult } from "./live-session.js";

const mocks = vi.hoisted(() => ({ load: vi.fn(), prepare: vi.fn(), attach: vi.fn() }));
vi.mock("../session.js", () => ({ prepareRun: mocks.prepare }));
vi.mock("./handler-conversation.js", () => ({ attachConversation: mocks.attach }));
vi.mock("../sessions/model-scope.js", () => ({ resolveSessionModel: () => undefined, providerIdFor: () => "fixture" }));
vi.mock("../sessions/store.js", () => ({ loadSession: mocks.load, listAllSessions: vi.fn(),
  deleteSession: vi.fn(), newSessionId: vi.fn(), renameSession: vi.fn(), saveSession: vi.fn(),
  setSessionArchived: vi.fn(), setSessionTrashed: vi.fn() }));
const { handleOpenSession } = await import("./handler-sessions.js");
const box = mkdtempSync(join(tmpdir(), "vanta-open-race-")), root = join(box, "project"), home = join(box, "writer");
mkdirSync(root); mkdirSync(home);
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const saved = () => ({ id: "stored", cwd: root, started: "2026-10-28", messages: [{ role: "user", content: "old checkpoint" }] });
function fixture(active = true) {
  const sessions = new Map<string, DesktopState>();
  const state = { root, _env: { VANTA_HOME: home, VANTA_PROFILE: "writer" }, _sessions: sessions,
    sessionId: "stored", _chatRun: { requestId: "req-original", sessionId: "stored" },
    _chatActive: active, _chatAbort: new AbortController(),
    convo: { messages: [{ role: "user", content: "original" }], send: async () => { throw new Error("not used"); }, setProvider() {}, setSessionMemory() {} },
  } as DesktopState;
  const reader: DesktopState = { root, _env: { ...state._env }, _sessions: sessions };
  sessions.set("original", state); sessions.set("reader", reader);
  return { state, reader };
}
function open(reader: DesktopState, body: Record<string, unknown> = { id: "stored", resumeLive: true }) {
  const req = Readable.from([JSON.stringify(body)]) as http.IncomingMessage;
  let status = 0, output = "";
  const res = { writeHead: (value: number) => { status = value; }, end: (value: string) => { output = value; } } as unknown as http.ServerResponse;
  return { done: handleOpenSession(reader, req, res), result: () => ({ status, body: JSON.parse(output) }) };
}
beforeEach(() => { vi.clearAllMocks(); mocks.prepare.mockImplementation(async () => { throw new Error("unexpected provider setup"); }); });
it("returns the original fresh terminal result when disk load captured an older transcript before cleanup", async () => {
  const { state, reader } = fixture(), disk = deferred<ReturnType<typeof saved>>();
  mocks.load.mockReturnValue(disk.promise);
  const pending = open(reader); await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  state.convo!.messages.push({ role: "assistant", content: "fresh terminal" });
  retainChatResult(state, "req-original", { finalText: "fresh terminal", stoppedReason: "done", sessionId: "stored" });
  state._chatActive = false; state._chatAbort = undefined;
  disk.resolve(saved()); await pending.done;
  expect(pending.result()).toMatchObject({ status: 200, body: { messages: [{ content: "original" }, { content: "fresh terminal" }], live: { clientId: "original", running: false, result: { finalText: "fresh terminal" } } } });
  expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.attach).not.toHaveBeenCalled();
});
it("rejects a replaced request after the disk await rather than adopting new authority", async () => {
  const { state, reader } = fixture(), disk = deferred<ReturnType<typeof saved>>(); mocks.load.mockReturnValue(disk.promise);
  const pending = open(reader); await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  state._chatRun = { sessionId: "stored", requestId: "req-new" };
  disk.resolve(saved()); await pending.done;
  expect(pending.result().status).toBe(409); expect(mocks.attach).not.toHaveBeenCalled();
});
it("rejects a newly started and completed request during provider preparation, without attaching stale disk history", async () => {
  const { state, reader } = fixture(false), setup = deferred<unknown>();
  mocks.load.mockResolvedValue(saved()); mocks.prepare.mockReturnValue(setup.promise);
  const pending = open(reader); await vi.waitFor(() => expect(mocks.prepare).toHaveBeenCalledOnce());
  state._chatRun = { sessionId: "stored", requestId: "req-new" }; state._chatActive = true;
  retainChatResult(state, "req-new", { finalText: "new terminal", stoppedReason: "done", sessionId: "stored" }); state._chatActive = false;
  setup.resolve({ provider: { modelId: () => "fixture" } }); await pending.done;
  expect(pending.result().status).toBe(409); expect(mocks.attach).not.toHaveBeenCalled();
});
it.each([{ id: "other", resumeLive: true }, { id: "stored" }])("refuses an active client's replacement or ordinary history open: %j", async body => {
  const { state } = fixture(); const original = state.convo;
  const pending = open(state, body); await pending.done;
  expect(pending.result().status).toBe(409); expect(state.convo).toBe(original);
  expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.attach).not.toHaveBeenCalled();
});
it("rejects another runtime's new turn after the captured original completes", async () => {
  const { state, reader } = fixture(), disk = deferred<ReturnType<typeof saved>>(); mocks.load.mockReturnValue(disk.promise);
  const pending = open(reader); await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  retainChatResult(state, "req-original", { finalText: "original terminal", sessionId: "stored" }); state._chatActive = false;
  state._sessions!.set("new-client", { ...state, _chatActive: true, _chatRun: { sessionId: "stored", requestId: "req-new" } });
  disk.resolve(saved()); await pending.done;
  expect(pending.result().status).toBe(409); expect(mocks.attach).not.toHaveBeenCalled();
});
