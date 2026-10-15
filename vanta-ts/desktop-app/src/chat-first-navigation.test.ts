import { describe, expect, it } from "vitest";
import { chatGroups, chatTitle, currentRecovery, shellMode, restoreChatSelection, rememberChatSelection } from "./chat-first-navigation.js";
import type { DesktopRunReceipt, Session } from "./types.js";

const session = (id: string, extra: Partial<Session> = {}): Session => ({
  id, title: id, turns: 2, updated: "2026-09-08T12:00:00Z", ...extra,
});

describe("chat-first navigation", () => {
  it("restores only the saved selection belonging to this project and excludes archived or trashed chats", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    rememberChatSelection(storage, "/one", "draft");
    const rows = [session("draft", { turns: 0 })];
    expect(restoreChatSelection(storage, "/one", rows)).toBe("draft");
    expect(restoreChatSelection(storage, "/two", rows)).toBeUndefined();
    expect(restoreChatSelection(storage, "/one", [session("draft", { archived: true })])).toBeUndefined();
    expect(restoreChatSelection(storage, "/one", [session("draft", { trashed: true })])).toBeUndefined();
  });
  it("does not resurrect an old interruption after a later completed turn", () => {
    const old: DesktopRunReceipt = { status: "interrupted", failureKind: "interrupted", events: [], actions: [] };
    expect(currentRecovery([{ role: "assistant", content: "old", desktopRun: old },
      { role: "assistant", content: "new", desktopRun: { status: "done", events: [], actions: [] } }], old)).toBeNull();
    expect(currentRecovery([{ role: "assistant", content: "old", desktopRun: old }], old)).toBe(old);
  });
  it("defaults to chat and offers a deterministic Classic fallback", () => {
    expect(shellMode("")).toBe("chat");
    expect(shellMode("?shell=classic")).toBe("classic");
    expect(shellMode("?shell=unknown")).toBe("chat");
  });
  it("separates pinned and recent without mutating the canonical list", () => {
    const rows = [session("recent"), session("pin", { pinned: true }), session("hidden", { trashed: true })];
    expect(chatGroups(rows, "", false)).toEqual({ pinned: [rows[1]], recent: [rows[0]] });
    expect(rows.map((row) => row.id)).toEqual(["recent", "pin", "hidden"]);
  });
  it("shows archived chats only on explicit request and searches literally", () => {
    const archived = session("old [draft]", { archived: true, pinned: true });
    expect(chatGroups([archived], "", false)).toEqual({ pinned: [], recent: [] });
    expect(chatGroups([archived], "[DRAFT]", true)).toEqual({ pinned: [], recent: [archived] });
  });
  it("orders pins and recency deterministically and handles untitled chats", () => {
    const rows = [session("a", { pinned: true, pinOrder: 2 }), session("b", { pinned: true, pinOrder: 0 })];
    expect(chatGroups(rows, "", false).pinned.map((row) => row.id)).toEqual(["b", "a"]);
    expect(chatTitle(session("x", { title: "New session" }))).toBe("New chat");
    expect(chatTitle(session("x", { title: "" }))).toBe("New chat");
  });
});
