import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchTool } from "./dispatch-tool.js";
import type { AgentDeps } from "./agent-types.js";
import type { ToolContext } from "../tools/types.js";
import type { Tool } from "../tools/types.js";
import { shellCmdTool } from "../tools/shell-cmd.js";
import { readFileTool } from "../tools/read-file.js";
import { writeFileTool } from "../tools/write-file.js";
import { editFileTool } from "../tools/edit-file.js";
import { grantAlways } from "../permissions/grant.js";

let base: string;
let root: string;
let outside: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "vanta-always-matrix-"));
  root = join(base, "project");
  outside = join(base, "elsewhere");
  await mkdir(root, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(root, "a.md"), "alpha");
  await writeFile(join(outside, "ext.md"), "external");
  vi.stubEnv("VANTA_HOME", join(base, "state"));
  for (const [key, value] of Object.entries({ VANTA_PERMISSION_MODE: "default", VANTA_OPERATING_MODE: "default", VANTA_AUTO_MODE: "0" })) vi.stubEnv(key, value);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(base, { recursive: true, force: true }); });

/** Every call is an ask from the kernel; the human never answers, so any prompt is visible as a call. */
function run(tool: Tool, args: Record<string, unknown>) {
  const requestApproval = vi.fn(async (..._args: unknown[]) => false);
  const safety = { assess: vi.fn(async () => ({ risk: "ask", needsHuman: true, reason: "routine" })), logEvent: vi.fn(), proposeApproval: async () => "id", deny: async () => {}, approve: async () => {} };
  const deps = { root, registry: { get: () => tool }, safety, requestApproval } as unknown as AgentDeps;
  const ctx = { root, safety, requestApproval } as unknown as ToolContext;
  return dispatchTool({ id: "c", name: tool.schema.name, arguments: args }, deps, ctx).then(() => requestApproval);
}

describe("after Always allow, repeated calls of the same tool do not ask again", () => {
  it("shell_cmd: different commands in the project", async () => {
    await grantAlways("shell_cmd", process.env, root);
    for (const command of ["git status", "ls -la", "echo hi > out.txt", "node -v"]) {
      const asked = await run(shellCmdTool, { command });
      expect(asked, `shell_cmd "${command}" asked again`).not.toHaveBeenCalled();
    }
  });

  it("edit_file: different files in the project", async () => {
    await grantAlways("edit_file", process.env, root);
    for (const path of ["a.md", "b.md", "sub/c.md"]) {
      const asked = await run(editFileTool, { path, old_string: "alpha", new_string: "beta" });
      expect(asked, `edit_file ${path} asked again`).not.toHaveBeenCalled();
    }
  });

  it("edit_file and write_file: paths that merely contain words like deploy, production, publish, migrate or delete", async () => {
    await grantAlways("edit_file", process.env, root);
    await grantAlways("write_file", process.env, root);
    for (const path of ["docs/deploy-guide.md", "plans/production-plan.md", "notes/publish-checklist.md", "db/migrate.md", "tmp/delete-me.md"]) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), "alpha");
      expect(await run(editFileTool, { path, old_string: "alpha", new_string: "beta" }), `edit_file ${path} asked again`).not.toHaveBeenCalled();
      expect(await run(writeFileTool, { path: `new-${path}`, content: "x" }), `write_file new-${path} asked again`).not.toHaveBeenCalled();
    }
  });

  it("an irreversible shell command still asks after Always allow, and the card says it cannot be remembered", async () => {
    await grantAlways("shell_cmd", process.env, root);
    const asked = await run(shellCmdTool, { command: "rm -rf build" });
    expect(asked).toHaveBeenCalled();
    const detail = asked.mock.calls[0]?.[3] as { canRemember?: boolean } | undefined;
    expect(detail?.canRemember, "the card must not offer Always for an action that always asks").toBe(false);
  });

  it("write_file: creating a new file and overwriting an existing one", async () => {
    await grantAlways("write_file", process.env, root);
    const created = await run(writeFileTool, { path: "new.md", content: "x" });
    expect(created, "write_file create asked again").not.toHaveBeenCalled();
    const overwritten = await run(writeFileTool, { path: "a.md", content: "y" });
    expect(overwritten, "write_file overwrite asked again").not.toHaveBeenCalled();
  });

  it("read_file: a file outside the project", async () => {
    await grantAlways("read_file", process.env, root);
    const asked = await run(readFileTool, { path: join(outside, "ext.md") });
    expect(asked, "read_file outside the project asked again").not.toHaveBeenCalled();
  });
});
