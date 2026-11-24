import type http from "node:http";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleChat, handleStopChat } from "./handler-chat.js";
import { clearChatExecution } from "./handler-chat-lifecycle.js";
import { claimQueuedChatInput, executeChat } from "./handler-chat-execution.js";
import type { DesktopState } from "./handler-state.js";

vi.mock("./handler-chat-execution.js", () => ({ executeChat: vi.fn(), claimQueuedChatInput: vi.fn() }));
vi.mock("./provider-auth-store.js", () => ({ loadProviderAuthRequired: async () => undefined }));

function response() {
  let status = 0;
  const res = { writeHead: (code: number) => { status = code; }, end() {} } as unknown as http.ServerResponse;
  return { res, status: () => status };
}

function request(payload?: Record<string, unknown>) {
  const stream = new PassThrough();
  const req = stream as unknown as http.IncomingMessage;
  if (payload) stream.end(JSON.stringify(payload));
  return { stream, req };
}

function state(): DesktopState { return { root: "/fixture", sessionId: "fixture-chat" }; }
const tick = () => new Promise((resolve) => setImmediate(resolve));
beforeEach(() => { vi.clearAllMocks(); });

describe("per-client chat admission", () => {
  it.each([false, true])("rejects a second request during body admission (queue=%s)", async (resumeQueue) => {
    const current = state(), first = request(), a = response(), b = response();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(executeChat).mockImplementation(async () => { await blocked; });
    const pending = handleChat(current, first.req, a.res);
    const later = handleChat(current, request(resumeQueue ? { resumeQueue: true } : { message: "second" }).req, b.res);
    try {
      await tick();
      expect(b.status()).toBe(409);
      expect(executeChat).not.toHaveBeenCalled();
      expect(claimQueuedChatInput).not.toHaveBeenCalled();
    } finally {
      first.stream.end("{}");
      release();
      await Promise.all([pending, later]);
    }
  });

  it("releases admission after invalid input and permits the next request", async () => {
    const current = state(), invalid = response(), valid = response();
    vi.mocked(executeChat).mockImplementation(async (_context, res) => { res.writeHead(200); res.end(); });
    await handleChat(current, request({}).req, invalid.res);
    await handleChat(current, request({ message: "next" }).req, valid.res);
    expect(invalid.status()).toBe(400);
    expect(valid.status()).toBe(200);
    expect(executeChat).toHaveBeenCalledOnce();
  });

  it("releases admission after body read failure", async () => {
    const current = state(), first = request();
    const pending = expect(handleChat(current, first.req, response().res)).rejects.toThrow("fixture disconnect");
    first.stream.emit("error", new Error("fixture disconnect"));
    await pending;
    const next = response();
    await handleChat(current, request({}).req, next.res);
    expect(next.status()).toBe(400);
  });

  it("does not block an independent client while another body is pending", async () => {
    const first = request();
    const pending = handleChat(state(), first.req, response().res);
    try {
      const other = response();
      await handleChat(state(), request({}).req, other.res);
      expect(other.status()).toBe(400);
    } finally { first.stream.end("{}"); await pending; }
  });
});

describe("chat execution cleanup ownership", () => {
  it("leaves every current field intact when an older execution finishes", async () => {
    const controller = new AbortController();
    const current: DesktopState = { ...state(), _chatAbort: controller, _chatActive: true,
      _chatDeltas: ["current"], _instructionDisplayedText: ["current"], currentEvents: [{ label: "current" }],
      _streamTextDeltas: true, forceFreshApprovals: true };
    const original = { ...current };
    clearChatExecution(current, new AbortController());
    expect(current).toEqual(original);
    const stop = response();
    await handleStopChat(current, stop.res);
    expect(stop.status()).toBe(202);
    expect(controller.signal.aborted).toBe(true);
  });
});
