import { describe, it, expect, afterEach } from "vitest";
import { sendMessageTool } from "./send-message.js";
import { globalBus } from "../a2a/bus.js";
import { makeMessage } from "../a2a/local.js";
import type { A2AMessage } from "../a2a/types.js";

afterEach(() => {
  // Unregister any test agents between tests.
  for (const id of globalBus.list()) globalBus.unregister(id);
});

describe("send_message tool", () => {
  it("delivers to a registered agent and returns the reply text", async () => {
    globalBus.register("echo-agent", (msg: A2AMessage) =>
      makeMessage({ from: "echo-agent", to: msg.from, text: `echo: ${msg.parts[0]?.text}` }),
    );
    const result = await sendMessageTool.execute({ to: "echo-agent", text: "hello" }, {} as never);
    expect(result.ok).toBe(true);
    expect(result.output).toBe("echo: hello");
  });

  it("returns ok:false when the target agent is not registered", async () => {
    const result = await sendMessageTool.execute({ to: "missing", text: "hi" }, {} as never);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("no agent \"missing\"");
    expect(result.output).toContain("(none)");
  });

  it("lists available agents in the error when target is missing", async () => {
    globalBus.register("agent-a", () => null);
    const result = await sendMessageTool.execute({ to: "agent-b", text: "hi" }, {} as never);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("agent-a");
  });

  it("returns a delivery note when the agent returns null (no reply)", async () => {
    globalBus.register("silent", () => null);
    const result = await sendMessageTool.execute({ to: "silent", text: "shh" }, {} as never);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("no reply");
  });

  it("uses the from parameter when provided", async () => {
    let received: A2AMessage | undefined;
    globalBus.register("receiver", (msg) => { received = msg; return null; });
    await sendMessageTool.execute({ to: "receiver", text: "ping", from: "sender-x" }, {} as never);
    expect(received?.from).toBe("sender-x");
  });

  it("defaults from to 'orchestrator' when not provided", async () => {
    let received: A2AMessage | undefined;
    globalBus.register("receiver", (msg) => { received = msg; return null; });
    await sendMessageTool.execute({ to: "receiver", text: "ping" }, {} as never);
    expect(received?.from).toBe("orchestrator");
  });

  it("returns ok:false on invalid args", async () => {
    const result = await sendMessageTool.execute({ to: "", text: "hi" }, {} as never);
    expect(result.ok).toBe(false);
  });

  it("describeForSafety includes the target agent id", () => {
    const desc = sendMessageTool.describeForSafety?.({ to: "my-agent", text: "msg" });
    expect(desc).toContain("my-agent");
  });
});
