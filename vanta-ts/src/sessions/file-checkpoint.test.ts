import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCheckpointStore } from "./file-checkpoint.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-file-cp-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("FileCheckpointStore", () => {
  it("stores at most 20 pre-edit snapshots", () => {
    const store = new FileCheckpointStore();
    for (let i = 0; i < 22; i++) {
      store.save({ path: `f-${i}.txt`, absPath: join(root, `f-${i}.txt`), content: `${i}` });
    }

    const list = store.list();
    expect(list).toHaveLength(20);
    expect(list[0]?.path).toBe("f-2.txt");
    expect(list.at(-1)?.path).toBe("f-21.txt");
  });

  it("restores previous file content by checkpoint id", async () => {
    const target = join(root, "note.txt");
    await writeFile(target, "before", "utf8");
    const store = new FileCheckpointStore();
    const id = store.save({ path: "note.txt", absPath: target, content: "before" });
    await writeFile(target, "after", "utf8");

    const restored = await store.restore(id);

    expect(restored?.id).toBe(id);
    expect(await readFile(target, "utf8")).toBe("before");
  });

  // OP-CHECKPOINT-ROLLBACK — turn-granular rollback.
  it("snapshots a file only ONCE per turn (first mutation wins → pre-turn state)", () => {
    const store = new FileCheckpointStore();
    const abs = join(root, "a.txt");
    const id1 = store.save({ path: "a.txt", absPath: abs, content: "pre-turn" });
    const id2 = store.save({ path: "a.txt", absPath: abs, content: "mid-turn" }); // same turn
    expect(id2).toBe(id1); // deduped — no second snapshot
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.content).toBe("pre-turn");
  });

  it("groups snapshots by turn and rolls back a whole turn's file mutations", async () => {
    const store = new FileCheckpointStore();
    const a = join(root, "a.txt");
    const b = join(root, "b.txt");
    await writeFile(a, "a0", "utf8");
    // Turn 1 (initial): mutate a. beginTurn advances to turn 2.
    store.save({ path: "a.txt", absPath: a, content: "a0" });
    await writeFile(a, "a1", "utf8");
    store.beginTurn();
    // Turn 2: mutate a again (pre-turn "a1") and create b (content null).
    store.save({ path: "a.txt", absPath: a, content: "a1" });
    await writeFile(a, "a2", "utf8");
    store.save({ path: "b.txt", absPath: b, content: null });
    await writeFile(b, "b-new", "utf8");

    const restored = await store.restoreTurn(); // latest turn = 2
    expect(restored.map((s) => s.path).sort()).toEqual(["a.txt", "b.txt"]);
    expect(await readFile(a, "utf8")).toBe("a1"); // a back to its turn-2 pre-state
    await expect(readFile(b, "utf8")).rejects.toThrow(); // b (created this turn) removed
  });

  it("restoreTurn on an empty store / unknown turn is a no-op", async () => {
    const store = new FileCheckpointStore();
    expect(await store.restoreTurn()).toEqual([]);
    expect(store.latestTurn()).toBeNull();
    store.save({ path: "x", absPath: join(root, "x"), content: "v" });
    expect(await store.restoreTurn(999)).toEqual([]);
  });
});
