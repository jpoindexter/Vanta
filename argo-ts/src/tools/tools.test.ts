import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRegistry } from "./index.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { shellCmdTool } from "./shell-cmd.js";
import type { ToolContext } from "./types.js";

let root: string;

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    root,
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
    ...overrides,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "argo-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("registry", () => {
  it("registers the four core tools and exposes schemas", () => {
    const r = buildRegistry();
    const names = r.schemas().map((s) => s.name).sort();
    expect(names).toEqual(["inspect_state", "read_file", "shell_cmd", "write_file"]);
  });
});

describe("read_file", () => {
  it("reads a file inside scope", async () => {
    await writeFile(join(root, "hello.txt"), "world");
    const res = await readFileTool.execute({ path: "hello.txt" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toBe("world");
  });

  it("refuses a path outside scope", async () => {
    const res = await readFileTool.execute({ path: "../../etc/passwd" }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("outside project scope");
  });
});

describe("write_file", () => {
  it("writes a new file without approval", async () => {
    const res = await writeFileTool.execute(
      { path: "new.txt", content: "data" },
      ctx(),
    );
    expect(res.ok).toBe(true);
    expect(await readFile(join(root, "new.txt"), "utf8")).toBe("data");
  });

  it("requires approval to overwrite, and respects denial", async () => {
    await writeFile(join(root, "exists.txt"), "original");
    const res = await writeFileTool.execute(
      { path: "exists.txt", content: "changed" },
      ctx({ requestApproval: async () => false }),
    );
    expect(res.ok).toBe(false);
    expect(await readFile(join(root, "exists.txt"), "utf8")).toBe("original");
  });

  it("overwrites when approved", async () => {
    await writeFile(join(root, "exists.txt"), "original");
    const res = await writeFileTool.execute(
      { path: "exists.txt", content: "changed" },
      ctx({ requestApproval: async () => true }),
    );
    expect(res.ok).toBe(true);
    expect(await readFile(join(root, "exists.txt"), "utf8")).toBe("changed");
  });
});

describe("shell_cmd", () => {
  it("runs a command and returns output", async () => {
    const res = await shellCmdTool.execute({ command: "echo hi" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toContain("hi");
  });

  it("refuses a destructive command locally", async () => {
    const res = await shellCmdTool.execute({ command: "rm -rf /" }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("destructive");
  });
});
