import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { LiveBody } from "./app-body.js";
import { renderUi, waitForFrame, waitUntil } from "./test-render.js";
import type { SearchableSession } from "../search/cross-session.js";

const sessions: SearchableSession[] = [
  {
    id: "s1",
    title: "deno notes",
    messages: [{ role: "user", content: "deno permission model notes" }],
  },
];

function base(over = {}) {
  return {
    quickOpen: false,
    globalSearch: false,
    messageActions: false,
    searchSessions: [],
    entries: [],
    overlay: null,
    pending: null,
    mode: "default" as const,
    focus: "composer" as const,
    todos: [],
    files: [],
    history: [],
    skills: [],
    channels: [],
    vim: false,
    onQuickActivate: vi.fn(),
    onQuickClose: vi.fn(),
    onSearchSelect: vi.fn(),
    onSearchClose: vi.fn(),
    onMessageRetry: vi.fn(),
    onMessageBranch: vi.fn(),
    onMessageNote: vi.fn(),
    onMessageClose: vi.fn(),
    onSubmit: vi.fn(),
    onPaste: vi.fn(),
    onSelect: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

describe("LiveBody global search slot", () => {
  it("mounts GlobalSearchDialog and selects a matching saved session", async () => {
    const onSearchSelect = vi.fn();
    const inst = renderUi(h(LiveBody, base({ globalSearch: true, searchSessions: sessions, onSearchSelect })));
    await waitForFrame(inst, "Search all sessions");
    inst.input("deno");
    await waitForFrame(inst, "deno notes");
    inst.input("\r");
    await waitUntil(() => onSearchSelect.mock.calls.length > 0);
    expect(onSearchSelect.mock.calls[0]![0].sessionId).toBe("s1");
    inst.unmount();
  });

  it("mounts MessageActionsPanel and retries a selected user message", async () => {
    const onMessageRetry = vi.fn();
    const inst = renderUi(h(LiveBody, base({
      messageActions: true,
      entries: [{ kind: "user", text: "retry this" }],
      onMessageRetry,
    })));
    await waitForFrame(inst, "Message Actions");
    inst.input("\r"); // open action menu
    await waitForFrame(inst, "retry");
    inst.input("\x1b[B");
    await new Promise((r) => setTimeout(r, 10));
    inst.input("\r");
    await waitUntil(() => onMessageRetry.mock.calls.length > 0);
    expect(onMessageRetry).toHaveBeenCalledWith("retry this");
    inst.unmount();
  });
});
