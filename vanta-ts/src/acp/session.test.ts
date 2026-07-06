import { describe, it, expect, vi } from "vitest";
import { SessionManager, eventToUpdate, PERMISSION_OPTIONS } from "./session.js";
import type { AgentRunner, SessionSink, SessionUpdate, RunRequest } from "./session.js";
import type { StreamEvent } from "../agent/agent-types.js";

/** A fake sink that records every session/update and answers permission asks. */
function fakeSink(permissionAnswer = true): { sink: SessionSink; updates: Array<{ sessionId: string; update: SessionUpdate }>; perms: Array<{ sessionId: string }> } {
  const updates: Array<{ sessionId: string; update: SessionUpdate }> = [];
  const perms: Array<{ sessionId: string }> = [];
  const sink: SessionSink = {
    update: (sessionId, update) => updates.push({ sessionId, update }),
    requestPermission: async (sessionId) => {
      perms.push({ sessionId });
      return permissionAnswer ? "allow" : "";
    },
  };
  return { sink, updates, perms };
}

describe("eventToUpdate", () => {
  it("maps a text_delta to an agent_message_chunk", () => {
    expect(eventToUpdate({ type: "text_delta", delta: "hi" })).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "hi" },
    });
  });

  it("maps a thinking event to an agent_thought_chunk", () => {
    expect(eventToUpdate({ type: "thinking", text: "hmm" })).toEqual({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "hmm" },
    });
  });

  it("maps tool_start to an in_progress tool_call", () => {
    const u = eventToUpdate({ type: "tool_start", name: "read_file", args: {} });
    expect(u).toMatchObject({ sessionUpdate: "tool_call", title: "read_file", status: "in_progress" });
  });

  it("maps a failed tool_end to a failed tool_call_update", () => {
    const u = eventToUpdate({ type: "tool_end", name: "shell_cmd", ok: false, output: "boom" });
    expect(u).toMatchObject({ sessionUpdate: "tool_call_update", status: "failed" });
  });

  it("returns null for events with no incremental ACP update", () => {
    expect(eventToUpdate({ type: "turn_end", finalText: "done" } as StreamEvent)).toBeNull();
  });
});

describe("SessionManager lifecycle", () => {
  it("session/new creates a session with a fresh id", () => {
    const runner: AgentRunner = async () => ({ stopReason: "end_turn" });
    const { sink } = fakeSink();
    const mgr = new SessionManager(runner, sink, "/repo");
    const { sessionId } = mgr.newSession();
    expect(sessionId).toBeTruthy();
    expect(mgr.has(sessionId)).toBe(true);
  });

  it("session/load re-registers an unknown session id", () => {
    const runner: AgentRunner = async () => ({ stopReason: "end_turn" });
    const { sink } = fakeSink();
    const mgr = new SessionManager(runner, sink, "/repo");
    const res = mgr.loadSession("resumed-1");
    expect(res.sessionId).toBe("resumed-1");
    expect(mgr.has("resumed-1")).toBe(true);
  });

  it("set_mode records the mode and emits a current_mode_update", () => {
    const runner: AgentRunner = async () => ({ stopReason: "end_turn" });
    const { sink, updates } = fakeSink();
    const mgr = new SessionManager(runner, sink, "/repo");
    const { sessionId } = mgr.newSession();
    expect(mgr.setMode(sessionId, "plan")).toBe(true);
    expect(updates.at(-1)?.update).toEqual({ sessionUpdate: "current_mode_update", modeId: "plan" });
  });
});

describe("SessionManager.prompt", () => {
  it("drives the fake agent and emits session/update notifications from its stream", async () => {
    const runner: AgentRunner = async (req: RunRequest) => {
      req.emit({ type: "text_delta", delta: "Hello " });
      req.emit({ type: "tool_start", name: "read_file", args: { path: "a.ts" } });
      req.emit({ type: "tool_end", name: "read_file", ok: true, output: "contents" });
      req.emit({ type: "text_delta", delta: "world" });
      return { stopReason: "end_turn" };
    };
    const { sink, updates } = fakeSink();
    const mgr = new SessionManager(runner, sink, "/repo");
    const { sessionId } = mgr.newSession();

    const { stopReason } = await mgr.prompt(sessionId, "do it");

    expect(stopReason).toBe("end_turn");
    const kinds = updates.map((u) => u.update.sessionUpdate);
    expect(kinds).toEqual(["agent_message_chunk", "tool_call", "tool_call_update", "agent_message_chunk"]);
    expect(updates.every((u) => u.sessionId === sessionId)).toBe(true);
  });

  it("routes a tool's permission request to the injected approver", async () => {
    const approveSpy = vi.fn();
    const runner: AgentRunner = async (req: RunRequest) => {
      const allowed = await req.approve("rm -rf /tmp/x", "delete files", "shell_cmd");
      approveSpy(allowed);
      return { stopReason: "end_turn" };
    };
    const { sink, perms } = fakeSink(true);
    const mgr = new SessionManager(runner, sink, "/repo");
    const { sessionId } = mgr.newSession();

    await mgr.prompt(sessionId, "delete");

    expect(perms).toEqual([{ sessionId }]);
    expect(approveSpy).toHaveBeenCalledWith(true);
  });

  it("a denied permission request resolves false to the runner", async () => {
    const approveSpy = vi.fn();
    const runner: AgentRunner = async (req: RunRequest) => {
      approveSpy(await req.approve("push", "git push", "git_push"));
      return { stopReason: "end_turn" };
    };
    const { sink } = fakeSink(false);
    const mgr = new SessionManager(runner, sink, "/repo");
    const { sessionId } = mgr.newSession();
    await mgr.prompt(sessionId, "push");
    expect(approveSpy).toHaveBeenCalledWith(false);
  });

  it("offers an allow/reject permission menu", () => {
    expect(PERMISSION_OPTIONS.map((o) => o.optionId)).toEqual(["allow", "reject"]);
    expect(PERMISSION_OPTIONS.map((o) => o.kind)).toEqual(["allow_once", "reject_once"]);
  });

  it("session/cancel aborts the in-flight prompt and yields stopReason cancelled", async () => {
    const runner: AgentRunner = (req: RunRequest) =>
      new Promise((resolve) => {
        req.signal.addEventListener("abort", () => resolve({ stopReason: "end_turn" }));
      });
    const { sink } = fakeSink();
    const mgr = new SessionManager(runner, sink, "/repo");
    const { sessionId } = mgr.newSession();

    const running = mgr.prompt(sessionId, "long task");
    mgr.cancel(sessionId);
    const { stopReason } = await running;
    expect(stopReason).toBe("cancelled");
  });

  it("a runner that throws after cancel still resolves cancelled, not reject", async () => {
    const runner: AgentRunner = (req: RunRequest) =>
      new Promise((_resolve, reject) => {
        req.signal.addEventListener("abort", () => reject(new Error("aborted mid-flight")));
      });
    const { sink } = fakeSink();
    const mgr = new SessionManager(runner, sink, "/repo");
    const { sessionId } = mgr.newSession();
    const running = mgr.prompt(sessionId, "x");
    mgr.cancel(sessionId);
    await expect(running).resolves.toEqual({ stopReason: "cancelled" });
  });

  it("prompt on an unknown session throws", async () => {
    const runner: AgentRunner = async () => ({ stopReason: "end_turn" });
    const { sink } = fakeSink();
    const mgr = new SessionManager(runner, sink, "/repo");
    await expect(mgr.prompt("nope", "x")).rejects.toThrow(/unknown session/);
  });
});
