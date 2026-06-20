import { describe, it, expect } from "vitest";
import {
  withRecorded,
  recordSent,
  lookupSent,
  readReplyStore,
  replyStorePath,
  DEFAULT_REPLY_STORE_CAP,
  type ReplyFs,
  type ReplyStoreFile,
} from "./reply-store.js";

// An in-memory ReplyFs honoring the atomic temp+rename contract — no real fs.
function memFs(): { fs: ReplyFs; files: Map<string, string>; renames: number } {
  const files = new Map<string, string>();
  let renames = 0;
  const fs: ReplyFs = {
    readFile: async (path) => {
      const v = files.get(path);
      if (v === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return v;
    },
    writeFile: async (path, data) => void files.set(path, data),
    rename: async (from, to) => {
      const v = files.get(from);
      if (v === undefined) throw new Error("no temp");
      files.set(to, v);
      files.delete(from);
      renames++;
    },
  };
  return { fs, files, renames: 0 };
}

const emptyStore = (): ReplyStoreFile => ({ version: 1, entries: [] });

describe("withRecorded (pure cap + ordering)", () => {
  it("appends a new id as the newest entry", () => {
    const next = withRecorded(emptyStore(), "m1", "hello", 10);
    expect(next.entries).toEqual([{ id: "m1", text: "hello" }]);
  });

  it("evicts the oldest entry when over the cap", () => {
    let s = emptyStore();
    s = withRecorded(s, "a", "1", 2);
    s = withRecorded(s, "b", "2", 2);
    s = withRecorded(s, "c", "3", 2);
    expect(s.entries.map((e) => e.id)).toEqual(["b", "c"]); // "a" dropped
  });

  it("re-recording an id moves it to newest without duplicating", () => {
    let s = emptyStore();
    s = withRecorded(s, "a", "1", 5);
    s = withRecorded(s, "b", "2", 5);
    s = withRecorded(s, "a", "1-updated", 5);
    expect(s.entries).toEqual([
      { id: "b", text: "2" },
      { id: "a", text: "1-updated" },
    ]);
  });
});

describe("recordSent / lookupSent (atomic store roundtrip)", () => {
  it("records a sent id atomically and looks it up", async () => {
    const m = memFs();
    const deps = { fs: m.fs, dir: "/data" };
    await recordSent(deps, "msg-7", "the bot reply");
    expect(await lookupSent(deps, "msg-7")).toBe("the bot reply");
    // committed to the real path, no leftover temp file
    expect(m.files.has(replyStorePath("/data"))).toBe(true);
    expect([...m.files.keys()].some((k) => k.endsWith(".tmp"))).toBe(false);
  });

  it("returns null on a lookup miss (degrade, never throw)", async () => {
    const m = memFs();
    expect(await lookupSent({ fs: m.fs, dir: "/data" }, "absent")).toBeNull();
  });

  it("ignores a blank id on record and lookup", async () => {
    const m = memFs();
    const deps = { fs: m.fs, dir: "/data" };
    await recordSent(deps, "", "ignored");
    expect(m.files.size).toBe(0);
    expect(await lookupSent(deps, "")).toBeNull();
  });

  it("caps the persisted store so it can't grow unbounded", async () => {
    const m = memFs();
    const deps = { fs: m.fs, dir: "/data", cap: 3 };
    for (const i of [1, 2, 3, 4, 5]) await recordSent(deps, `m${i}`, `t${i}`);
    const store = await readReplyStore(deps);
    expect(store.entries.map((e) => e.id)).toEqual(["m3", "m4", "m5"]);
    expect(await lookupSent(deps, "m1")).toBeNull();
  });

  it("swallows a write failure (best-effort, never breaks send)", async () => {
    const failing: ReplyFs = {
      readFile: async () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); },
      writeFile: async () => { throw new Error("disk full"); },
      rename: async () => {},
    };
    await expect(recordSent({ fs: failing, dir: "/data" }, "m1", "x")).resolves.toBeUndefined();
  });

  it("tolerates a corrupt store file (treats as empty)", async () => {
    const m = memFs();
    m.files.set(replyStorePath("/data"), "{not json");
    const deps = { fs: m.fs, dir: "/data" };
    expect((await readReplyStore(deps)).entries).toEqual([]);
    await recordSent(deps, "m1", "fresh");
    expect(await lookupSent(deps, "m1")).toBe("fresh");
  });

  it("defaults to a 200-entry cap when unspecified", () => {
    expect(DEFAULT_REPLY_STORE_CAP).toBe(200);
  });
});
