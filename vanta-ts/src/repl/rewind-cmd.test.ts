import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HANDLERS } from "./handlers.js";
import { globalFileCheckpointStore } from "../sessions/file-checkpoint.js";
import type { ReplCtx } from "./types.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-rewind-"));
  globalFileCheckpointStore.clear();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  globalFileCheckpointStore.clear();
});

function ctx(): ReplCtx {
  return { dataDir: join(root, ".vanta") } as unknown as ReplCtx;
}

describe("/rewind", () => {
  it("lists recent file checkpoints when no id is given", async () => {
    globalFileCheckpointStore.save({ path: "a.txt", absPath: join(root, "a.txt"), content: "old" });

    const result = await HANDLERS.rewind!("", ctx());

    expect(result.output).toContain("fc-1");
    expect(result.output).toContain("a.txt");
  });

  it("restores a file checkpoint by id", async () => {
    const target = join(root, "a.txt");
    await writeFile(target, "old", "utf8");
    const id = globalFileCheckpointStore.save({ path: "a.txt", absPath: target, content: "old" });
    await writeFile(target, "new", "utf8");

    const result = await HANDLERS.rewind!(id, ctx());

    expect(result.output).toContain("restored");
    expect(await readFile(target, "utf8")).toBe("old");
  });
});
