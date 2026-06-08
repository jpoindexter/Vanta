import { describe, it, expect } from "vitest";
import { runEdit } from "./edit-cmd.js";
import type { ReplCtx } from "./types.js";

const baseCtx = (): ReplCtx =>
  ({
    convo: { messages: [{ role: "system", content: "sys" }] },
    setup: {} as ReplCtx["setup"],
    dataDir: "/tmp",
    state: { sessionId: "s1", started: "", turnIndex: 0 },
    env: {},
    now: () => new Date(),
  }) as unknown as ReplCtx;

describe("runEdit", () => {
  it("returns '(no AI response)' when there are no assistant messages", async () => {
    const ctx = baseCtx();
    const result = await runEdit(ctx, async () => ({ ok: true, text: "x", message: "ok" }));
    expect(result.output).toMatch(/no AI response/);
  });

  it("returns '· no changes' when the editor returns the same text", async () => {
    const ctx = baseCtx();
    ctx.convo.messages.push({ role: "assistant", content: "hello" });
    const result = await runEdit(ctx, async (text) => ({ ok: true, text, message: "ok" }));
    expect(result.output).toBe("  · no changes");
  });

  it("patches the message and reports the new length on change", async () => {
    const ctx = baseCtx();
    ctx.convo.messages.push({ role: "assistant", content: "original" });
    const result = await runEdit(ctx, async () => ({ ok: true, text: "updated", message: "ok" }));
    expect(result.output).toMatch(/✎ response updated/);
    expect(ctx.convo.messages[1]).toEqual({ role: "assistant", content: "updated" });
  });

  it("preserves tool calls on the patched assistant message", async () => {
    const ctx = baseCtx();
    const tc = { id: "t1", name: "read_file", arguments: {} };
    ctx.convo.messages.push({ role: "assistant", content: "old", toolCalls: [tc] });
    await runEdit(ctx, async () => ({ ok: true, text: "new", message: "ok" }));
    expect((ctx.convo.messages[1] as { toolCalls: unknown[] }).toolCalls).toEqual([tc]);
  });

  it("returns error output when the editor fails", async () => {
    const ctx = baseCtx();
    ctx.convo.messages.push({ role: "assistant", content: "something" });
    const result = await runEdit(ctx, async () => ({ ok: false, message: "editor exited 1" }));
    expect(result.output).toMatch(/✗ editor exited 1/);
    expect(ctx.convo.messages[1]).toMatchObject({ content: "something" }); // unchanged
  });

  it("edits the last assistant message, not an earlier one", async () => {
    const ctx = baseCtx();
    ctx.convo.messages.push({ role: "assistant", content: "first" });
    ctx.convo.messages.push({ role: "user", content: "q" });
    ctx.convo.messages.push({ role: "assistant", content: "second" });
    await runEdit(ctx, async () => ({ ok: true, text: "patched", message: "ok" }));
    expect((ctx.convo.messages[1] as { content: string }).content).toBe("first"); // untouched
    expect((ctx.convo.messages[3] as { content: string }).content).toBe("patched");
  });
});
