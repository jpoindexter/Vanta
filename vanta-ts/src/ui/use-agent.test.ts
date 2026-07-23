import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failureSummary, runTurnGates, useAgent } from "./use-agent.js";
import { freshGateState } from "../repl/post-turn-gates.js";
import { startBackgroundResponse } from "../repl/bg-response-cmd.js";
import { invalidateNdConfig } from "../nd/profile.js";
import type { ImageAttachment } from "../types.js";
import type { ReplState } from "../repl/types.js";

// Proves the ND executive-function engine fires in the DEFAULT TUI host (not just
// the readline REPL): runTurnGates → runPostTurnGates → ndGatesAfterTurn → a note.

type Action = { t: string; text?: string; suggestions?: string[] };

describe("failureSummary", () => {
  it("selects the actionable diagnostic instead of a test runner banner", () => {
    const output = [
      " RUN  v3.2.6 /Users/x/Vanta",
      " Test Files  1 passed (1)",
      " Unhandled Rejection: Error: kill EPERM",
    ].join("\n");
    expect(failureSummary(output)).toBe("Unhandled Rejection: Error: kill EPERM");
  });

  it.each([
    "TypeError: detach is not a function",
    "AssertionError: expected 1 to be 0",
  ])("recognizes error-class diagnostics: %s", (diagnostic) => {
    const output = [
      " RUN  v3.2.6 /Users/x/Vanta",
      " Test Files  1 failed (1)",
      diagnostic,
    ].join("\n");
    expect(failureSummary(output)).toBe(diagnostic);
  });
});

function makeDeps(messages: { role: string; content: string }[], notes: Action[]) {
  return {
    setup: { safety: { getGoals: async () => [] } },
    repoRoot: mkdtempSync(join(tmpdir(), "vanta-tui-gates-")),
    dispatch: (a: Action) => { if (a.t === "note") notes.push(a); },
    convoRef: { current: { messages } },
    replStateRef: { current: { turnIndex: 1, started: new Date(0).toISOString() } },
    gatesRef: { current: freshGateState() },
  };
}

describe("runTurnGates (TUI EF-engine wiring)", () => {
  beforeEach(() => {
    invalidateNdConfig();
    process.env.VANTA_HOME = mkdtempSync(join(tmpdir(), "vanta-home-"));
    delete process.env.VANTA_ND; // engine on by default
  });

  it("fires the complexity gate as a transcript note on a complex turn", async () => {
    const notes: Action[] = [];
    const deps = makeDeps(
      [{ role: "user", content: "refactor and rewrite the schema with a multi-file migration" }],
      notes,
    );
    await runTurnGates(deps as never);
    expect(notes.some((n) => (n.text ?? "").includes("🧭"))).toBe(true);
  });

  it("stays silent on a simple turn (no false nudges)", async () => {
    const notes: Action[] = [];
    const deps = makeDeps([{ role: "user", content: "what time is it?" }], notes);
    await runTurnGates(deps as never);
    expect(notes).toHaveLength(0);
  });

  it("threads gate state across turns", async () => {
    const notes: Action[] = [];
    const deps = makeDeps([{ role: "user", content: "hello" }], notes);
    const before = deps.gatesRef.current;
    await runTurnGates(deps as never);
    expect(deps.gatesRef.current).not.toBe(before); // a new advanced state object
  });
});

