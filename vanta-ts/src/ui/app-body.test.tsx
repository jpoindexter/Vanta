import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { LiveBody } from "./app-body.js";
import { reduce } from "./reducer.js";
import { initialState } from "./types.js";
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
    queued: [],
    files: [],
    history: [],
    skills: [],
    channels: [],
    vim: false,
    promptSuggestions: [],
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
    onApplyModelPick: vi.fn(),
    onSwitchProvider: vi.fn(),
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

describe("LiveBody prompt suggestions", () => {
  it("shows suggested prompts below the live region and submits the focused one", async () => {
    const onSubmit = vi.fn();
    const inst = renderUi(h(LiveBody, base({
      focus: "prompt-suggestions",
      promptSuggestions: ["Verify it", "Commit it", "Show roadmap"],
      onSubmit,
    })));
    await waitForFrame(inst, "Next prompts");
    inst.input("\r");
    await waitUntil(() => onSubmit.mock.calls.length > 0);
    expect(onSubmit).toHaveBeenCalledWith("Verify it");
    inst.unmount();
  });
});

describe("LiveBody task checklist", () => {
  it("shows live task status above the composer", async () => {
    const inst = renderUi(h(LiveBody, base({
      todos: [
        { text: "Inspect the task", status: "done" },
        { text: "Implement the change", activeForm: "Implementing the change", status: "in_progress" },
        { text: "Verify the TUI", status: "pending" },
      ],
    })));
    const frame = await waitForFrame(inst, "✻ Implementing the change…");
    expect(frame).toContain("✓ Inspect the task");
    expect(frame).toContain("■ Implementing the change");
    expect(frame).toContain("□ Verify the TUI");
    expect(frame).toContain("Ask Vanta anything");
    inst.unmount();
  });

  it("renders an unfinished checklist as idle after the turn returns control", async () => {
    const settled = reduce({
      ...initialState,
      busy: true,
      todos: [
        { text: "Confirm scheduling", status: "done" },
        { text: "Create operator", status: "done" },
        { text: "Verify stored loop", activeForm: "Verifying the stored loop", status: "in_progress" },
      ],
    }, { t: "turnEnd" });
    const inst = renderUi(h(LiveBody, base({
      activity: { elapsed: "324m49s", tokens: 35_400, effort: "high" },
      todos: settled.todos,
    })));
    const frame = await waitForFrame(inst, "3 tasks (2 done, 0 in progress, 1 open)");
    expect(frame).not.toContain("Verifying the stored loop…");
    expect(frame).not.toContain("324m49s");
    expect(frame).toContain("□ Verify stored loop");
    expect(frame).toContain("Ask Vanta anything");
    inst.unmount();
  });
});
