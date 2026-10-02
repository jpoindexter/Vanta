import { describe, expect, it } from "vitest";
import { managedChats } from "./chat-first-session-manager.js";
import type { Session } from "./types.js";

const session = (id: string, extra: Partial<Session> = {}): Session => ({ id, title: id, turns: 0, updated: "2026-09-08T12:00:00Z", ...extra });

describe("canonical chat management projection", () => {
  const rows = [session("draft", { title: "(empty session)" }), session("old", { archived: true }),
    session("deleted", { trashed: true, archived: true, pinned: true }), session("pin2", { pinned: true, pinOrder: 2 }),
    session("pin1", { pinned: true, pinOrder: 1 })];
  it("keeps zero-turn drafts visible and separates archive and trash", () => {
    expect(managedChats(rows, "recent", "").map((row) => row.id)).toEqual(["pin1", "pin2", "draft"]);
    expect(managedChats(rows, "archived", "").map((row) => row.id)).toEqual(["old"]);
    expect(managedChats(rows, "trash", "").map((row) => row.id)).toEqual(["deleted"]);
  });
  it("searches the displayed draft title without mutating records", () => {
    expect(managedChats(rows, "recent", " NEW CHAT ").map((row) => row.id)).toEqual(["draft"]);
    expect(rows[0].title).toBe("(empty session)");
    expect(managedChats(rows, "recent", "missing")).toEqual([]);
  });
});
