import { describe, expect, it } from "vitest";
import type { OutboundMessage, PlatformAdapter } from "./platforms/base.js";
import { createGatewayStreamSink } from "./stream-events.js";

class SinkAdapter implements PlatformAdapter {
  readonly id = "sink-test";
  sent: OutboundMessage[] = [];
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async poll() { return []; }
  async send(message: OutboundMessage): Promise<void> { this.sent.push(message); }
}

describe("gateway stream sink", () => {
  it("keeps commentary transient and delivers the canonical stop once", async () => {
    const platform = new SinkAdapter();
    const recorded: OutboundMessage[] = [];
    const sink = createGatewayStreamSink({ platform, target: { chatId: "c1" }, record: async (message) => { recorded.push(message); } });
    await sink.emit({ type: "MessageChunk", text: "hel" });
    await sink.emit({ type: "Commentary", text: "using search" });
    await sink.emit({ type: "MessageChunk", text: "lo" });
    await sink.emit({ type: "MessageStop", text: "hello" });

    expect(platform.sent).toEqual([{ chatId: "c1", text: "hello" }]);
    expect(recorded).toEqual(platform.sent);
    expect(sink.snapshot()).toEqual({ streamedText: "hello", canonicalText: "hello", commentaryCount: 1, drifted: false, stopped: true });
  });

  it("fails closed to MessageStop when streamed drafts diverge", async () => {
    const platform = new SinkAdapter();
    const logs: string[] = [];
    const sink = createGatewayStreamSink({ platform, target: { chatId: "c2" }, record: async () => {}, log: (line) => logs.push(line) });
    await sink.emit({ type: "MessageChunk", text: "draft" });
    await sink.emit({ type: "MessageStop", text: "canonical" });

    expect(platform.sent[0]?.text).toBe("canonical");
    expect(sink.snapshot().drifted).toBe(true);
    expect(logs[0]).toContain("delivered MessageStop only");
  });
});
