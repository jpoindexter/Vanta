import { describe, it, expect } from "vitest";
import { parseChatDbRows } from "./imessage.js";

// parseChatDbRows is pure — offline testable without chat.db or osascript.

describe("parseChatDbRows", () => {
  it("returns empty for empty rows", () => {
    expect(parseChatDbRows([], 0)).toEqual([]);
  });

  it("maps rows to InboundMessages", () => {
    const rows = [{ rowid: 1, text: "hello", handle_id: "+1555", date: 1000 }];
    const msgs = parseChatDbRows(rows, 0);
    expect(msgs.length).toBe(1);
    expect(msgs[0]?.chatId).toBe("+1555");
    expect(msgs[0]?.text).toBe("hello");
  });

  it("skips rows at or below sinceRowId", () => {
    const rows = [
      { rowid: 1, text: "old", handle_id: "+1", date: 0 },
      { rowid: 5, text: "new", handle_id: "+2", date: 1 },
    ];
    const msgs = parseChatDbRows(rows, 2);
    expect(msgs.length).toBe(1);
    expect(msgs[0]?.text).toBe("new");
  });

  it("skips null or empty text", () => {
    const rows = [
      { rowid: 2, text: null, handle_id: "+1", date: 0 },
      { rowid: 3, text: "", handle_id: "+2", date: 0 },
    ];
    expect(parseChatDbRows(rows, 0)).toEqual([]);
  });
});
