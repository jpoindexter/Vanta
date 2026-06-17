import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMemoryStore, fsMemoryStore } from "./memory-store.js";

describe("resolveMemoryStore", () => {
  it("defaults to the fs adapter", () => {
    expect(typeof resolveMemoryStore({}).read).toBe("function");
  });

  it("throws on an unknown store", () => {
    expect(() => resolveMemoryStore({ VANTA_MEMORY_STORE: "bogus" })).toThrow(/Unknown VANTA_MEMORY_STORE/);
  });
});

describe("fsMemoryStore round-trip (temp home)", () => {
  it("writes, appends, reads root + subdir paths, and lists", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-mem-"));
    try {
      const store = fsMemoryStore({ VANTA_HOME: home });
      // root-level file (e.g. world.jsonl)
      expect(await store.read("world.jsonl")).toBeNull();
      await store.write("world.jsonl", "x");
      expect(await store.read("world.jsonl")).toBe("x");
      // subdir file (e.g. memories/5.md) — dirs auto-created
      await store.write("memories/5.md", "hello");
      await store.append("memories/5.md", " world");
      expect(await store.read("memories/5.md")).toBe("hello world");
      expect(await store.list("memories")).toContain("5.md");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
