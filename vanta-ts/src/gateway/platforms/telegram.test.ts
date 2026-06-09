import { describe, it, expect } from "vitest";
import { parseUpdates, parseAllowlist } from "./telegram.js";

describe("parseUpdates", () => {
  it("extracts text messages and advances the offset past the max update_id", () => {
    const payload = {
      ok: true,
      result: [
        { update_id: 10, message: { text: "hello", chat: { id: 42 }, from: { username: "jp" } } },
        { update_id: 11, message: { text: "again", chat: { id: 42 } } },
      ],
    };
    const { messages, nextOffset } = parseUpdates(payload, 0);
    expect(messages).toEqual([
      { chatId: "42", text: "hello", from: "jp" },
      { chatId: "42", text: "again", from: undefined },
    ]);
    expect(nextOffset).toBe(12);
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

describe("parseAllowlist", () => {
  it("parses a comma list, trimming and dropping empties", () => {
    expect(parseAllowlist(" 42, 99 ,")).toEqual(new Set(["42", "99"]));
  });
  it("is empty (allow-all) for undefined", () => {
    expect(parseAllowlist(undefined).size).toBe(0);
  });
});
