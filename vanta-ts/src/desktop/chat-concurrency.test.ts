import { describe, expect, it, vi } from "vitest";
import { handleChat, handleQueueChat, handleStopChat, type DesktopState } from "./handlers.js";

function response() {
  let status = 0; let body = "";
  return {
    res: { writeHead: (next: number) => { status = next; }, end: (next: string) => { body = next; } } as any,
    result: () => ({ status, body: JSON.parse(body) }),
  };
}

function chatRequest(message: string) {
  const body = JSON.stringify({ message });
  const req = { on: (event: string, listener: (value?: Buffer) => void) => { if (event === "data") listener(Buffer.from(body)); if (event === "end") listener(); return req; } } as any;
  return req;
}

type FakeSend = NonNullable<DesktopState["convo"]>["send"];

function recoveryState(send: FakeSend): DesktopState {
  return {
    root: "/repo",
    sessionId: "desktop-test",
    sessionStarted: "2026-01-01T00:00:00.000Z",
    setup: { provider: { modelId: () => "fake" } as any, goals: [], registry: {} as any, safety: {} as any, systemPrompt: "" } as any,
    convo: { messages: [{ role: "system", content: "" }], send } as any,
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
    const req = chatRequest("then summarize");
    await handleQueueChat(state, req, first.res);
    expect(first.result()).toEqual({ status: 202, body: { queued: true } });
    expect(state._queuedMessage).toBe("then summarize");

    const second = response();
    await handleQueueChat(state, req, second.res);
    expect(second.result()).toEqual({ status: 409, body: { error: "one next instruction is already queued" } });
  });

  it("returns a classified recovery receipt with checkpoint after a failed run", async () => {
    let state: DesktopState;
    state = recoveryState(vi.fn(async () => { state._chatDeltas?.push("Partial result."); throw new Error("provider offline"); }));
    const reply = response();

    await handleChat(state, chatRequest("do work"), reply.res);

    expect(reply.result().body.receipt).toMatchObject({
      status: "failed",
      failureKind: "model",
      actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"],
      checkpoint: { instruction: "do work", partialText: "Partial result." },
    });
    expect(reply.result().body.finalText).toContain("Partial result.");
    expect(state.convo?.messages.at(-1)).toMatchObject({ role: "assistant", desktopRun: { status: "failed" } });
  });

  it("returns an interrupted recovery receipt when the run stops cleanly", async () => {
    const state = recoveryState(vi.fn(async () => ({ finalText: "Interrupted.", iterations: 1, stoppedReason: "interrupted" as const, toolIterations: 0 })));
    const reply = response();

    await handleChat(state, chatRequest("stop soon"), reply.res);

    expect(reply.result().body.receipt).toMatchObject({
      status: "interrupted",
      failureKind: "interrupted",
      checkpoint: { instruction: "stop soon", partialText: "Interrupted." },
    });
    expect(state.convo?.messages.at(-1)).toMatchObject({ role: "assistant", desktopRun: { status: "interrupted" } });
  });

  it.each([
    ["setup", "provider is required before running"],
    ["tool", "tool shell_cmd failed"],
    ["user_denied", "approval denied by user"],
  ] as const)("classifies %s failures for recovery", async (failureKind, message) => {
    const state = recoveryState(vi.fn(async () => { throw new Error(message); }));
    const reply = response();

    await handleChat(state, chatRequest("continue"), reply.res);

    expect(reply.result().body.receipt).toMatchObject({
      status: "failed",
      failureKind,
      actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"],
      checkpoint: { instruction: "continue" },
    });
  });
});
