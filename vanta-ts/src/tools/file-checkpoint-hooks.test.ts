import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editFileTool } from "./edit-file.js";
import { writeFileTool } from "./write-file.js";
import { globalFileCheckpointStore } from "../sessions/file-checkpoint.js";
import type { ToolContext } from "./types.js";

let root: string;

function ctx(): ToolContext {
  return {
    root,
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-file-hook-"));
  globalFileCheckpointStore.clear();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  globalFileCheckpointStore.clear();
});

describe("file checkpoint hooks", () => {
  it("write_file snapshots pre-overwrite content for /rewind", async () => {
    await writeFile(join(root, "exists.txt"), "original", "utf8");
    await writeFileTool.execute({ path: "exists.txt", content: "changed" }, ctx());
    const id = globalFileCheckpointStore.list().at(-1)?.id;

    expect(id).toBeDefined();
    await globalFileCheckpointStore.restore(id ?? "");
    expect(await readFile(join(root, "exists.txt"), "utf8")).toBe("original");
  });

  it("edit_file snapshots pre-edit content for /rewind", async () => {
    await writeFile(join(root, "edit.txt"), "hello old world", "utf8");
    const res = await editFileTool.execute(
      { path: "edit.txt", old_string: "old", new_string: "new" },
      ctx(),
    );
    const id = globalFileCheckpointStore.list().at(-1)?.id;

    expect(res.ok).toBe(true);
    expect(id).toBeDefined();
    await globalFileCheckpointStore.restore(id ?? "");
    expect(await readFile(join(root, "edit.txt"), "utf8")).toBe("hello old world");
  });
});
