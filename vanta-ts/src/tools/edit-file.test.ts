import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { editFileTool } from "./edit-file.js";
import type { ToolContext } from "./types.js";

function makeCtx(root: string, approve = true): ToolContext {
  return {
    root,
    safety: {} as ToolContext["safety"],
    requestApproval: async () => approve,
  };
}

async function tempFile(dir: string, name: string, content: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, content, "utf8");
  return path;
}

describe("editFileTool", () => {
  it("replaces a unique string in-place", async () => {
    const dir = await mkdtemp(join(tmpdir(), "edit-test-"));
    await tempFile(dir, "a.ts", "const x = 1;\nconst y = 2;\n");
    const ctx = makeCtx(dir);

    const result = await editFileTool.execute(
      { path: join(dir, "a.ts"), old_string: "const x = 1;", new_string: "const x = 42;" },
      ctx,
    );

    expect(result.ok).toBe(true);
    const after = await readFile(join(dir, "a.ts"), "utf8");
    expect(after).toBe("const x = 42;\nconst y = 2;\n");
  });

  it("fails when old_string is not found", async () => {
    const dir = await mkdtemp(join(tmpdir(), "edit-test-"));
    await tempFile(dir, "b.ts", "hello world");
    const ctx = makeCtx(dir);

    const result = await editFileTool.execute(
      { path: join(dir, "b.ts"), old_string: "missing text", new_string: "x" },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toContain("not found");
  });

  it("fails when old_string appears more than once and replace_all is not set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "edit-test-"));
    await tempFile(dir, "c.ts", "foo foo foo");
    const ctx = makeCtx(dir);

    const result = await editFileTool.execute(
      { path: join(dir, "c.ts"), old_string: "foo", new_string: "bar" },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toContain("more than once");
  });

  it("replaces all occurrences when replace_all is true", async () => {
    const dir = await mkdtemp(join(tmpdir(), "edit-test-"));
    await tempFile(dir, "d.ts", "foo foo foo");
    const ctx = makeCtx(dir);

    const result = await editFileTool.execute(
      { path: join(dir, "d.ts"), old_string: "foo", new_string: "bar", replace_all: true },
      ctx,
    );

    expect(result.ok).toBe(true);
    const after = await readFile(join(dir, "d.ts"), "utf8");
    expect(after).toBe("bar bar bar");
  });

  it("returns denied when approval is refused", async () => {
    const dir = await mkdtemp(join(tmpdir(), "edit-test-"));
    await tempFile(dir, "e.ts", "hello world");
    const ctx = makeCtx(dir, false);

    const result = await editFileTool.execute(
      { path: join(dir, "e.ts"), old_string: "hello", new_string: "bye" },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toContain("denied");
  });

  it("describeForSafety names the file path", () => {
    expect(editFileTool.describeForSafety?.({ path: "src/foo.ts" })).toBe("edit file src/foo.ts");
  });
});
