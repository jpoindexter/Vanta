import { describe, it, expect } from "vitest";
import { parseUpdates, parseAllowlist, parseSentId } from "./telegram.js";

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
    expect(parseUpdates({ ok: false, result: [] }, 7)).toEqual({ messages: [], nextOffset: 7 });
    expect(parseUpdates("garbage", 3)).toEqual({ messages: [], nextOffset: 3 });
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
