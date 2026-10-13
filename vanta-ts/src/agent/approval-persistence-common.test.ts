import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchTool } from "./dispatch-tool.js";
import type { AgentDeps } from "./agent-types.js";
import type { ToolContext } from "../tools/types.js";
import { editFileTool } from "../tools/edit-file.js";
import { writeFileTool } from "../tools/write-file.js";
import { grantAlways, grantNever } from "../permissions/grant.js";
import { removeRule } from "../permissions/store.js";

let base: string;
let rootA: string;
let rootB: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "vanta-approval-common-"));
  rootA = join(base, "project-a");
  rootB = join(base, "project-b");
  for (const root of [rootA, rootB]) { await mkdir(root, { recursive: true }); await writeFile(join(root, "notes.md"), "before"); }
  vi.stubEnv("VANTA_HOME", join(base, "state"));
  for (const [key, value] of Object.entries({ VANTA_PERMISSION_MODE: "default", VANTA_OPERATING_MODE: "default", VANTA_AUTO_MODE: "0" })) vi.stubEnv(key, value);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(base, { recursive: true, force: true }); });

/** A new agent per call models a new task and a restarted process: nothing is cached in memory. */
function agent(root: string, options: { forceFresh?: boolean; tool?: "edit_file" | "write_file" } = {}) {
  const name = options.tool ?? "edit_file";
  const tool = name === "edit_file" ? editFileTool : writeFileTool;
  const requestApproval = vi.fn(async (..._args: unknown[]) => false);
  const safety = { assess: vi.fn(async () => ({ risk: "ask", needsHuman: true, reason: "routine" })), logEvent: vi.fn(), proposeApproval: async () => "id", deny: async () => {}, approve: async () => {} };
  const deps = { root, registry: { get: () => tool }, safety, requestApproval, ...(options.forceFresh ? { forceFreshApproval: () => true } : {}) } as unknown as AgentDeps;
  const ctx = { root, safety, requestApproval } as unknown as ToolContext;
  const args = (id: string) => name === "edit_file" ? { path: "notes.md", old_string: "before", new_string: id } : { path: "notes.md", content: id };
  return { requestApproval, run: (id: string) => dispatchTool({ id, name, arguments: args(id) }, deps, ctx) };
}
const contentOf = (root: string) => readFile(join(root, "notes.md"), "utf8");

describe("a saved routine rule through the shared dispatch path", () => {
  it("applies in a different task after the rule is saved for the project", async () => {
    const first = agent(rootA);
    expect((await first.run("one")).ok).toBe(false);
    expect(first.requestApproval).toHaveBeenCalledTimes(1);
    await grantAlways("edit_file", process.env, rootA);
    const second = agent(rootA);
    expect((await second.run("two")).ok).toBe(true);
    expect(second.requestApproval).not.toHaveBeenCalled();
    expect(await contentOf(rootA)).toBe("two");
  });

  it("does not apply in another project", async () => {
    await grantAlways("edit_file", process.env, rootA);
    const other = agent(rootB);
    expect((await other.run("leak")).ok).toBe(false);
    expect(other.requestApproval).toHaveBeenCalled();
    expect(await contentOf(rootB)).toBe("before");
  });

  it("stops applying once the rule is revoked", async () => {
    await grantAlways("edit_file", process.env, rootA);
    expect(await removeRule(1)).toMatchObject({ action: "allow", tool: "edit_file" });
    const after = agent(rootA);
    expect((await after.run("revoked")).ok).toBe(false);
    expect(after.requestApproval).toHaveBeenCalled();
  });

  it("applies a saved Never without prompting and leaves the file untouched", async () => {
    await grantNever("edit_file", process.env, rootA);
    const denied = agent(rootA);
    expect((await denied.run("never")).ok).toBe(false);
    expect(denied.requestApproval).not.toHaveBeenCalled();
    expect(await contentOf(rootA)).toBe("before");
  });

  it("keeps a replay on fresh approval even with a saved rule", async () => {
    await grantAlways("edit_file", process.env, rootA);
    const replay = agent(rootA, { forceFresh: true });
    expect((await replay.run("replay")).ok).toBe(false);
    expect(replay.requestApproval.mock.calls[0]?.[3]).toMatchObject({ fresh: true });
    expect(await contentOf(rootA)).toBe("before");
  });

  it("keeps the destructive overwrite approval fresh despite a saved write_file rule", async () => {
    await grantAlways("write_file", process.env, rootA);
    const overwrite = agent(rootA, { tool: "write_file" });
    expect((await overwrite.run("overwrite")).ok).toBe(false);
    expect(overwrite.requestApproval.mock.calls.at(-1)?.[3]).toMatchObject({ fresh: true });
    expect(await contentOf(rootA)).toBe("before");
  });
});
