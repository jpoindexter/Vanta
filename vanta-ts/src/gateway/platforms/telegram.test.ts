import { describe, it, expect } from "vitest";
import type { OutboundMessage } from "./base.js";
import { TelegramAdapter, parseRetryAfter, parseUpdates, parseAllowlist, parseSentId } from "./telegram.js";

describe("parseUpdates", () => {
  it("extracts text messages and advances the offset past the max update_id", () => {
    const payload = {
      ok: true,
      result: [
        { update_id: 10, message: { message_id: 100, text: "hello", chat: { id: 42 }, from: { username: "jp" } } },
        { update_id: 11, message: { message_id: 101, text: "again", chat: { id: 42 } } },
      ],
    };
    const { messages, nextOffset } = parseUpdates(payload, 0);
    expect(messages).toEqual([
      { chatId: "42", text: "hello", from: "jp", id: "100", isGroup: undefined, replyToId: undefined },
      { chatId: "42", text: "again", from: undefined, id: "101", isGroup: undefined, replyToId: undefined },
    ]);
    expect(nextOffset).toBe(12);
  });

  it("parses message_id into id (stringified)", () => {
    const payload = { ok: true, result: [{ update_id: 1, message: { message_id: 555, text: "hi", chat: { id: 7 } } }] };
    expect(parseUpdates(payload, 0).messages[0]?.id).toBe("555");
  });

  it("flags a group/supergroup chat via chat.type, false for a private DM", () => {
    const payload = {
      ok: true,
      result: [
        { update_id: 1, message: { message_id: 1, text: "g", chat: { id: 1, type: "group" } } },
        { update_id: 2, message: { message_id: 2, text: "s", chat: { id: 2, type: "supergroup" } } },
        { update_id: 3, message: { message_id: 3, text: "d", chat: { id: 3, type: "private" } } },
      ],
    };
    const { messages } = parseUpdates(payload, 0);
    expect(messages.map((m) => m.isGroup)).toEqual([true, true, false]);
  });

  it("populates replyToId (stringified) when the message replies to another", () => {
    const payload = {
      ok: true,
      result: [
        {
          update_id: 1,
          message: {
            message_id: 200,
            text: "@vantabot what about this",
            chat: { id: 9, type: "supergroup" },
            reply_to_message: { message_id: 150 },
          },
        },
      ],
    };
    const [msg] = parseUpdates(payload, 0).messages;
    expect(msg).toMatchObject({ id: "200", isGroup: true, replyToId: "150" });
  });

  it("leaves id/isGroup/replyToId undefined when the payload omits those fields (back-compat)", () => {
    const payload = { ok: true, result: [{ update_id: 1, message: { text: "plain", chat: { id: 3 } } }] };
    expect(parseUpdates(payload, 0).messages).toEqual([
      { chatId: "3", text: "plain", from: undefined, id: undefined, isGroup: undefined, replyToId: undefined },
    ]);
  });

  it("skips non-text updates (joins, photos) but still advances the offset", () => {
    const payload = {
      ok: true,
      result: [{ update_id: 5, message: { chat: { id: 1 } } }], // no text
    };
    const { messages, nextOffset } = parseUpdates(payload, 0);
    expect(messages).toEqual([]);
    expect(nextOffset).toBe(6);
  });

  it("returns no-op on a malformed or not-ok payload", () => {
    expect(parseUpdates({ ok: false, result: [] }, 7)).toEqual({ messages: [], nextOffset: 7, callbackIds: [] });
    expect(parseUpdates("garbage", 3)).toEqual({ messages: [], nextOffset: 3, callbackIds: [] });
  });
});

describe("parseSentId", () => {
  it("extracts result.message_id (stringified) from a sendMessage response", () => {
    expect(parseSentId({ ok: true, result: { message_id: 321 } })).toBe("321");
  });
  it("returns undefined on a not-ok / resultless / malformed response", () => {
    expect(parseSentId({ ok: false })).toBeUndefined();
    expect(parseSentId({ ok: true })).toBeUndefined();
    expect(parseSentId(undefined)).toBeUndefined();
    expect(parseSentId("garbage")).toBeUndefined();
  });
});

describe("parseAllowlist", () => {
  it("parses a comma list, trimming and dropping empties", () => {
    expect(parseAllowlist(" 42, 99 ,")).toEqual(new Set(["42", "99"]));
  });
  it("is empty (allow-all) for undefined", () => {
    expect(parseAllowlist(undefined).size).toBe(0);
  });
});

describe("parseRetryAfter", () => {
  it("reads Telegram's 429 flood-control shape, capped at 30s", () => {
    expect(parseRetryAfter({ ok: false, error_code: 429, parameters: { retry_after: 4 } })).toBe(4);
    expect(parseRetryAfter({ ok: false, error_code: 429, parameters: { retry_after: 900 } })).toBe(30);
    expect(parseRetryAfter({ ok: false, error_code: 429 })).toBe(1);
    expect(parseRetryAfter({ ok: false, error_code: 400 })).toBeUndefined();
    expect(parseRetryAfter({ ok: true, result: { message_id: 1 } })).toBeUndefined();
  });
});

