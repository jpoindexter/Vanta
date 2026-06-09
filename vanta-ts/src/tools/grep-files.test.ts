import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { grepFilesTool } from "./grep-files.js";
import type { ToolContext } from "./types.js";

function makeCtx(root: string): ToolContext {
  return { root, safety: {} as ToolContext["safety"], requestApproval: async () => true };
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "grep-test-"));
  await writeFile(join(dir, "a.ts"), "export function foo() { return 42; }\n");
  await writeFile(join(dir, "b.ts"), "const bar = 'hello world';\n");
  await mkdir(join(dir, "sub"));
  await writeFile(join(dir, "sub", "c.ts"), "// TODO: remove foo\n");
  return dir;
}

describe("grepFilesTool", () => {
  it("finds a pattern across files", async () => {
    const dir = await tempDir();
    const result = await grepFilesTool.execute({ pattern: "foo" }, makeCtx(dir));

    expect(result.ok).toBe(true);
    expect(result.output).toContain("foo");
  });

  it("returns (no matches) for a missing pattern", async () => {
    const dir = await tempDir();
    const result = await grepFilesTool.execute({ pattern: "zzz_not_there" }, makeCtx(dir));

    expect(result.ok).toBe(true);
    expect(result.output).toBe("(no matches)");
  });

  it("limits to a specific file path", async () => {
    const dir = await tempDir();
    const result = await grepFilesTool.execute(
      { pattern: "foo", path: join(dir, "b.ts") },
      makeCtx(dir),
    );

    expect(result.ok).toBe(true);
    expect(result.output).toBe("(no matches)");
  });

  it("filters by file glob", async () => {
    const dir = await tempDir();
    const result = await grepFilesTool.execute(
      { pattern: "foo", path: dir, file_glob: "*.ts" },
      makeCtx(dir),
    );

    expect(result.ok).toBe(true);
    expect(result.output).toContain("foo");
  });

  it("describeForSafety names the pattern", () => {
    expect(grepFilesTool.describeForSafety?.({ pattern: "TODO" })).toBe('grep for "TODO"');
  });

  it("rejects missing pattern arg", async () => {
    const dir = await tempDir();
    const result = await grepFilesTool.execute({}, makeCtx(dir));
    expect(result.ok).toBe(false);
  });
});
