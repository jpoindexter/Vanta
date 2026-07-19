import { describe, expect, it } from "vitest";
import { createSessionDraftController, hasPersistableSessionDraftContext, sessionDraftKey, type DraftStorage } from "./session-drafts.js";

function memoryStorage(): DraftStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("session draft ownership", () => {
  it("does not sync the untitled cold-start draft to the session API", () => {
    expect(hasPersistableSessionDraftContext("")).toBe(false);
    expect(hasPersistableSessionDraftContext("   ")).toBe(false);
    expect(hasPersistableSessionDraftContext("task-a")).toBe(true);
  });

  it("keeps drafts with their project and session while switching", () => {
    const storage = memoryStorage();
    const drafts = createSessionDraftController(storage, "/projects/vanta", "task-a");
    drafts.update("draft for A");

    expect(drafts.activate("/projects/vanta", "task-b")).toBe("");
    drafts.update("draft for B");
    expect(drafts.activate("/projects/vanta", "task-a")).toBe("draft for A");
    expect(drafts.activate("/projects/vanta", "task-b")).toBe("draft for B");
  });

  it("restores a draft after renderer restart or crash", () => {
    const storage = memoryStorage();
    createSessionDraftController(storage, "/projects/vanta", "task-a").update("survives restart");

    expect(createSessionDraftController(storage, "/projects/vanta", "task-a").value()).toBe("survives restart");
  });

  it("does not carry a draft into a new task or another project", () => {
    const storage = memoryStorage();
    const drafts = createSessionDraftController(storage, "/projects/vanta", "task-a");
    drafts.update("stay in Vanta A");

    expect(drafts.activate("/projects/vanta", "new-task-id")).toBe("");
    expect(drafts.activate("/projects/other", "task-a")).toBe("");
    expect(drafts.activate("/projects/vanta", "task-a")).toBe("stay in Vanta A");
  });

  it("clears only the active draft after send", () => {
    const storage = memoryStorage();
    const drafts = createSessionDraftController(storage, "/projects/vanta", "task-a");
    drafts.update("send me");
    drafts.update("");

    expect(drafts.value()).toBe("");
    expect(storage.values.has(sessionDraftKey("/projects/vanta", "task-a"))).toBe(false);
  });

  it("retains recoverable archived drafts and removes permanently deleted drafts", () => {
    const storage = memoryStorage();
    const drafts = createSessionDraftController(storage, "/projects/vanta", "task-a");
    drafts.update("recover me");
    drafts.activate("/projects/vanta", "replacement-task");
    expect(drafts.activate("/projects/vanta", "task-a")).toBe("recover me");

    drafts.clear("/projects/vanta", "task-a");
    expect(drafts.activate("/projects/vanta", "task-a")).toBe("");
  });
});
