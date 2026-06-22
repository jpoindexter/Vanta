import { describe, it, expect } from "vitest";
import {
  parseWebChatInbound,
  buildWebChatReply,
  parseWebChatAllowlist,
  webchatEnabled,
  createWebChatBuffer,
  WebChatAdapter,
  type WebChatBuffer,
} from "./webchat.js";
import type { InboundMessage, OutboundMessage } from "./base.js";

/** One WebChat inbound row as the browser POSTs it. */
function inboundRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { chatId: "sess-1", text: "hi", from: "Alice", ...over };
}

describe("parseWebChatInbound", () => {
  it("maps a single inbound object to an InboundMessage (chatId routes, from kept)", () => {
    expect(parseWebChatInbound(inboundRow())).toEqual([
      { chatId: "sess-1", from: "Alice", text: "hi" },
    ]);
  });

  it("accepts a bare array of inbound rows", () => {
    const out = parseWebChatInbound([
      inboundRow({ chatId: "sess-1", text: "a" }),
      inboundRow({ chatId: "sess-2", text: "b" }),
    ]);
    expect(out.map((m) => m.chatId)).toEqual(["sess-1", "sess-2"]);
  });

  it("defaults `from` to the chatId when the browser omits a display name", () => {
    const out = parseWebChatInbound({ chatId: "sess-9", text: "anon" });
    expect(out).toEqual([{ chatId: "sess-9", from: "sess-9", text: "anon" }]);
  });

  it("control-strips untrusted inbound text (keeping newlines/tabs)", () => {
    const out = parseWebChatInbound(inboundRow({ text: "a\x1b[31mred\x07\x00b\nline2" }));
    expect(out[0]?.text).toBe("a[31mredb\nline2");
  });

  it("SKIPS a row missing chatId or text (not routable)", () => {
    const out = parseWebChatInbound([
      inboundRow({ chatId: "sess-1", text: "keep" }),
      { text: "no chatId" },
      { chatId: "sess-2" },
    ]);
    expect(out.map((m) => m.chatId)).toEqual(["sess-1"]);
  });

  it("SKIPS a row with wrong-typed fields", () => {
    const out = parseWebChatInbound([
      inboundRow({ chatId: "sess-1", text: "keep" }),
      { chatId: 42, text: "num id" },
      { chatId: "sess-2", text: { nested: true } },
    ]);
    expect(out.map((m) => m.chatId)).toEqual(["sess-1"]);
  });

  it("returns [] for garbage (non-object, non-array → empty out)", () => {
    expect(parseWebChatInbound(null)).toEqual([]);
    expect(parseWebChatInbound(undefined)).toEqual([]);
    expect(parseWebChatInbound("not json")).toEqual([]);
    expect(parseWebChatInbound(42)).toEqual([]);
  });

  it("drops only the malformed elements, keeps the valid ones", () => {
    const out = parseWebChatInbound([
      inboundRow({ chatId: "sess-1", text: "a" }),
      { junk: true },
      inboundRow({ chatId: "sess-2", text: "b" }),
    ]);
    expect(out.map((m) => m.chatId)).toEqual(["sess-1", "sess-2"]);
  });
});

describe("buildWebChatReply", () => {
  it("builds {chatId, text} keyed by chatId", () => {
    expect(buildWebChatReply("sess-1", "hello")).toEqual({ chatId: "sess-1", text: "hello" });
  });

  it("control-strips the outbound text (keeping newlines/tabs)", () => {
    expect(buildWebChatReply("sess-2", "a\x00b\x1b\tc\nd")).toEqual({
      chatId: "sess-2",
      text: "ab\tc\nd",
    });
  });

  it("truncates over-limit text to the per-bubble cap", () => {
    const reply = buildWebChatReply("sess-1", "z".repeat(5000));
    expect(reply.text.length).toBe(4000);
  });
});

