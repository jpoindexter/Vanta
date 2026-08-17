import { afterEach, describe, expect, it, vi } from "vitest";
import { latestRecoverableRun, submitMessage } from "./state.js";
import type { DesktopRunReceipt, EventRow, Message } from "./types.js";

function conversationState(order: string[]) {
  let messages: Message[] = [];
  let events: EventRow[] = [];
  let busy = false;
  const recovery: Array<DesktopRunReceipt | null> = [];
  return {
    state: {
      refresh: async () => { order.push("refresh"); },
      setMessages: (updater: (current: Message[]) => Message[]) => { messages = updater(messages); },
      setActiveTitle: vi.fn(),
      setEvents: (next: EventRow[]) => { events = next; },
      setStreamText: vi.fn(),
      setBusy: (next: boolean) => { busy = next; },
      setDraft: vi.fn(),
      setRecovery: (next: DesktopRunReceipt | null) => { recovery.push(next); },
    },
    snapshot: () => ({ messages, events, busy, recovery }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("desktop turn completion", () => {
  it("primes from the submit gesture and plays only after a successful assistant turn", async () => {
    const order: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      order.push("request");
      return {
        ok: true,
        json: async () => ({ finalText: "Finished", events: [{ label: "done", ok: true }] }),
      };
    }));
    const harness = conversationState(order);

    await submitMessage(harness.state, "do the task", { cues: {
      prime: () => { order.push("prime"); },
      complete: () => { order.push("completion-sound"); },
    } });

    expect(order).toEqual(["prime", "request", "completion-sound", "refresh"]);
    expect(harness.snapshot()).toEqual({
      messages: [
        { role: "user", content: "do the task" },
        { role: "assistant", content: "Finished" },
      ],
      events: [{ label: "done", ok: true }],
      busy: false,
      recovery: [null, null],
    });
  });

  it("stays silent when the turn fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const complete = vi.fn();
    const harness = conversationState([]);

    await submitMessage(harness.state, "do the task", { cues: { complete } });

    expect(complete).not.toHaveBeenCalled();
    expect(harness.snapshot().messages.at(-1)).toEqual({ role: "assistant", content: "offline" });
    expect(harness.snapshot().busy).toBe(false);
    expect(harness.snapshot().recovery.at(-1)).toMatchObject({
      status: "failed",
      checkpoint: { instruction: "do the task", partialText: "offline" },
      actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"],
    });
  });

  it("offers scoped retry after a failed completed response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ finalText: "Partial work", events: [{ label: "provider unavailable", ok: false }] }) })));
    const harness = conversationState([]);

    await submitMessage(harness.state, "do the task");

    expect(harness.snapshot().recovery.at(-1)).toMatchObject({
      status: "failed",
      checkpoint: { instruction: "do the task", partialText: "Partial work" },
    });
  });
});

/** Resolve one captured `setDraft` call against a simulated current value. */
function resolveDraftCall(setDraft: ReturnType<typeof vi.fn>, index: number, current: string): string {
  const arg = setDraft.mock.calls[index]?.[0];
  return typeof arg === "function" ? String(arg(current)) : String(arg);
}

describe("desktop composer draft", () => {
  it("clears the composer when the message is sent, not when the turn resolves", async () => {
    let release: () => void = () => {};
    const inflight = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => {
      await inflight;
      return { ok: true, json: async () => ({ finalText: "Finished", events: [{ label: "done", ok: true }] }) };
    }));
    const harness = conversationState([]);
    const setDraft = harness.state.setDraft as ReturnType<typeof vi.fn>;

    const pending = submitMessage(harness.state, "do the task");

    // Asserted with the request still in flight: the box must empty on send, not
    // minutes later when the run finishes.
    expect(setDraft).toHaveBeenCalledTimes(1);
    expect(resolveDraftCall(setDraft, 0, "previous draft")).toBe("");
    release();
    await pending;
  });

  it("restores a failed message without overwriting a new draft", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const harness = conversationState([]);
    const setDraft = harness.state.setDraft as ReturnType<typeof vi.fn>;

    await submitMessage(harness.state, "do the task");

    expect(resolveDraftCall(setDraft, 0, "previous draft")).toBe("");
    expect(resolveDraftCall(setDraft, 1, "")).toBe("do the task");
    expect(resolveDraftCall(setDraft, 1, "new thought")).toBe("new thought");
    expect(harness.snapshot().recovery.at(-1)).toMatchObject({
      checkpoint: { instruction: "do the task" },
      actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"],
    });
  });
});

describe("saved run recovery", () => {
  const failed: DesktopRunReceipt = {
    status: "failed",
    failureKind: "setup",
    events: [{ label: "Provider authentication required", ok: false }],
    actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"],
    checkpoint: { instruction: "check my email", partialText: "401 Unauthorized" },
  };

  it("restores the latest unfinished instruction after session reload", () => {
    expect(latestRecoverableRun([
      { role: "assistant", content: "older", desktopRun: { ...failed, checkpoint: { instruction: "older request" } } },
      { role: "assistant", content: "auth failed", desktopRun: failed },
    ])).toEqual({ receipt: failed, instruction: "check my email" });
  });

  it("does not revive completed work", () => {
    expect(latestRecoverableRun([{
      role: "assistant",
      content: "done",
      desktopRun: { status: "done", events: [], actions: [] },
    }])).toBeNull();
  });
});
