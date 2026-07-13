import { afterEach, describe, expect, it, vi } from "vitest";
import { submitMessage } from "./state.js";
import type { EventRow, Message } from "./types.js";

function conversationState(order: string[]) {
  let messages: Message[] = [];
  let events: EventRow[] = [];
  let busy = false;
  return {
    state: {
      refresh: async () => { order.push("refresh"); },
      setMessages: (updater: (current: Message[]) => Message[]) => { messages = updater(messages); },
      setActiveTitle: vi.fn(),
      setEvents: (next: EventRow[]) => { events = next; },
      setStreamText: vi.fn(),
      setBusy: (next: boolean) => { busy = next; },
      setDraft: vi.fn(),
    },
    snapshot: () => ({ messages, events, busy }),
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

    await submitMessage(harness.state, "do the task", {
      prime: () => { order.push("prime"); },
      complete: () => { order.push("completion-sound"); },
    });

    expect(order).toEqual(["prime", "request", "completion-sound", "refresh"]);
    expect(harness.snapshot()).toEqual({
      messages: [
        { role: "user", content: "do the task" },
        { role: "assistant", content: "Finished" },
      ],
      events: [{ label: "done", ok: true }],
      busy: false,
    });
  });

  it("stays silent when the turn fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const complete = vi.fn();
    const harness = conversationState([]);

    await submitMessage(harness.state, "do the task", { complete });

    expect(complete).not.toHaveBeenCalled();
    expect(harness.snapshot().messages.at(-1)).toEqual({ role: "assistant", content: "offline" });
    expect(harness.snapshot().busy).toBe(false);
  });
});
