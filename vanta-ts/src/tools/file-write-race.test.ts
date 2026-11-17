import { link, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalFileCheckpointStore } from "../sessions/file-checkpoint.js";
import { editFileTool } from "./edit-file.js";
import type { Tool, ToolContext } from "./types.js";
import { writeFileTool } from "./write-file.js";

const diagnostic = vi.hoisted(() => ({ before: async () => {} }));
vi.mock("../lsp/diagnostic-note.js", () => ({
  beginDiagnosticDelta: async () => { await diagnostic.before(); return async () => ""; },
}));

let root: string;
const original = "original approved instruction\n";
const other = "different unapproved instruction\n";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-write-race-"));
  vi.stubEnv("VANTA_HOME", join(root, "home"));
  diagnostic.before = async () => {};
  globalFileCheckpointStore.clear();
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "AGENTS.md"), original);
  await writeFile(join(root, "nested/CLAUDE.md"), other);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  globalFileCheckpointStore.clear();
  await rm(root, { recursive: true, force: true });
});

function argsFor(tool: Tool, path = "AGENTS.md") {
  return tool.schema.name === "write_file"
    ? { path, content: "replacement approved instruction\n" }
    : { path, old_string: "original", new_string: "replacement" };
}

function context(approve: ToolContext["requestApproval"]): ToolContext {
  return { root, requestApproval: approve, safety: {} as ToolContext["safety"] };
}

async function replaceTarget(kind: string) {
  const target = join(root, "AGENTS.md");
  if (kind === "content") return writeFile(target, "externally changed content\n");
  if (kind === "hardlink added") return link(target, join(root, "new-alias.md"));
  await rename(target, join(root, "retained-original.md"));
  if (kind === "symlink") await symlink(join(root, "nested/CLAUDE.md"), target);
  else await writeFile(target, original);
}

describe.each([writeFileTool, editFileTool])("$schema.name approved target binding", (tool) => {
  it.each(["symlink", "regular replacement", "content", "hardlink added"])("refuses %s during approval without writing or checkpointing", async (kind) => {
    const approve = vi.fn(async () => { await replaceTarget(kind); return true; });
    const result = await tool.execute(argsFor(tool), context(approve));
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/changed|stale|replaced/i);
    expect(result.verification?.status).not.toBe("verified");
    expect(approve).toHaveBeenCalledTimes(1);
    expect(await readFile(join(root, "nested/CLAUDE.md"), "utf8")).toBe(other);
    expect(globalFileCheckpointStore.list()).toEqual([]);
    const expected = kind === "content" ? "externally changed content\n" : kind === "symlink" ? other : original;
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(expected);
  });

  it.each(["symlink", "content"])("refuses %s during the diagnostic await", async (kind) => {
    diagnostic.before = () => replaceTarget(kind);
    const result = await tool.execute(argsFor(tool), context(async () => true));
    expect(result.ok).toBe(false);
    expect(result.verification?.status).not.toBe("verified");
    expect(await readFile(join(root, "nested/CLAUDE.md"), "utf8")).toBe(other);
    expect(globalFileCheckpointStore.list()).toEqual([]);
  });

  it("denial preserves bytes and creates no checkpoint", async () => {
    const result = await tool.execute(argsFor(tool), context(async () => false));
    expect(result.ok).toBe(false);
    expect(result.effectDisposition).toBe("denied");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(original);
    expect(globalFileCheckpointStore.list()).toEqual([]);
  });

  it("refuses a replaced parent directory even if the original inode is moved back", async () => {
    const path = "nested/AGENTS.md";
    await writeFile(join(root, path), original);
    const result = await tool.execute(argsFor(tool, path), context(async () => {
      await rename(join(root, "nested"), join(root, "retained-parent"));
      await mkdir(join(root, "nested"));
      await rename(join(root, "retained-parent/AGENTS.md"), join(root, path));
      return true;
    }));
    expect(result.ok).toBe(false);
    expect(await readFile(join(root, path), "utf8")).toBe(original);
    expect(globalFileCheckpointStore.list()).toEqual([]);
  });

  it.each(["symlink", "hardlink"])("retains exact fresh approval for an existing %s alias", async (kind) => {
    const alias = join(root, "notes.txt");
    if (kind === "symlink") await symlink(join(root, "AGENTS.md"), alias);
    else await link(join(root, "AGENTS.md"), alias);
    const approve = vi.fn<ToolContext["requestApproval"]>(async () => true);
    const result = await tool.execute(argsFor(tool, "notes.txt"), context(approve));
    expect(result.ok).toBe(true);
    expect(result.verification?.status).toBe("verified");
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve.mock.calls[0]?.[3]).toMatchObject({ fresh: true });
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("replacement approved instruction\n");
    expect(globalFileCheckpointStore.list()[0]?.content).toBe(original);
    expect(result.diff?.length).toBeGreaterThan(0);
  });

  it("preserves ordinary approved writes and source checkpoints", async () => {
    await writeFile(join(root, "source.txt"), original);
    const approve = vi.fn(async () => true);
    const result = await tool.execute(argsFor(tool, "source.txt"), context(approve));
    expect(result.ok).toBe(true);
    expect(result.verification?.status).toBe("verified");
    expect(approve).toHaveBeenCalledTimes(1);
    expect(globalFileCheckpointStore.list()[0]?.content).toBe(original);
  });

  it.each(["symlink", "hardlink"])("denial retains the bytes of an existing %s alias", async (kind) => {
    const alias = join(root, "notes.txt");
    if (kind === "symlink") await symlink(join(root, "AGENTS.md"), alias);
    else await link(join(root, "AGENTS.md"), alias);
    const approve = vi.fn<ToolContext["requestApproval"]>(async () => false);
    const result = await tool.execute(argsFor(tool, "notes.txt"), context(approve));
    expect(result.ok).toBe(false);
    expect(approve.mock.calls[0]?.[3]).toMatchObject({ fresh: true });
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(original);
    expect(globalFileCheckpointStore.list()).toEqual([]);
  });
});

describe("write_file absent target binding", () => {
  it("refuses a file appearing while its creation approval is pending", async () => {
    const path = "nested/AGENTS.md";
    const result = await writeFileTool.execute(argsFor(writeFileTool, path), context(async () => {
      await writeFile(join(root, path), other);
      return true;
    }));
    expect(result.ok).toBe(false);
    expect(await readFile(join(root, path), "utf8")).toBe(other);
    expect(globalFileCheckpointStore.list()).toEqual([]);
  });

  it("creates ordinary new files and parent directories without approval", async () => {
    const approve = vi.fn(async () => true);
    const path = "new/directory/source.txt";
    const result = await writeFileTool.execute(argsFor(writeFileTool, path), context(approve));
    expect(result.ok).toBe(true);
    expect(result.verification?.status).toBe("verified");
    expect(approve).not.toHaveBeenCalled();
    expect(globalFileCheckpointStore.list()[0]?.content).toBe(null);
  });

  it.each(["", "é\n", "a longer replacement with a different byte count\n"])("writes exact UTF-8 bytes including truncation: %j", async (content) => {
    const result = await writeFileTool.execute({ path: "AGENTS.md", content }, context(async () => true));
    expect(result.ok).toBe(true);
    expect(result.verification?.status).toBe("verified");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(content);
  });
});
