import { describe, it, expect, afterEach } from "vitest";
import { HookBus } from "./hooks.js";

let bus: HookBus;

afterEach(() => bus?.clear());

describe("HookBus", () => {
  it("fires post_tool_call handlers", async () => {
    bus = new HookBus();
    const calls: string[] = [];
    bus.on("post_tool_call", (ctx) => { calls.push(ctx.name); });
    await bus.fire("post_tool_call", { name: "read_file", args: {}, result: { ok: true, output: "content" } });
    expect(calls).toContain("read_file");
  });

  it("unsubscribes when the returned fn is called", async () => {
    bus = new HookBus();
    const calls: number[] = [];
    const unsub = bus.on("on_session_start", () => { calls.push(1); });
    await bus.fire("on_session_start", { sessionId: "a" });
    unsub();
    await bus.fire("on_session_start", { sessionId: "b" });
    expect(calls.length).toBe(1);
  });

  it("pre_gateway_dispatch returns allow when no handlers", async () => {
    bus = new HookBus();
    const action = await bus.fire("pre_gateway_dispatch", { chatId: "c1", text: "hi", platform: "telegram" });
    expect(action?.action).toBe("allow");
  });

  it("pre_gateway_dispatch returns skip when a handler skips", async () => {
    bus = new HookBus();
    bus.on("pre_gateway_dispatch", () => ({ action: "skip" as const }));
    const action = await bus.fire("pre_gateway_dispatch", { chatId: "c1", text: "hi", platform: "telegram" });
    expect(action?.action).toBe("skip");
  });

  it("pre_gateway_dispatch supports rewrite", async () => {
    bus = new HookBus();
    bus.on("pre_gateway_dispatch", () => ({ action: "rewrite" as const, rewrittenText: "rewritten" }));
    const action = await bus.fire("pre_gateway_dispatch", { chatId: "c1", text: "hi", platform: "telegram" });
    expect(action?.action).toBe("rewrite");
    expect((action as { rewrittenText: string }).rewrittenText).toBe("rewritten");
  });

  it("continues past a throwing hook (best-effort)", async () => {
    bus = new HookBus();
    const calls: number[] = [];
    bus.on("post_tool_call", () => { throw new Error("boom"); });
    bus.on("post_tool_call", () => { calls.push(1); });
    await bus.fire("post_tool_call", { name: "x", args: {}, result: { ok: true, output: "" } });
    expect(calls.length).toBe(1);
  });

  it("count reports registered handlers", () => {
    bus = new HookBus();
    bus.on("post_tool_call", () => {});
    bus.on("post_tool_call", () => {});
    expect(bus.count("post_tool_call")).toBe(2);
    expect(bus.count("pre_llm_call")).toBe(0);
  });
});
