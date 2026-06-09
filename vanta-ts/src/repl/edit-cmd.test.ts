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
    const result = await runEdit(ctx);
    expect(result.output).toMatch(/no AI response/);
    expect(result.loadIntoComposer).toBeUndefined();
  });

  it("returns loadIntoComposer with the last assistant message content", async () => {
    const ctx = baseCtx();
    ctx.convo.messages.push({ role: "assistant", content: "hello world" });
    const result = await runEdit(ctx);
    expect(result.loadIntoComposer).toBe("hello world");
    expect(result.editMessageIndex).toBe(1);
  });

  it("targets the last assistant message, not an earlier one", async () => {
    const ctx = baseCtx();
    ctx.convo.messages.push({ role: "assistant", content: "first" });
    ctx.convo.messages.push({ role: "user", content: "q" });
    ctx.convo.messages.push({ role: "assistant", content: "second" });
    const result = await runEdit(ctx);
    expect(result.loadIntoComposer).toBe("second");
    expect(result.editMessageIndex).toBe(3);
  });

  it("does not mutate messages — host owns the replacement", async () => {
    const ctx = baseCtx();
    ctx.convo.messages.push({ role: "assistant", content: "original" });
    await runEdit(ctx);
    expect((ctx.convo.messages[1] as { content: string }).content).toBe("original");
  });
});
