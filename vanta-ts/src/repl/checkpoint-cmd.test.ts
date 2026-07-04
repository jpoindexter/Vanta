import { describe, it, expect } from "vitest";
import { buildCheckpointHandlers } from "./checkpoint-cmd.js";
import { CheckpointStore } from "../sessions/checkpoint.js";
import type { ReplCtx } from "./types.js";
import type { Message } from "../types.js";

const msg = (content: string): Message => ({ role: "user", content });

function mkCtx(messages: Message[], turnIndex = 0): ReplCtx {
  return { convo: { messages }, state: { turnIndex } } as unknown as ReplCtx;
}

function out(r: unknown): string {
  return (r as { output: string }).output;
}

describe("restore handler", () => {
  it("restores a named checkpoint's messages and turnIndex in place", async () => {
    const store = new CheckpointStore();
    store.save("safe", [msg("a"), msg("b")], 2);
    const { restore } = buildCheckpointHandlers(store);
    // Drift away from the checkpoint, then restore by name.
    const ctx = mkCtx([msg("a"), msg("b"), msg("regret")], 3);
    const r = await restore("safe", ctx);
    expect(ctx.convo.messages.map((m) => m.content)).toEqual(["a", "b"]);
    expect(ctx.state.turnIndex).toBe(2);
    expect(out(r)).toContain('restored "safe"');
  });

  it("restores by checkpoint id (cp-N)", async () => {
    const store = new CheckpointStore();
    store.save("first", [msg("x")], 1);
    const { restore } = buildCheckpointHandlers(store);
    const ctx = mkCtx([msg("changed")], 9);
    await restore("cp-1", ctx);
    expect(ctx.convo.messages.map((m) => m.content)).toEqual(["x"]);
    expect(ctx.state.turnIndex).toBe(1);
  });

  it("is non-destructive — the same checkpoint can be restored twice", async () => {
    const store = new CheckpointStore();
    store.save("anchor", [msg("keep")], 0);
    const { restore } = buildCheckpointHandlers(store);
    await restore("anchor", mkCtx([msg("drift")], 5));
    const ctx2 = mkCtx([msg("drift again")], 7);
    await restore("anchor", ctx2);
    expect(ctx2.convo.messages.map((m) => m.content)).toEqual(["keep"]);
  });

  it("reports an unknown checkpoint and does not mutate the conversation", async () => {
    const store = new CheckpointStore();
    store.save("real", [msg("a")], 0);
    const { restore } = buildCheckpointHandlers(store);
    const ctx = mkCtx([msg("current")], 4);
    const r = await restore("ghost", ctx);
    expect(out(r)).toContain('no checkpoint "ghost"');
    expect(ctx.convo.messages.map((m) => m.content)).toEqual(["current"]);
    expect(ctx.state.turnIndex).toBe(4);
  });

  it("shows usage when no name is given", async () => {
    const { restore } = buildCheckpointHandlers(new CheckpointStore());
    expect(out(await restore("", mkCtx([])))).toContain("usage: /restore");
  });

  it("branch forks a NEW session from the checkpoint without touching the current convo", async () => {
    const store = new CheckpointStore();
    store.save("fork-point", [msg("seed1"), msg("seed2")], 2);
    const saved: Array<{ id: string; messages: Message[]; title?: string }> = [];
    const { restore } = buildCheckpointHandlers(store, {
      saveSession: async (id, messages, opts) => {
        saved.push({ id, messages, title: opts?.title });
      },
      newSessionId: () => "20260704-090000",
    });
    const ctx = mkCtx([msg("live conversation")], 8);
    const r = await restore("fork-point branch", ctx);
    // New session persisted with the checkpoint's messages.
    expect(saved).toHaveLength(1);
    const s0 = saved[0];
    if (!s0) throw new Error("expected a saved session");
    expect(s0.id).toBe("20260704-090000");
    expect(s0.messages.map((m) => m.content)).toEqual(["seed1", "seed2"]);
    expect(s0.title).toContain("fork-point");
    // Current conversation is UNTOUCHED (branch, not restore-in-place).
    expect(ctx.convo.messages.map((m) => m.content)).toEqual(["live conversation"]);
    expect(ctx.state.turnIndex).toBe(8);
    expect(out(r)).toContain("branched");
    expect(out(r)).toContain("20260704-090000");
  });

  it("accepts the --branch flag form too", async () => {
    const store = new CheckpointStore();
    store.save("cp", [msg("m")], 0);
    let calls = 0;
    const { restore } = buildCheckpointHandlers(store, {
      saveSession: async () => {
        calls += 1;
      },
      newSessionId: () => "id-1",
    });
    await restore("cp --branch", mkCtx([msg("x")], 1));
    expect(calls).toBe(1);
  });
});
