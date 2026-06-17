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
  it("writes, appends, reads, and lists within a namespace", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-mem-"));
    try {
      const store = fsMemoryStore({ VANTA_HOME: home });
      expect(await store.read("notes", "a.md")).toBeNull();
      await store.write("notes", "a.md", "hello");
      expect(await store.read("notes", "a.md")).toBe("hello");
      await store.append("notes", "a.md", " world");
      expect(await store.read("notes", "a.md")).toBe("hello world");
      expect(await store.list("notes")).toContain("a.md");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
