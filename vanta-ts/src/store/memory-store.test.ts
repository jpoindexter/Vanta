import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMemoryStore } from "./memory-store.js";

// The MemoryStore port + default fs+git adapter: namespaced read/write/append/
// list/exists over an isolated home (the brain+memory consumers' new seam).

describe("MemoryStore (fs-git adapter)", () => {
  let env: NodeJS.ProcessEnv;
  beforeEach(() => { env = { VANTA_HOME: mkdtempSync(join(tmpdir(), "vanta-store-")) }; });

  it("defaults to the fs-git adapter", () => {
    expect(resolveMemoryStore(env).id).toBe("fs-git");
  });

  it("round-trips write → read and reports absence as null", async () => {
    const s = resolveMemoryStore(env);
    expect(await s.read("brain", "identity.md")).toBeNull();
    await s.write("brain", "identity.md", "hello");
    expect(await s.read("brain", "identity.md")).toBe("hello");
    expect(s.exists("brain", "identity.md")).toBe(true);
  });

  it("appends and creates nested-key parents", async () => {
    const s = resolveMemoryStore(env);
    await s.append("memories", "1.md", "a");
    await s.append("memories", "1.md", "b");
    expect(await s.read("memories", "1.md")).toBe("ab");
    await s.write("brain", "archive/identity/2026.md", "old"); // nested key
    expect(await s.read("brain", "archive/identity/2026.md")).toBe("old");
  });

  it("lists a namespace and returns [] for an absent one", async () => {
    const s = resolveMemoryStore(env);
    await s.write("memories", "1.md", "x");
    await s.write("memories", "2.md", "y");
    expect((await s.list("memories")).sort()).toEqual(["1.md", "2.md"]);
    expect(await s.list("nope")).toEqual([]);
  });
});
