import { describe, expect, it } from "vitest";
import { groupProjectChats } from "./chat-first-projects.js";
import type { Session } from "./types.js";

const chat = (id: string, projectId?: string): Session => ({ id, title: id, updated: "2026-10-02", turns: 1, projectId });
describe("sidebar project grouping", () => {
  it("groups only recorded project associations, with unassigned chats separate", () => {
    const rows = [chat("one", "Vanta"), chat("two"), chat("three", "Vanta"), chat("four", "Another")];
    expect(groupProjectChats(rows)).toEqual({ general: [rows[1]], projects: [
      { id: "Vanta", sessions: [rows[0], rows[2]] }, { id: "Another", sessions: [rows[3]] },
    ] });
    expect(rows.map((row) => row.id)).toEqual(["one", "two", "three", "four"]);
  });
  it("treats a missing or empty association as a general chat", () => {
    expect(groupProjectChats([chat("one", "")]).projects).toEqual([]);
  });
});
