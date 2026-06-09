import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { globFilesTool } from "./glob-files.js";
import type { ToolContext } from "./types.js";

function makeCtx(root: string): ToolContext {
  return { root, safety: {} as ToolContext["safety"], requestApproval: async () => true };
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "glob-test-"));
  await writeFile(join(dir, "index.ts"), "");
  await writeFile(join(dir, "config.json"), "{}");
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src", "app.ts"), "");
  await writeFile(join(dir, "src", "util.ts"), "");
  await mkdir(join(dir, "src", "components"));
  await writeFile(join(dir, "src", "components", "Button.tsx"), "");
  return dir;
}

describe("globFilesTool", () => {
  it("matches TypeScript files recursively", async () => {
    const dir = await tempDir();
    const result = await globFilesTool.execute({ pattern: "**/*.ts" }, makeCtx(dir));

    expect(result.ok).toBe(true);
    expect(result.output).toContain("index.ts");
    expect(result.output).toContain("src/app.ts");
    expect(result.output).toContain("src/util.ts");
    expect(result.output).not.toContain("Button.tsx");
    expect(result.output).not.toContain("config.json");
  });

  it("matches tsx files", async () => {
    const dir = await tempDir();
    const result = await globFilesTool.execute({ pattern: "**/*.tsx" }, makeCtx(dir));

    expect(result.ok).toBe(true);
    expect(result.output).toContain("Button.tsx");
  });

  it("returns (no matches) for a non-matching pattern", async () => {
    const dir = await tempDir();
    const result = await globFilesTool.execute({ pattern: "**/*.go" }, makeCtx(dir));

    expect(result.ok).toBe(true);
    expect(result.output).toBe("(no matches)");
  });

  it("returns sorted results", async () => {
    const dir = await tempDir();
    const result = await globFilesTool.execute({ pattern: "src/**/*.ts" }, makeCtx(dir));

    expect(result.ok).toBe(true);
    const lines = result.output.split("\n");
    expect(lines).toEqual([...lines].sort());
  });

  it("searches from a custom base_path", async () => {
    const dir = await tempDir();
    const result = await globFilesTool.execute(
      { pattern: "*.ts", base_path: join(dir, "src") },
      makeCtx(dir),
    );

    expect(result.ok).toBe(true);
    expect(result.output).toContain("app.ts");
    expect(result.output).not.toContain("index.ts");
  });

  it("describeForSafety names the pattern", () => {
    expect(globFilesTool.describeForSafety?.({ pattern: "src/**/*.ts" })).toBe('glob "src/**/*.ts"');
  });

  it("rejects missing pattern arg", async () => {
    const dir = await tempDir();
    const result = await globFilesTool.execute({}, makeCtx(dir));
    expect(result.ok).toBe(false);
  });
});
