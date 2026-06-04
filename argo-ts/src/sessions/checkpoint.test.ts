import { describe, it, expect } from "vitest";
import { CheckpointStore } from "./checkpoint.js";
import type { Message } from "../types.js";

const msg = (content: string): Message => ({ role: "user", content });

describe("CheckpointStore", () => {
  it("starts empty", () => {
    const s = new CheckpointStore();
    expect(s.count()).toBe(0);
    expect(s.latest()).toBeNull();
    expect(s.rollback()).toBeNull();
  });

  it("saves and retrieves a checkpoint", () => {
    const s = new CheckpointStore();
    const messages = [msg("hello")];
    const id = s.save("before risky op", messages, 1, "2026-06-04T00:00:00Z");
    expect(id).toBe("cp-1");
    expect(s.count()).toBe(1);
    const cp = s.latest();
    expect(cp?.label).toBe("before risky op");
    expect(cp?.turnIndex).toBe(1);
  });

  it("rollback pops and returns the last checkpoint", () => {
    const s = new CheckpointStore();
    s.save("first", [msg("a")], 0);
    s.save("second", [msg("b")], 1);
    const cp = s.rollback();
    expect(cp?.label).toBe("second");
    expect(s.count()).toBe(1);
  });

  it("snapshots are independent copies (not references)", () => {
    const s = new CheckpointStore();
    const messages: Message[] = [msg("original")];
    s.save("snap", messages, 0);
    messages.push(msg("added after save"));
    const cp = s.latest();
    expect(cp?.messages.length).toBe(1);
  });

  it("list returns metadata without messages", () => {
    const s = new CheckpointStore();
    s.save("a", [], 0);
    s.save("b", [], 1);
    const list = s.list();
    expect(list.length).toBe(2);
    expect((list[0] as Record<string, unknown>).messages).toBeUndefined();
    expect(list[0]?.label).toBe("a");
  });
});
