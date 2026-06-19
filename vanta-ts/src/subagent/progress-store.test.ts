import { describe, it, expect, beforeEach } from "vitest";
import { progressStore } from "./progress-store.js";

beforeEach(() => {
  for (const p of progressStore().snapshot()) progressStore().clear(p.id);
});

describe("progressStore", () => {
  it("registers a worker with no summary yet", () => {
    progressStore().register("a", "fix auth");
    const rec = progressStore().snapshot().find((p) => p.id === "a");
    expect(rec).toMatchObject({ id: "a", title: "fix auth", summary: null, updatedAt: null });
  });

  it("ignores a duplicate register (keeps the first title)", () => {
    progressStore().register("a", "first");
    progressStore().register("a", "second");
    expect(progressStore().snapshot().filter((p) => p.id === "a")).toHaveLength(1);
    expect(progressStore().snapshot()[0]?.title).toBe("first");
  });

  it("sets a summary only for a registered worker", () => {
    progressStore().setSummary("ghost", "Editing x.ts", 1);
    expect(progressStore().snapshot()).toHaveLength(0);
    progressStore().register("a", "t");
    progressStore().setSummary("a", "Editing x.ts", 5);
    expect(progressStore().snapshot()[0]).toMatchObject({ summary: "Editing x.ts", updatedAt: 5 });
  });

  it("snapshots newest-updated first", () => {
    progressStore().register("a", "a");
    progressStore().register("b", "b");
    progressStore().setSummary("a", "older", 1);
    progressStore().setSummary("b", "newer", 2);
    expect(progressStore().snapshot().map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    let calls = 0;
    const off = progressStore().subscribe(() => { calls += 1; });
    progressStore().register("a", "t");
    progressStore().setSummary("a", "Editing x.ts", 1);
    expect(calls).toBe(2);
    off();
    progressStore().clear("a");
    expect(calls).toBe(2);
  });
});
