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
});
