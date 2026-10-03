import { afterEach, describe, expect, it, vi } from "vitest";
import { conversationHandlers } from "./state.js";
import type { EventRow, Message } from "./types.js";

function harness() {
  const observed = {
    id: "chat-a", draft: "Draft A", title: "Chat A", messages: [] as Message[],
    events: [{ label: "Stopped by operator.", ok: false }] as EventRow[],
  };
  const state: Parameters<typeof conversationHandlers>[0] = {
    refresh: vi.fn(async () => {}), setSessionId: (id) => { observed.id = id; },
    setActiveTitle: (title) => { observed.title = title; },
    setMessages: (update) => { observed.messages = update(observed.messages); },
    setDraft: (update) => { observed.draft = typeof update === "function" ? update(observed.draft) : update; },
    activateDraft: vi.fn(async (id) => { observed.draft = id === "chat-b" ? "Draft B" : "Draft A"; }),
    clearDraftFor: vi.fn(async () => {}), setEvents: (events) => { observed.events = events; },
    setStreamText: vi.fn(), setBusy: vi.fn(),
    setRecovery: vi.fn(), sessionOpenRequest: { current: 0 },
  };
  return { observed, state, handlers: conversationHandlers(state, {}, { current: "" }) };
}

afterEach(() => vi.unstubAllGlobals());

describe("transactional chat selection", () => {
  it("binds a submitted draft to the renderer's selected session", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ finalText: "Accepted", events: [] }) }));
    vi.stubGlobal("fetch", fetch);
    const { state } = harness();
    const handlers = conversationHandlers({ ...state, sessionId: "chat-a" }, {}, { current: "" });
    await handlers.submit("Draft A");
    const [, request] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(request.body as string)).toMatchObject({ message: "Draft A", sessionId: "chat-a" });
  });

  it("retains the original identity and draft when the runtime rejects a selection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, text: async () => "Session missing" })));
    const { observed, state, handlers } = harness();
    await expect(handlers.openSession("chat-b")).rejects.toThrow();
    expect(observed).toMatchObject({ id: "chat-a", draft: "Draft A", title: "Chat A" });
    expect(observed.events).toEqual([{ label: "Stopped by operator.", ok: false }]);
    expect(state.activateDraft).not.toHaveBeenCalled();
  });

  it("does not expose the new owner before the runtime accepts it", async () => {
    let accept!: () => void;
    const pending = new Promise<void>((resolve) => { accept = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => { await pending; return { ok: true, json: async () => ({ title: "Chat B", messages: [] }) }; }));
    const { observed, handlers } = harness();
    const switching = handlers.openSession("chat-b");
    expect(observed).toMatchObject({ id: "chat-a", draft: "Draft A", title: "Chat A" });
    accept(); await switching;
    expect(observed).toMatchObject({ id: "chat-b", draft: "Draft B", title: "Chat B" });
  });

  it("clears the previous chat's activity when the selected chat has no receipt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ title: "Chat B", messages: [] }) })));
    const { observed, handlers } = harness();
    await handlers.openSession("chat-b");
    expect(observed.events).toEqual([]);
  });

  it.each(["done", "interrupted"] as const)("restores only the selected chat's latest %s receipt activity", async (status) => {
    const events = [{ label: `Chat B ${status}`, ok: status === "done" }];
    const messages: Message[] = [
      { role: "assistant", content: "Earlier turn", desktopRun: { status: "done", actions: [], events: [{ label: "Earlier activity" }] } },
      { role: "assistant", content: "Latest turn", desktopRun: { status, actions: [], events } },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ title: "Chat B", messages }) })));
    const { observed, handlers } = harness();
    await handlers.openSession("chat-b");
    expect(observed.events).toEqual(events);
  });

  it("does not replace the selected chat's activity with a late selection response", async () => {
    let acceptEarlier!: () => void;
    const earlier = new Promise<void>((resolve) => { acceptEarlier = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (_url, request) => {
      const { id } = JSON.parse(request.body as string) as { id: string };
      if (id === "chat-b") await earlier;
      return { ok: true, json: async () => ({ title: id, messages: [
        { role: "assistant", content: id, desktopRun: { status: "done", actions: [], events: [{ label: id }] } },
      ] }) };
    }));
    const { observed, handlers } = harness();
    const switching = handlers.openSession("chat-b");
    await handlers.openSession("chat-c");
    acceptEarlier(); await switching;
    expect(observed.id).toBe("chat-c");
    expect(observed.events).toEqual([{ label: "chat-c" }]);
  });
});