describe("useAgent send — image attachments", () => {
  const img: ImageAttachment = { mime: "image/png", dataBase64: "AAAA" };

  function sendDeps(pendingImages?: ImageAttachment[]) {
    const sendSpy = vi.fn(async (_text: string, _images?: ImageAttachment[], _signal?: AbortSignal) => ({ finalText: "ok" }));
    const conv = { messages: [], send: sendSpy };
    const deps = {
      setup: {
        systemPrompt: "sys",
        provider: {
          modelId: () => "m",
          contextWindow: () => 100_000,
          complete: async () => ({ text: "ok", toolCalls: [], finishReason: "stop" }),
        },
        safety: { getGoals: async () => [] },
        registry: { schemas: () => [] },
      },
      repoRoot: mkdtempSync(join(tmpdir(), "vanta-send-")),
      dispatch: (_a?: unknown) => {},
      setPending: () => {},
      interruptRef: { current: null },
      convoRef: { current: conv },
      replStateRef: { current: { turnIndex: 0, started: new Date(0).toISOString(), pendingImages } },
      gatesRef: { current: freshGateState() },
    };
    return { deps, sendSpy };
  }

  it("forwards pending images to conv.send and clears them after the turn", async () => {
    const { deps, sendSpy } = sendDeps([img]);
    const { send } = useAgent(deps as never);
    await send("describe this");
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0]![1]).toEqual([img]); // images are the 2nd arg
    expect(deps.replStateRef.current.pendingImages).toBeUndefined(); // consumed once
  });

  it("passes undefined when no images are pending (plain text turn)", async () => {
    const { deps, sendSpy } = sendDeps(undefined);
    const { send } = useAgent(deps as never);
    await send("hi");
    expect(sendSpy.mock.calls[0]![1]).toBeUndefined();
  });

  it("stores the result when the active turn is detached mid-send", async () => {
    const sendSpy = vi.fn(async () => {
      startBackgroundResponse(state, "long prompt", new Date(0));
      return { finalText: "ok" };
    });
    const conv = { messages: [], send: sendSpy };
    const state = { turnIndex: 0, started: new Date(0).toISOString() } as ReplState;
    const deps = {
      setup: { provider: { modelId: () => "m" } },
      repoRoot: mkdtempSync(join(tmpdir(), "vanta-send-")),
      dispatch: () => {},
      setPending: () => {},
      interruptRef: { current: null },
      convoRef: { current: conv },
      replStateRef: { current: state },
      gatesRef: { current: freshGateState() },
    };
    const { send } = useAgent(deps as never);
    await send("hi");
    expect(state.backgroundResponse).toMatchObject({
      status: "done",
      prompt: "long prompt",
      finalText: "ok",
    });
  });

  it("does not overwrite a prior detached response when a new foreground turn starts", async () => {
    const { deps } = sendDeps(undefined);
    const state = deps.replStateRef.current as ReplState;
    startBackgroundResponse(state, "long prompt", new Date(0));
    const { send } = useAgent(deps as never);
    await send("hi");
    expect(state.backgroundResponse).toMatchObject({
      status: "running",
      prompt: "long prompt",
    });
  });

  it("dispatches next-prompt suggestions after a foreground turn", async () => {
    const actions: Action[] = [];
    const { deps } = sendDeps(undefined);
    deps.dispatch = (a: unknown) => { actions.push(a as Action); };
    deps.setup.provider.complete = async () => ({
      text: JSON.stringify(["Verify this", "Commit this", "Show roadmap"]),
      toolCalls: [],
      finishReason: "stop",
    });
    const old = process.env.VANTA_PROMPT_SUGGESTIONS;
    process.env.VANTA_PROMPT_SUGGESTIONS = "1";
    try {
      const { send } = useAgent(deps as never);
      await send("fix the bug");
      await waitFor(() => actions.some((a) => a.t === "promptSuggestions"));
      expect(actions.find((a) => a.t === "promptSuggestions")).toMatchObject({
        suggestions: ["Verify this", "Commit this", "Show roadmap"],
      });
    } finally {
      if (old === undefined) delete process.env.VANTA_PROMPT_SUGGESTIONS;
      else process.env.VANTA_PROMPT_SUGGESTIONS = old;
    }
  });

  it("does not dispatch suggestions when the feature is disabled", async () => {
    const actions: Action[] = [];
    const { deps } = sendDeps(undefined);
    deps.dispatch = (a: unknown) => { actions.push(a as Action); };
    const old = process.env.VANTA_PROMPT_SUGGESTIONS;
    process.env.VANTA_PROMPT_SUGGESTIONS = "0";
    try {
      const { send } = useAgent(deps as never);
      await send("hi");
      await new Promise((r) => setTimeout(r, 20));
      expect(actions.some((a) => a.t === "promptSuggestions")).toBe(false);
    } finally {
      if (old === undefined) delete process.env.VANTA_PROMPT_SUGGESTIONS;
      else process.env.VANTA_PROMPT_SUGGESTIONS = old;
    }
  });

  it("notifies after a completed foreground turn when enabled and unfocused", async () => {
    const notify = vi.fn();
    const { deps } = sendDeps(undefined);
    const oldEnabled = process.env.VANTA_NOTIFY_UNFOCUSED;
    process.env.VANTA_NOTIFY_UNFOCUSED = "1";
    try {
      const { send } = useAgent({ ...deps, notifyTurnComplete: notify, windowFocused: () => false } as never);
      await send("ship this");
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({
        title: "Vanta finished",
        message: "Turn complete: ship this",
        notificationType: "turn_complete",
      }));
    } finally {
      if (oldEnabled === undefined) delete process.env.VANTA_NOTIFY_UNFOCUSED;
      else process.env.VANTA_NOTIFY_UNFOCUSED = oldEnabled;
    }
  });

  it("stays silent after a completed foreground turn when focused", async () => {
    const notify = vi.fn();
    const { deps } = sendDeps(undefined);
    const oldEnabled = process.env.VANTA_NOTIFY_UNFOCUSED;
    process.env.VANTA_NOTIFY_UNFOCUSED = "1";
    try {
      const { send } = useAgent({ ...deps, notifyTurnComplete: notify, windowFocused: () => true } as never);
      await send("ship this");
      expect(notify).not.toHaveBeenCalled();
    } finally {
      if (oldEnabled === undefined) delete process.env.VANTA_NOTIFY_UNFOCUSED;
      else process.env.VANTA_NOTIFY_UNFOCUSED = oldEnabled;
    }
  });
});

async function waitFor(cond: () => boolean, maxTicks = 100): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  if (!cond()) throw new Error("waitFor: condition not met");
}