describe("MSG-TELEGRAM-ROBUST send behavior", () => {
  type Sent = { body: Record<string, unknown> };

  function fetchStub(responses: unknown[], sent: Sent[]): typeof fetch {
    let i = 0;
    return (async (_url: unknown, init?: RequestInit) => {
      sent.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      const payload = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return { json: async () => payload } as Response;
    }) as typeof fetch;
  }

  const OK = { ok: true, result: { message_id: 77 } };
  const FLOOD = { ok: false, error_code: 429, parameters: { retry_after: 2 } };

  async function withFetch(responses: unknown[], run: (a: TelegramAdapter, sent: Sent[], sleeps: number[]) => Promise<void>): Promise<void> {
    const sent: Sent[] = [];
    const sleeps: number[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = fetchStub(responses, sent);
    try {
      const adapter = new TelegramAdapter({ token: "T", sleep: async (ms) => void sleeps.push(ms) });
      await run(adapter, sent, sleeps);
    } finally {
      globalThis.fetch = real;
    }
  }

  it("suppresses link previews on every send", async () => {
    await withFetch([OK], async (a, sent) => {
      await a.send({ chatId: "5", text: "see https://example.com" });
      expect(sent[0]?.body.link_preview_options).toEqual({ is_disabled: true });
    });
  });

  it("routes a threaded reply back to its forum topic", async () => {
    await withFetch([OK], async (a, sent) => {
      await a.send({ chatId: "5", threadId: "42", text: "hi" });
      expect(sent[0]?.body.message_thread_id).toBe(42);
    });
  });

  it("omits message_thread_id for plain (non-topic) sends", async () => {
    await withFetch([OK], async (a, sent) => {
      await a.send({ chatId: "5", text: "hi" });
      expect("message_thread_id" in (sent[0]?.body ?? {})).toBe(false);
    });
  });

  it("retries a 429 after retry_after seconds instead of dropping the send", async () => {
    await withFetch([FLOOD, OK], async (a, sent, sleeps) => {
      const msg: OutboundMessage = { chatId: "5", text: "hi" };
      await a.send(msg);
      expect(sent).toHaveLength(2);
      expect(sleeps).toEqual([2000]);
      expect(msg.id).toBe("77"); // the retried send's id is still recorded
    });
  });

  it("gives up after bounded attempts under sustained flood control", async () => {
    await withFetch([FLOOD, FLOOD, FLOOD, FLOOD], async (a, sent, sleeps) => {
      const msg: OutboundMessage = { chatId: "5", text: "hi" };
      await a.send(msg);
      expect(sent).toHaveLength(3); // MAX_SEND_ATTEMPTS
      expect(sleeps).toEqual([2000, 2000]);
      expect(msg.id).toBeUndefined();
    });
  });
});

describe("parseUpdates forum topics", () => {
  it("carries threadId only for real topic messages", () => {
    const payload = {
      ok: true,
      result: [
        { update_id: 1, message: { message_id: 10, text: "in topic", chat: { id: 5, type: "supergroup" }, message_thread_id: 42, is_topic_message: true } },
        { update_id: 2, message: { message_id: 11, text: "plain reply", chat: { id: 5, type: "supergroup" }, message_thread_id: 10, reply_to_message: { message_id: 10 } } },
      ],
    };
    const { messages } = parseUpdates(payload, 0);
    expect(messages[0]?.threadId).toBe("42");
    expect(messages[1]?.threadId).toBeUndefined(); // thread id on a plain reply is NOT a topic
  });
});

describe("MSG-INLINE-APPROVAL", () => {
  it("maps a tapped button (callback_query) to an inbound whose text is the callback data", () => {
    const payload = {
      ok: true,
      result: [
        { update_id: 9, callback_query: { id: "cbq77", data: "yes ab12cd", from: { username: "jason" }, message: { chat: { id: 5 } } } },
      ],
    };
    const { messages, callbackIds, nextOffset } = parseUpdates(payload, 0);
    expect(messages[0]).toMatchObject({ chatId: "5", text: "yes ab12cd", from: "jason", id: "cb-cbq77" });
    expect(callbackIds).toEqual(["cbq77"]);
    expect(nextOffset).toBe(10);
  });

  it("send attaches an inline keyboard when buttons are present, none otherwise", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return { json: async () => ({ ok: true, result: { message_id: 1 } }) } as Response;
    }) as typeof fetch;
    try {
      const a = new TelegramAdapter({ token: "T" });
      await a.send({ chatId: "5", text: "approve?", buttons: [{ label: "✅ Approve", data: "yes ab" }, { label: "❌ Deny", data: "no ab" }] });
      expect(sent[0]?.reply_markup).toEqual({ inline_keyboard: [[{ text: "✅ Approve", callback_data: "yes ab" }, { text: "❌ Deny", callback_data: "no ab" }]] });
      await a.send({ chatId: "5", text: "plain" });
      expect("reply_markup" in (sent[1] ?? {})).toBe(false);
    } finally {
      globalThis.fetch = real;
    }
  });

  it("poll acks every callback via answerCallbackQuery", async () => {
    const urls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
      urls.push(String(u));
      if (String(u).includes("getUpdates")) {
        return { json: async () => ({ ok: true, result: [{ update_id: 1, callback_query: { id: "cbq9", data: "no x", message: { chat: { id: 5 } } } }] }) } as Response;
      }
      urls.push(`body:${String(init?.body)}`);
      return { json: async () => ({ ok: true }) } as Response;
    }) as typeof fetch;
    try {
      const a = new TelegramAdapter({ token: "T" });
      const msgs = await a.poll();
      expect(msgs[0]?.text).toBe("no x");
      expect(urls.some((u) => u.includes("answerCallbackQuery"))).toBe(true);
      expect(urls.some((u) => u.includes("cbq9"))).toBe(true);
    } finally {
      globalThis.fetch = real;
    }
  });
});
