import { describe, expect, it } from "vitest";
import { handleChat, handleQueueChat, handleStopChat, type DesktopState } from "./handlers.js";

function response() {
  let status = 0; let body = "";
  return {
    res: { writeHead: (next: number) => { status = next; }, end: (next: string) => { body = next; } } as any,
    result: () => ({ status, body: JSON.parse(body) }),
  };
}

describe("desktop chat concurrency", () => {
  it("rejects an overlapping turn before reading another request body", async () => {
    const state: DesktopState = { root: "/repo", _chatActive: true };
    const reply = response();
    await handleChat(state, {} as any, reply.res);
    expect(reply.result()).toEqual({ status: 409, body: { error: "a turn is already running" } });
  });

  it("aborts the active turn and returns a stopping receipt", async () => {
    const controller = new AbortController();
    const state: DesktopState = { root: "/repo", _chatActive: true, _chatAbort: controller };
    const reply = response();
    await handleStopChat(state, reply.res);
    expect(controller.signal.aborted).toBe(true);
    expect(reply.result()).toEqual({ status: 202, body: { stopping: true } });
  });

  it("refuses a stop request when no turn is active", async () => {
    const reply = response();
    await handleStopChat({ root: "/repo" }, reply.res);
    expect(reply.result()).toEqual({ status: 409, body: { error: "no turn is running" } });
  });

  it("keeps one bounded next instruction for the active turn", async () => {
    const state: DesktopState = { root: "/repo", _chatActive: true };
    const first = response();
    const req = { on: (event: string, listener: (value?: Buffer) => void) => { if (event === "data") listener(Buffer.from('{"message":"then summarize"}')); if (event === "end") listener(); return req; } } as any;
    await handleQueueChat(state, req, first.res);
    expect(first.result()).toEqual({ status: 202, body: { queued: true } });
    expect(state._queuedMessage).toBe("then summarize");

    const second = response();
    await handleQueueChat(state, req, second.res);
    expect(second.result()).toEqual({ status: 409, body: { error: "one next instruction is already queued" } });
  });
});