describe("parseWebChatAllowlist", () => {
  it("parses a comma list of chat ids", () => {
    expect(
      parseWebChatAllowlist({ VANTA_WEBCHAT_ALLOWLIST: "sess-1, sess-2 ,sess-3" } as NodeJS.ProcessEnv),
    ).toEqual(new Set(["sess-1", "sess-2", "sess-3"]));
  });

  it("empty/absent → empty set (the adapter reads this as allow-all)", () => {
    expect(parseWebChatAllowlist({ VANTA_WEBCHAT_ALLOWLIST: "" } as NodeJS.ProcessEnv)).toEqual(
      new Set(),
    );
    expect(parseWebChatAllowlist({} as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseWebChatAllowlist({ VANTA_WEBCHAT_ALLOWLIST: " , ," } as NodeJS.ProcessEnv)).toEqual(
      new Set(),
    );
  });
});

describe("webchatEnabled", () => {
  it("true only when the enable flag is exactly '1'", () => {
    expect(webchatEnabled({ VANTA_WEBCHAT_ENABLE: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(webchatEnabled({ VANTA_WEBCHAT_ENABLE: " 1 " } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("false when absent, empty, or any non-'1' value (no silent enable)", () => {
    expect(webchatEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(webchatEnabled({ VANTA_WEBCHAT_ENABLE: "" } as NodeJS.ProcessEnv)).toBe(false);
    expect(webchatEnabled({ VANTA_WEBCHAT_ENABLE: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(webchatEnabled({ VANTA_WEBCHAT_ENABLE: "true" } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("createWebChatBuffer (in-memory transport — no server)", () => {
  it("drains pushed inbound messages once (FIFO, then empty)", () => {
    const buf = createWebChatBuffer();
    const m: InboundMessage = { chatId: "sess-1", from: "sess-1", text: "ping" };
    buf.pushInbound(m);
    buf.pushInbound({ chatId: "sess-2", from: "sess-2", text: "pong" });
    expect(buf.drainInbound().map((x) => x.text)).toEqual(["ping", "pong"]);
    expect(buf.drainInbound()).toEqual([]); // drained = delivered once
  });

  it("queues outbound per chatId and drains only that session's replies", () => {
    const buf = createWebChatBuffer();
    buf.pushOutbound("sess-1", "a1");
    buf.pushOutbound("sess-2", "b1");
    buf.pushOutbound("sess-1", "a2");
    expect(buf.drainOutbound("sess-1")).toEqual(["a1", "a2"]);
    expect(buf.drainOutbound("sess-1")).toEqual([]); // cleared after drain
    expect(buf.drainOutbound("sess-2")).toEqual(["b1"]); // untouched by the other drain
  });

  it("drainOutbound for an unknown chatId is empty (never throws)", () => {
    const buf = createWebChatBuffer();
    expect(buf.drainOutbound("nobody")).toEqual([]);
  });

  it("a fresh buffer is isolated (no shared global state)", () => {
    const a = createWebChatBuffer();
    const b = createWebChatBuffer();
    a.pushInbound({ chatId: "sess-1", from: "sess-1", text: "x" });
    expect(b.drainInbound()).toEqual([]);
  });
});

describe("WebChatAdapter (injected in-memory buffer — no real HTTP)", () => {
  it("polls the buffer and parses drained inbound messages", async () => {
    const buffer = createWebChatBuffer();
    buffer.pushInbound({ chatId: "sess-1", from: "Alice", text: "ping" });
    const adapter = new WebChatAdapter({ buffer });
    expect(adapter.id).toBe("webchat");
    const inbound = await adapter.poll();
    expect(inbound).toEqual([{ chatId: "sess-1", from: "Alice", text: "ping" }]);
    expect(await adapter.poll()).toEqual([]); // drained
  });

  it("returns [] (never throws) when the buffer drain rejects", async () => {
    const buffer: WebChatBuffer = {
      pushInbound: () => {},
      drainInbound: () => {
        throw new Error("buffer broken");
      },
      pushOutbound: () => {},
      drainOutbound: () => [],
    };
    const adapter = new WebChatAdapter({ buffer });
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("filters inbound by the allowlist (chatId OR sender id)", async () => {
    const buffer = createWebChatBuffer();
    buffer.pushInbound({ chatId: "sess-1", from: "sess-1", text: "ok" });
    buffer.pushInbound({ chatId: "sess-9", from: "sess-9", text: "no" });
    const adapter = new WebChatAdapter({ buffer, allow: new Set(["sess-1"]) });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.chatId)).toEqual(["sess-1"]);
  });

  it("enqueues an outbound reply keyed by chatId for the browser to fetch", async () => {
    const buffer = createWebChatBuffer();
    const adapter = new WebChatAdapter({ buffer });
    const out: OutboundMessage = { chatId: "sess-1", text: "reply" };
    await adapter.send(out);
    expect(buffer.drainOutbound("sess-1")).toEqual(["reply"]);
  });

  it("degrades markdown to plain text before enqueueing", async () => {
    const buffer = createWebChatBuffer();
    const adapter = new WebChatAdapter({ buffer });
    await adapter.send({ chatId: "sess-1", text: "**bold** and `code`" });
    expect(buffer.drainOutbound("sess-1")).toEqual(["bold and `code`"]);
  });

  it("splits an over-budget reply into multiple enqueued bubbles (each within the cap)", async () => {
    const buffer = createWebChatBuffer();
    const adapter = new WebChatAdapter({ buffer });
    await adapter.send({ chatId: "sess-1", text: "z".repeat(9000) });
    const parts = buffer.drainOutbound("sess-1");
    expect(parts.length).toBeGreaterThan(1);
    let total = 0;
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(4000);
      total += part.length;
    }
    expect(total).toBe(9000);
  });

  it("does not throw through the loop when an enqueue rejects (errors-as-values)", async () => {
    const buffer: WebChatBuffer = {
      pushInbound: () => {},
      drainInbound: () => [],
      pushOutbound: () => {
        throw new Error("enqueue failed");
      },
      drainOutbound: () => [],
    };
    const adapter = new WebChatAdapter({ buffer });
    await expect(adapter.send({ chatId: "sess-1", text: "reply" })).resolves.toBeUndefined();
  });

  it("connect/disconnect are no-ops (in-memory queue)", async () => {
    const adapter = new WebChatAdapter({ buffer: createWebChatBuffer() });
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});
