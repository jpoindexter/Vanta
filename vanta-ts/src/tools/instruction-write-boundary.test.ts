import { createHash } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchTool } from "../agent/dispatch-tool.js";
import type { AgentDeps } from "../agent.js";
import { grantAlways } from "../permissions/grant.js";
import { editFileTool } from "./edit-file.js";
import { projectPathPolicy } from "./project-security-path.js";
import type { Tool, ToolContext } from "./types.js";
import { writeFileTool } from "./write-file.js";

let root: string;
let callNumber = 0;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-instruction-write-"));
  vi.stubEnv("VANTA_HOME", join(root, "home"));
  vi.stubEnv("VANTA_PERMISSION_MODE", "fullAccess");
  vi.stubEnv("VANTA_OPERATING_MODE", "fullAccess");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

function dispatch(tool: Tool, args: Record<string, unknown>, approve = false) {
  const requestApproval = vi.fn(async () => approve);
  const safety = {
    assess: async () => ({ risk: "allow", reason: "fixture allows ordinary writes" }),
    proposeApproval: async () => "fixture-approval",
    approve: async () => {}, deny: async () => {}, logEvent: async () => {},
  };
  const deps = { registry: { get: () => tool }, safety, requestApproval, onToolResult: () => {} } as unknown as AgentDeps;
  const ctx = { root, safety, requestApproval } as unknown as ToolContext;
  return { requestApproval, result: dispatchTool({ id: `instruction-test-${++callNumber}`, name: tool.schema.name, arguments: args }, deps, ctx) };
}

describe("standing instruction writes stay fresh under full access", () => {
  it.each(["AGENTS.md", "nested/CLAUDE.md", "nested/VANTA.md", "nested/aGeNtS.Md", "skills/research/SKILL.md", "SOUL.md", "PROGRAM.md", "MEMORY.md", ".claude/agents/research.md", ".claude/settings.json"])("denial leaves %s absent", async (path) => {
    const run = dispatch(writeFileTool, { path, content: "Standing instruction fixture.\n" });
    expect((await run.result).ok).toBe(false);
    expect(run.requestApproval).toHaveBeenCalledTimes(1);
    await expect(readFile(join(root, path), "utf8")).rejects.toThrow();
  });

  it("edit denial retains original bytes rather than consuming full-access authority", async () => {
    await writeFile(join(root, "AGENTS.md"), "original instruction\n");
    const run = dispatch(editFileTool, { path: "AGENTS.md", old_string: "original", new_string: "replacement" });
    expect((await run.result).ok).toBe(false);
    expect(run.requestApproval).toHaveBeenCalledTimes(1);
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("original instruction\n");
  });

  it.each(["symlink", "hard link"])("an ordinary-named %s cannot hide an instruction target", async (kind) => {
    const target = join(root, "nested/AGENTS.md");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, "original instruction\n");
    const alias = join(root, "notes.txt");
    if (kind === "symlink") await symlink(target, alias);
    else await link(target, alias);
    const run = dispatch(writeFileTool, { path: "notes.txt", content: "changed\n" });
    expect((await run.result).ok).toBe(false);
    expect(run.requestApproval).toHaveBeenCalledTimes(1);
    expect(await readFile(target, "utf8")).toBe("original instruction\n");
  });

  it("one approved write previews resolved target, scope, bytes and hash, never the body", async () => {
    const path = "nested/AGENTS.md";
    const content = "private fixture instruction é\n";
    const run = dispatch(writeFileTool, { path, content }, true);
    expect((await run.result).ok).toBe(true);
    expect(run.requestApproval).toHaveBeenCalledTimes(1);
    const request = JSON.stringify(run.requestApproval.mock.calls);
    expect(request).toContain(join(root, path));
    expect(request).toContain(`${Buffer.byteLength(content)} bytes`);
    expect(request).toContain(createHash("sha256").update(content).digest("hex"));
    expect(request).toContain("fresh");
    expect(request).toContain("scope");
    expect(request).not.toContain(content.trim());
    expect(await readFile(join(root, path), "utf8")).toBe(content);
    const receipt = await readFile(join(root, ".vanta/approvals.jsonl"), "utf8");
    expect(receipt).not.toContain(content.trim());
  });

  it("ordinary source creation retains routine full-access behavior", async () => {
    const run = dispatch(writeFileTool, { path: "src/component.ts", content: "export const value = 1;\n" });
    expect((await run.result).ok).toBe(true);
    expect(run.requestApproval).not.toHaveBeenCalled();
    expect(projectPathPolicy(join(root, "src/agents.ts"), root)).toEqual({ kind: "ordinary" });
  });

  it.each(["fullAccess", "auto", "acceptEdits"])("%s and a persisted Always rule cannot reuse previous instruction approval", async (mode) => {
    vi.stubEnv("VANTA_PERMISSION_MODE", mode);
    vi.stubEnv("VANTA_OPERATING_MODE", mode);
    await grantAlways("write_file");
    const approved = dispatch(writeFileTool, { path: "AGENTS.md", content: "first approved instruction\n" }, true);
    expect((await approved.result).ok).toBe(true);
    expect(approved.requestApproval).toHaveBeenCalledTimes(1);
    const later = dispatch(writeFileTool, { path: "AGENTS.md", content: "different unapproved instruction\n" });
    expect((await later.result).ok).toBe(false);
    expect(later.requestApproval).toHaveBeenCalledTimes(1);
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("first approved instruction\n");
  });
});
