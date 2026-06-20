import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addLearning, listLearnings, supersede, learningsPath } from "./store.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vanta-learnings-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("addLearning + listLearnings", () => {
  it("adds a learning with id + timestamps and lists it back", async () => {
    const l = await addLearning(dir, { text: "Run git from repo root", kind: "gotcha", tags: ["git"] }, 1000);
    expect(l.id).toBeTruthy();
    expect(l.createdAt).toBe(1000);
    expect(l.updatedAt).toBe(1000);
    expect(l.kind).toBe("gotcha");
    const all = await listLearnings(dir);
    expect(all).toHaveLength(1);
    expect(all[0]!.text).toBe("Run git from repo root");
  });

  it("defaults tags to [] when omitted", async () => {
    const l = await addLearning(dir, { text: "ESM uses .js imports", kind: "convention" }, 1000);
    expect(l.tags).toEqual([]);
  });

  it("returns newest-updated first", async () => {
    await addLearning(dir, { text: "older", kind: "fact" }, 1000);
    await addLearning(dir, { text: "newer", kind: "fact" }, 2000);
    const all = await listLearnings(dir);
    expect(all.map((l) => l.text)).toEqual(["newer", "older"]);
  });

  it("returns [] when the file does not exist", async () => {
    expect(await listLearnings(dir)).toEqual([]);
  });
});

describe("tolerant reader", () => {
  it("returns [] for non-JSON file content", async () => {
    await writeFile(learningsPath(dir), "not json at all {{{", "utf8");
    expect(await listLearnings(dir)).toEqual([]);
  });

  it("returns [] when the document is not an array", async () => {
    await writeFile(learningsPath(dir), JSON.stringify({ id: "x" }), "utf8");
    expect(await listLearnings(dir)).toEqual([]);
  });

  it("drops malformed entries but keeps valid ones", async () => {
    const valid = { id: "a", text: "good", kind: "fact", tags: [], createdAt: 1, updatedAt: 1 };
    const doc = [valid, { id: "b", text: "no kind", tags: [], createdAt: 1, updatedAt: 1 }, { junk: true }, 42];
    await writeFile(learningsPath(dir), JSON.stringify(doc), "utf8");
    const all = await listLearnings(dir);
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe("a");
  });

  it("latest record per id wins", async () => {
    const doc = [
      { id: "dup", text: "first", kind: "fact", tags: [], createdAt: 1, updatedAt: 1 },
      { id: "dup", text: "second", kind: "fact", tags: [], createdAt: 1, updatedAt: 5 },
    ];
    await writeFile(learningsPath(dir), JSON.stringify(doc), "utf8");
    const all = await listLearnings(dir);
    expect(all).toHaveLength(1);
    expect(all[0]!.text).toBe("second");
  });
});

describe("supersede", () => {
  it("marks a learning superseded and bumps updatedAt", async () => {
    const old = await addLearning(dir, { text: "use npm", kind: "convention" }, 1000);
    const next = await addLearning(dir, { text: "use pnpm", kind: "convention" }, 2000);
    const updated = await supersede(dir, old.id, next.id, 3000);
    expect(updated).not.toBeNull();
    expect(updated!.supersededBy).toBe(next.id);
    expect(updated!.updatedAt).toBe(3000);
    const stored = (await listLearnings(dir)).find((l) => l.id === old.id);
    expect(stored!.supersededBy).toBe(next.id);
  });

  it("returns null for an unknown id and writes nothing new", async () => {
    await addLearning(dir, { text: "x", kind: "fact" }, 1000);
    const r = await supersede(dir, "missing", "also-missing", 2000);
    expect(r).toBeNull();
    expect(await listLearnings(dir)).toHaveLength(1);
  });

  it("persists valid pretty-printed JSON", async () => {
    await addLearning(dir, { text: "x", kind: "fact" }, 1000);
    const raw = await readFile(learningsPath(dir), "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(raw).toContain("\n"); // pretty-printed
  });
});
