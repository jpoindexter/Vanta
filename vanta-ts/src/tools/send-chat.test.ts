import { describe, it, expect } from "vitest";
import { sendChatTool, type AdapterResolver } from "./send-chat.js";
import type { PlatformAdapter, OutboundMessage } from "../gateway/platforms/base.js";
import type { ToolContext } from "./types.js";

/** A fake adapter that records lifecycle + sent messages — no network. */
class FakeAdapter implements PlatformAdapter {
  readonly id = "fake";
  connects = 0;
  disconnects = 0;
  sent: OutboundMessage[] = [];
  constructor(private readonly failSend = false) {}
  async connect(): Promise<void> {
    this.connects += 1;
  }
  async disconnect(): Promise<void> {
    this.disconnects += 1;
  }
  async send(msg: OutboundMessage): Promise<void> {
    if (this.failSend) throw new Error("network down");
    this.sent.push(msg);
  }
  async poll(): Promise<[]> {
    return [];
  }
}

function ctx(
  resolveAdapter: AdapterResolver,
  overrides: Partial<ToolContext> = {},
): ToolContext & { resolveAdapter: AdapterResolver } {
  return {
    root: "/tmp/vanta-test",
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
    resolveAdapter,
    ...overrides,
  };
}

describe("send_chat", () => {
  it("sends via the resolved adapter: connect → send → disconnect", async () => {
    const adapter = new FakeAdapter();
    const res = await sendChatTool.execute(
      { platform: "telegram", chatId: "123", text: "I finished X" },
      ctx(() => adapter),
    );
    expect(res.ok).toBe(true);
    expect(adapter.connects).toBe(1);
    expect(adapter.disconnects).toBe(1);
    expect(adapter.sent).toEqual([{ chatId: "123", text: "I finished X" }]);
  });

  it("errors-as-values for an unconfigured/unimplemented platform (never throws)", async () => {
    const res = await sendChatTool.execute(
      { platform: "nope", chatId: "123", text: "hi" },
      ctx(() => ({ ok: false, error: 'No messaging adapter for "nope".' })),
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("nope");
  });

  it("disconnects and errors-as-values when the send fails (cleanup, no throw)", async () => {
    const adapter = new FakeAdapter(true);
    const res = await sendChatTool.execute(
      { platform: "telegram", chatId: "123", text: "hi" },
      ctx(() => adapter),
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("send failed");
    expect(adapter.connects).toBe(1);
    expect(adapter.disconnects).toBe(1); // cleaned up even on failure
  });

  it("refuses without sending when approval is denied", async () => {
    const adapter = new FakeAdapter();
    const res = await sendChatTool.execute(
      { platform: "telegram", chatId: "123", text: "hi" },
      ctx(() => adapter, { requestApproval: async () => false }),
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("denied");
    expect(adapter.connects).toBe(0);
    expect(adapter.sent).toEqual([]);
  });

  it("rejects missing args, errors-as-values", async () => {
    const res = await sendChatTool.execute(
      { platform: "telegram" },
      ctx(() => new FakeAdapter()),
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("send_chat needs");
  });

  it("describeForSafety surfaces the platform + chat (kernel gates the outbound), never the body", () => {
    const desc = sendChatTool.describeForSafety?.({
      platform: "telegram",
      chatId: "123",
      text: "secret payload",
    });
    expect(desc).toBe("send a chat to telegram:123");
    expect(desc).not.toContain("secret");
  });
});
